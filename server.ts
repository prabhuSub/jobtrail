// JobTrail: live view of what every Claude Code chat is running, on this Mac and (optionally) one more Mac over ssh.
// One `ps` per poll per machine; the remote Mac is reached over a single ssh ControlMaster connection.
// Settings: ~/.jobtrail/config.json (see config.example.json) or JOBTRAIL_* environment variables.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import { demoSnapshot, demoHistory, demoDetail, demoPreview, demoFile } from "./demo.ts";
const DEMO = !!process.env.JOBTRAIL_DEMO; // made-up chats and jobs: try it or take screenshots without real sessions

const HOME = homedir();
const PORT = Number(process.env.JOBTRAIL_PORT ?? 4791);
const DATA = join(HOME, ".jobtrail");
mkdirSync(DATA, { recursive: true });
const HIST_FILE = join(DATA, "history.json");
const PUBLIC = join(import.meta.dir, "public");
type Device = "laptop" | "desktop";
type Conf = { local?: { name?: string; device?: Device }; remote?: { host?: string; name?: string; device?: Device } | null; progressFile?: string };
let conf: Conf = {};
try { conf = JSON.parse(readFileSync(join(DATA, "config.json"), "utf8")); } catch {}
const hasBattery = (() => { try { return Bun.spawnSync(["/usr/bin/pmset", "-g", "batt"]).stdout.toString().includes("InternalBattery"); } catch { return false; } })();
const computerName = (() => { try { return Bun.spawnSync(["/usr/sbin/scutil", "--get", "ComputerName"]).stdout.toString().trim(); } catch { return ""; } })();
const LOCAL = { name: process.env.JOBTRAIL_LOCAL_NAME ?? conf.local?.name ?? (computerName || "This Mac"), device: conf.local?.device ?? (hasBattery ? "laptop" : "desktop") as Device };
const REMOTE_HOST = process.env.JOBTRAIL_REMOTE ?? conf.remote?.host ?? "";
const REMOTE = { name: process.env.JOBTRAIL_REMOTE_NAME ?? conf.remote?.name ?? REMOTE_HOST, device: conf.remote?.device ?? "desktop" as Device };
// optional: a JSON file with {machines:[{name, job, state}]} shown as "declared" next to what is observed
const PROGRESS = process.env.JOBTRAIL_PROGRESS ?? conf.progressFile?.replace(/^~/, HOME) ?? "";
const SSH = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-o", "ControlMaster=auto",
  "-o", `ControlPath=${DATA}/cm-%C`, "-o", "ControlPersist=600", "-o", "ServerAliveInterval=15", REMOTE_HOST];

type MachineId = "local" | "remote";
type Proc = { pid: number; ppid: number; etime: number; cpu: number; rss: number; cmd: string };
type Job = {
  id: string; machine: MachineId; pid: number; startedAt: number; endedAt?: number;
  state: "running" | "waiting" | "done" | "failed" | "ended";
  kind: "job" | "service"; label: string; step?: string; command: string; mainCmd: string;
  cpu: number; rss: number; pids: { pid: number; cmd: string; cpu: number; rss: number }[];
  caffeinated: boolean; waitingOn?: number; log?: string; chat?: Chat; cwd?: string;
  ppid?: number;          // parent of the job's root process (1 = its launcher is gone)
  orphan?: boolean;       // no chat and no living parent
  stale?: boolean;        // idle (< 1% CPU) for 6 h or more
  outs?: { path: string; mtime: number; size: number }[]; tail?: string[];
};
type Chat = { sessionId?: string; title: string; status?: string; cwd?: string; via: "process" | "transcript" | "none" };
type MachineState = { id: MachineId; name: string; device: Device; host: string; online: boolean; error?: string; gpu?: number; memFree?: number; load?: string; polledAt?: number; battery?: number; charging?: boolean };

// ---------- shell helpers ----------
async function run(argv: string[], timeoutMs = 10000): Promise<{ ok: boolean; out: string; err: string }> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, PATH: `${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` } });
  const t = setTimeout(() => p.kill(9), timeoutMs);
  // A child of the shell can keep the pipes open after the shell is killed (seen when the Mac is heavily loaded),
  // which used to leave this waiting forever and froze that Mac on the map. Give up a little after the timeout.
  let give: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<null>((r) => { give = setTimeout(() => r(null), timeoutMs + 3000); });
  const done = Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  const res = await Promise.race([done, gaveUp]);
  clearTimeout(t); clearTimeout(give);
  if (!res) return { ok: false, out: "", err: "timed out" };
  const [out, err, code] = res;
  return { ok: code === 0, out, err };
}
const sh = (machine: MachineId, script: string, timeoutMs?: number) => {
  const s = `: jobtrail; ${script}`; // marker so our own probes never show up as jobs
  return machine === "local" ? run(["/bin/sh", "-c", s], timeoutMs) : run([...SSH, s], timeoutMs);
};
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const POLL = `echo "@@NOW $(date +%s)"; echo "@@GPU $(ioreg -r -d 1 -c IOAccelerator 2>/dev/null | grep -o '"Device Utilization %"=[0-9]*' | head -1 | cut -d= -f2)"; echo "@@MEM $(memory_pressure -Q 2>/dev/null | grep -o '[0-9]*%' | tail -1)"; echo "@@LOAD $(sysctl -n vm.loadavg)"; echo "@@BATT $(pmset -g batt 2>/dev/null | grep -Eo '[0-9]+%; [a-zA-Z ]+' | head -1)"; ps -ww -U $(id -u) -o pid=,ppid=,etime=,pcpu=,rss=,command=`;

function parseEtime(s: string) {
  let days = 0, rest = s;
  if (s.includes("-")) { const [d, r] = s.split("-"); days = Number(d); rest = r; }
  return days * 86400 + rest.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
}
function parsePoll(text: string) {
  const meta: Record<string, string> = {}; const procs = new Map<number, Proc>();
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) { const [k, ...v] = line.slice(2).split(" "); meta[k] = v.join(" ").trim(); continue; }
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (m) procs.set(+m[1], { pid: +m[1], ppid: +m[2], etime: parseEtime(m[3]), cpu: +m[4], rss: +m[5], cmd: m[6].replace(/\\012/g, "\n") });
  }
  return { meta, procs };
}

// ---------- understanding commands ----------
const CLAUDE_SHELL = /shell-snapshots\/snapshot-/;
const EXCLUDE = /^\/(Applications|System)\/|^\/usr\/(libexec|sbin)\/|Library\/Application Support\/|Claude\.app|claude-code|@@NOW|jobtrail|pulse\.ts|blender-mcp|\bmcp\b|\/hooks\/[\w.-]+\.(py|ts|sh)\b/;
const HEAVY = /^(python[\d.]*|Python|ffmpeg|ffprobe|blender|Blender|bun|node|caffeinate|bash|sh|zsh|uv|swift|whisper[\w-]*|mlx[\w_-]*|ltx[\w-]*|torchrun|accelerate|huggingface-cli|hf|curl|wget|rsync|aria2c)$/;
const SERVICE = /serve(r)?\.(ts|js|mjs|py)\b|http\.server|uvicorn|\bvite\b|next dev|--port\b/;

const argv0 = (cmd: string) => basename(cmd.trim().split(/\s+/)[0] ?? "");
function isShellC(cmd: string) { return /^(\S*\/)?(ba|z)?sh\s+(-\w+\s+)*-c\b/.test(cmd.trim()); }
function isHeavy(cmd: string) {
  const a = argv0(cmd);
  if (!HEAVY.test(a)) return false;
  if (/^(ba|z)?sh$/.test(a)) return isShellC(cmd);
  if (a === "caffeinate") return cmd.trim().split(/\s+/).some((w, i) => i > 0 && !w.startsWith("-"));
  return true;
}
// The command a Claude Code Bash call actually ran (inside its zsh wrapper).
function claudeInner(cmd: string) {
  const i = cmd.indexOf("&& eval '");
  if (i < 0) return cmd;
  let s = cmd.slice(i + 9);
  s = s.replace(/'\s*(&&|\n|;)\s*pwd -P[\s\S]*$/, "").replace(/'\s*$/, "");
  return s.replace(/'"'"'/g, "'").replace(/'\\''/g, "'");
}
function shellScript(cmd: string) {
  const c = claudeInner(cmd);
  if (c !== cmd) return c;
  const m = cmd.match(/^(?:\S*\/)?(?:ba|z)?sh\s+(?:-\w+\s+)*-c\s+([\s\S]*)$/);
  return m ? m[1] : cmd;
}
function splitSteps(script: string) {
  const out: string[] = []; let cur = "", sq = false, dq = false, depth = 0;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (ch === "'" && !dq) sq = !sq; else if (ch === '"' && !sq) dq = !dq;
    if (!sq && !dq) {
      if (ch === "{" || ch === "(") depth++; if (ch === "}" || ch === ")") depth--;
      if (depth <= 0 && (ch === ";" || ch === "\n" || (ch === "&" && script[i + 1] === "&"))) {
        if (ch === "&") i++; out.push(cur.trim()); cur = ""; continue;
      }
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.map((s) => s.replace(/^(do|then|else)\s+/, "").trim())
    .filter((s) => s && !/^(cd|echo|export|source|set|sleep|true|done|do|then|fi|wait|date|for|if)\b/.test(s));
}
const tilde = (s: string) => s.split(HOME).join("~");
function label(cmd: string) {
  const c = claudeInner(cmd).replace(/^(nohup|caffeinate(\s+-\w+)*|exec|time)\s+/g, "").trim();
  const script = c.match(/(\S+\.(py|ts|sh|js|mjs))\b/);
  const words = c.split(/\s+/);
  const paths = words.filter((w) => w.includes("/") && !w.startsWith("-")).map((w) => w.replace(/^["']|["']$/g, ""));
  const tail = (p: string) => p.split("/").filter(Boolean).slice(-1)[0] ?? p;
  if (script) {
    const sname = basename(script[1]);
    const after = c.slice(c.indexOf(script[1]) + script[1].length).trim().split(/\s+/);
    const sub = after[0] && /^[a-z][\w-]*$/.test(after[0]) ? ` ${after[0]}` : "";
    const target = paths.find((p) => !p.endsWith(script[1]) && !/\/(bin|ai)\/python|\.app\/|Frameworks/.test(p));
    return `${sname}${sub}${target ? ` · ${tail(target)}` : ""}`;
  }
  const a = argv0(c);
  if (a === "ffmpeg") return `ffmpeg → ${tail(words[words.length - 1] ?? "")}`;
  return tilde(c).replace(/\s+/g, " ").slice(0, 90);
}
const pathTokens = (cmd: string) => [...new Set((claudeInner(cmd).match(/[~\w.\-]*\/[\w.\-\/]+/g) ?? [])
  .map((p) => p.split("/").filter(Boolean).slice(-2).join("/"))
  .filter((p) => p.length >= 8 && !/^(bin|ai|acestep15)\/|python|\/dev\/null|^tmp\//.test(p)))]
  .sort((a, b) => b.length - a.length);

// ---------- chats ----------
type SessionInfo = { sessionId: string; title: string; status?: string; cwd?: string; pid?: number };
let livePids = new Map<number, SessionInfo>();
let titles = new Map<string, string>();
let titlesAt = 0;
function loadSessions() {
  const dir = join(HOME, ".claude/sessions"); const m = new Map<number, SessionInfo>();
  try {
    for (const f of readdirSync(dir)) if (f.endsWith(".json")) {
      try { const j = JSON.parse(readFileSync(join(dir, f), "utf8")); m.set(j.pid, { sessionId: j.sessionId, title: j.name, status: j.status, cwd: j.cwd, pid: j.pid }); } catch {}
    }
  } catch {}
  livePids = m;
  if (Date.now() - titlesAt > 30000) {
    titlesAt = Date.now();
    const root = join(HOME, "Library/Application Support/Claude/claude-code-sessions");
    const walk = (d: string, depth: number) => {
      try {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (f.endsWith(".json")) { try { const j = JSON.parse(readFileSync(p, "utf8")); if (j.cliSessionId && j.title) titles.set(j.cliSessionId, j.title); } catch {} }
          else if (depth < 3) walk(p, depth + 1);
        }
      } catch {}
    };
    walk(root, 0);
  }
}
function chatFor(sessionId: string, via: Chat["via"]): Chat {
  const live = [...livePids.values()].find((s) => s.sessionId === sessionId);
  return { sessionId, title: titles.get(sessionId) ?? live?.title ?? sessionId.slice(0, 8), status: live?.status, cwd: live?.cwd, via };
}
const transcriptCache = new Map<string, { chat?: Chat; at: number }>();
async function chatFromTranscripts(job: Job): Promise<Chat | undefined> {
  const hit = transcriptCache.get(job.id);
  if (hit && (hit.chat || Date.now() - hit.at < 30000)) return hit.chat;
  const toks = pathTokens(job.command).slice(0, 4);
  // the command's own opening text, as a transcript stores it (JSON-escaped): the strongest evidence
  const fp = JSON.stringify(job.command.trim().slice(0, 48)).slice(1, -1);
  const projects = join(HOME, ".claude/projects"); const files: string[] = [];
  try {
    for (const d of readdirSync(projects)) {
      const pd = join(projects, d);
      try { for (const f of readdirSync(pd)) if (f.endsWith(".jsonl")) { const p = join(pd, f); if (Date.now() - statSync(p).mtimeMs < 4 * 86400e3) files.push(p); } } catch {}
    }
  } catch {}
  // score = distinct tokens found inside a Bash "command" issued before the job started; tie-break = latest such command
  const score = new Map<string, { n: number; ts: number }>();
  const limit = job.startedAt + 120000;
  for (const f of files) {
    let text: string;
    try { text = await Bun.file(f).text(); } catch { continue; }
    let n = 0, ts = 0;
    for (const t of toks) {
      let i = text.indexOf(t), found = false;
      while (i >= 0) {
        const back = text.lastIndexOf('"command":"', i);
        if (back >= 0 && i - back < 20000 && !/[^\\]"/.test(text.slice(back + 11, i))) {
          const ls = text.lastIndexOf("\n", i) + 1, le = text.indexOf("\n", i);
          const m = text.slice(ls, le < 0 ? undefined : le).match(/"timestamp":"([^"]+)"/);
          const t2 = m ? Date.parse(m[1]) : 0;
          if (t2 && t2 <= limit) { found = true; ts = Math.max(ts, t2); }
        }
        i = text.indexOf(t, i + t.length);
      }
      if (found) n++;
    }
    if (fp.length >= 16 && text.includes(fp)) n += 10;
    if (n) score.set(f, { n, ts });
  }
  let best: string | undefined, bs = 0, bt = 0;
  for (const [f, v] of score) if (v.n > bs || (v.n === bs && v.ts > bt)) { best = f; bs = v.n; bt = v.ts; }
  // one shared path is not enough (it pinned unrelated jobs to whichever chat mentioned that path):
  // need the command itself, or at least two of its paths
  const chat = best && bs >= 2 ? chatFor(basename(best, ".jsonl"), "transcript") : undefined;
  transcriptCache.set(job.id, { chat, at: Date.now() });
  return chat;
}

// ---------- jobs ----------
const machines: Partial<Record<MachineId, MachineState>> = {
  local: { id: "local", name: LOCAL.name, device: LOCAL.device, host: "this Mac", online: true },
  ...(REMOTE_HOST ? { remote: { id: "remote", name: REMOTE.name, device: REMOTE.device, host: `ssh ${REMOTE_HOST}`, online: false } } : {}),
};
let live = new Map<string, Job>();
let history: Job[] = [];
try { history = JSON.parse(readFileSync(HIST_FILE, "utf8")); } catch {}
for (const j of history as any[]) { if (j.machine === "macbook") j.machine = "local"; else if (j.machine === "mini") j.machine = "remote"; j.id = String(j.id).replace(/^macbook:/, "local:").replace(/^mini:/, "remote:"); }
const logCache = new Map<string, string | null>();
const HIST_DAYS = 30;

// folders/files a command names that may hold its outputs
function outDirs(command: string) {
  return [...new Set((command.match(/(~|\/)[\w.\-\/]+/g) ?? []).map((p) => p.replace(/^~/, HOME).replace(/^\/+/, "/")))]
    .filter((p) => !/\/(bin|ai)\/|\.py$|\.ts$|\.txt$|\.sh$|\/dev\/|^\/(usr|opt|System|Applications)\//.test(p)).slice(0, 8);
}
const outsLs = (dirs: string[], n: number) => `for d in ${dirs.length ? dirs.map(q).join(" ") : "/nonexistent"}; do if [ -d "$d" ]; then ls -1t "$d" 2>/dev/null | head -${n} | while read f; do stat -f "%m %z $d/$f" "$d/$f"; done; elif [ -f "$d" ]; then stat -f "%m %z $d" "$d"; fi; done 2>/dev/null`;
const parseOuts = (txt: string) => txt.split("\n").filter(Boolean).map((l) => { const [mt, sz, ...p] = l.split(" "); return { path: tilde(p.join(" ")), mtime: +mt * 1000, size: +sz }; })
  .filter((o) => o.mtime > 0).sort((a, b) => b.mtime - a.mtime);
// newest output files of every live job: one light script per machine, every 15 s
const outsCache = new Map<string, { at: number; outs: Job["outs"]; tail?: string[] }>();
async function refreshOuts(machine: MachineId, jobs: Job[]) {
  const due = jobs.filter((j) => j.kind === "job" && Date.now() - (outsCache.get(j.id)?.at ?? 0) > 8000);
  if (due.length) {
    const script = due.map((j, i) => `echo "@@J ${i}"; ${outsLs(outDirs(j.command), 3)}; echo "@@T"; ${j.log ? `tail -c 1500 ${q(j.log)} 2>/dev/null | tr '\\r' '\\n' | grep -v '^[[:space:]]*$' | tail -3` : ":"}`).join("; ");
    const r = await sh(machine, script, 10000);
    const parts = r.out.split(/^@@J (\d+)\n?/m);
    const got = new Map<number, string>();
    for (let i = 1; i < parts.length; i += 2) got.set(+parts[i], parts[i + 1] ?? "");
    due.forEach((j, i) => {
      const [o = "", t = ""] = (got.get(i) ?? "").split(/^@@T\n?/m);
      outsCache.set(j.id, { at: Date.now(), outs: parseOuts(o).slice(0, 4), tail: t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim().split("\n").map((l) => l.slice(0, 220)) });
    });
  }
  for (const j of jobs) { const c = outsCache.get(j.id); j.outs = c?.outs; j.tail = c?.tail; }
}

function buildJobs(machine: MachineId, procs: Map<number, Proc>, now: number): Job[] {
  const kids = new Map<number, Proc[]>();
  for (const p of procs.values()) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid)!.push(p); }
  const isClaudeShell = (p?: Proc) => !!p && CLAUDE_SHELL.test(p.cmd);
  const roots: Proc[] = [];
  for (const p of procs.values()) {
    if (!isHeavy(p.cmd) || EXCLUDE.test(p.cmd.split("\n")[0]) && !isClaudeShell(p)) continue;
    const parent = procs.get(p.ppid);
    if (p.pid === process.pid || (parent && (parent.pid === process.pid || /jobtrail/.test(parent.cmd)))) continue;
    if (parent && isHeavy(parent.cmd) && !EXCLUDE.test(parent.cmd)) continue; // part of a bigger job
    if (isClaudeShell(p) && p.etime < 4) continue; // quick tool calls flicker
    if (argv0(p.cmd) === "caffeinate" && !(kids.get(p.pid)?.length)) continue;
    roots.push(p);
  }
  const jobs: Job[] = [];
  for (const r of roots) {
    const tree: Proc[] = []; const stack = [r];
    while (stack.length) { const p = stack.pop()!; tree.push(p); stack.push(...(kids.get(p.pid) ?? [])); }
    const workers = tree.filter((p) => !/^(caffeinate|sleep|tee|cat|tail)$/.test(argv0(p.cmd)) && !(isShellC(p.cmd) && kids.get(p.pid)?.length));
    const main = workers.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss)[0] ?? r;
    const src = [r, ...tree].find((p) => isShellC(p.cmd.replace(/^caffeinate(\s+-\w+)*\s+/, "")));
    const script = src ? shellScript(src.cmd.replace(/^caffeinate(\s+-\w+)*\s+/, "")) : r.cmd;
    const steps = src ? splitSteps(script) : [];
    const waitM = script.match(/while\s+kill\s+-0\s+(\d+)/);
    const poller = /^\s*(until|while)\b/.test(steps[0] ?? script) && !waitM;
    const lm = label(main.cmd);
    const inner = r !== main && (/\.(py|ts|sh|js|mjs)\b/.test(lm) || argv0(main.cmd) === "ffmpeg") ? main.cmd : (steps[0] ?? script);
    let step: string | undefined;
    if (steps.length > 1) {
      const lab = label(main.cmd).split(" · ")[0];
      const tk = pathTokens(main.cmd)[0];
      const idx = steps.findIndex((s) => !!tk && s.includes(tk) && s.includes(lab.split(" ")[0]));
      step = idx >= 0 ? `step ${idx + 1}/${steps.length}` : `${steps.length} steps`;
    }
    const sleeping = argv0(main.cmd) === "sleep" || main === r;
    const startedAt = now - r.etime;
    const cpu = tree.reduce((a, p) => a + p.cpu, 0), rss = tree.reduce((a, p) => a + p.rss, 0);
    const job: Job = {
      id: `${machine}:${r.pid}:${Math.round(startedAt / 10)}`, machine, pid: r.pid, startedAt: startedAt * 1000,
      state: poller || (waitM && sleeping) ? "waiting" : "running",
      kind: SERVICE.test(script) || (r.etime > 12 * 3600 && cpu < 1 && !isClaudeShell(r)) ? "service" : "job",
      label: poller ? `watch: ${tilde(steps[0] ?? script).replace(/^\s*(until|while)\s+/, "").replace(/;\s*do[\s\S]*$/, "").replace(/\s+/g, " ").slice(0, 80)}`
        : label(waitM && sleeping ? script.replace(/^[\s\S]*?done;\s*/, "") : inner), step: poller ? undefined : step,
      command: script, mainCmd: main.cmd, cpu, rss,
      pids: tree.map((p) => ({ pid: p.pid, cmd: p.cmd.slice(0, 400), cpu: p.cpu, rss: p.rss })),
      caffeinated: tree.some((p) => argv0(p.cmd) === "caffeinate"), waitingOn: waitM ? +waitM[1] : undefined,
      ppid: r.ppid,
    };
    if (isClaudeShell(r)) {
      let a: Proc | undefined = r; let hops = 0;
      while (a && hops++ < 8 && !livePids.has(a.pid)) a = procs.get(a.ppid);
      const s = a ? livePids.get(a.pid) : livePids.get(r.ppid);
      if (s) job.chat = chatFor(s.sessionId, "process");
      const cd = script.match(/^\s*cd\s+(\S+)/); job.cwd = cd ? cd[1] : s?.cwd;
    }
    const redir = script.match(/(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"';&|]+\.(?:log|txt|out))/);
    if (redir) job.log = redir[1].replace(/^~/, HOME);
    jobs.push(job);
  }
  return jobs;
}

async function findLogs(machine: MachineId, jobs: Job[]) {
  const need = jobs.filter((j) => !j.log && !logCache.has(j.id));
  if (!need.length) { for (const j of jobs) if (!j.log) j.log = logCache.get(j.id) ?? undefined; return; }
  const pids = [...new Set(need.flatMap((j) => j.pids.slice(0, 4).map((p) => p.pid)))].join(",");
  const r = await sh(machine, `lsof -a -p ${pids} -d 1,2 -Fpn 2>/dev/null`);
  const byPid = new Map<number, string>(); let cur = 0;
  for (const l of r.out.split("\n")) {
    if (l.startsWith("p")) cur = +l.slice(1);
    else if (l.startsWith("n/") && !l.startsWith("n/dev/") && !byPid.has(cur)) byPid.set(cur, l.slice(1));
  }
  for (const j of need) { const f = j.pids.map((p) => byPid.get(p.pid)).find(Boolean); logCache.set(j.id, f ?? null); }
  for (const j of jobs) if (!j.log) j.log = logCache.get(j.id) ?? undefined;
}

const FAIL = /Traceback|\bError\b|error:|Killed|FAILED|Segmentation fault|out of memory|exit (code|status) [1-9]/i;
async function finish(job: Job) {
  job.endedAt = Date.now(); job.state = "done";
  if (job.log) {
    const r = await sh(job.machine, `tail -c 3000 ${q(job.log)} 2>/dev/null`);
    const lines = r.out.split(/\r|\n/).filter((l) => l.trim()).slice(-12).join("\n");
    if (FAIL.test(lines)) job.state = "failed";
  } else job.state = "ended";
  history.unshift(job);
  const cutoff = Date.now() - HIST_DAYS * 86400e3;
  history = history.filter((j) => (j.endedAt ?? 0) > cutoff).slice(0, 5000);
  writeFileSync(HIST_FILE, JSON.stringify(history));
}

async function poll(machine: MachineId) {
  const r = await sh(machine, POLL, 12000);
  const m = machines[machine]!;
  if (!r.ok && !r.out.includes("@@NOW")) {
    m.online = false; m.error = (r.err.trim().split("\n").pop() || "unreachable").slice(0, 160); return;
  }
  const { meta, procs } = parsePoll(r.out);
  const now = Number(meta.NOW) || Math.floor(Date.now() / 1000);
  Object.assign(m, { online: true, error: undefined, polledAt: Date.now(), gpu: meta.GPU ? Number(meta.GPU) : undefined,
    memFree: meta.MEM ? parseInt(meta.MEM) : undefined, load: meta.LOAD?.replace(/[{}]/g, "").trim().split(/\s+/)[0],
    // battery (laptops only; a Mac mini reports nothing): "71%; discharging" / "100%; charged"
    battery: meta.BATT ? parseInt(meta.BATT) : undefined, charging: meta.BATT ? /(^|; )(charging|charged|finishing charge|AC attached)/.test(meta.BATT) : undefined });
  const jobs = buildJobs(machine, procs, now);
  // ps elapsed time has 1 s jitter: keep the id of the same pid if its start time is within 90 s
  for (const j of jobs) {
    const same = [...live.values()].find((l) => l.machine === machine && l.pid === j.pid && Math.abs(l.startedAt - j.startedAt) < 90000);
    if (same) { j.id = same.id; j.startedAt = same.startedAt; j.chat ??= same.chat; }
  }
  await findLogs(machine, jobs);
  await refreshOuts(machine, jobs);
  for (const j of jobs) {
    if (!j.chat) j.chat = await chatFromTranscripts(j);
    if (j.chat?.sessionId) { const fresh = chatFor(j.chat.sessionId, j.chat.via); j.chat.status = fresh.status; j.chat.title = fresh.title; }
    j.stale = Date.now() - j.startedAt > 6 * 3600e3 && j.cpu < 1;
    j.orphan = !j.chat && j.ppid === 1;   // launched by something that has since exited (now owned by launchd)
  }
  const ids = new Set(jobs.map((j) => j.id));
  for (const [id, j] of live) if (j.machine === machine && !ids.has(id)) { live.delete(id); await finish(j); }
  for (const j of jobs) live.set(j.id, j);
}

// ---------- detail on demand ----------
async function detail(id: string) {
  const j = live.get(id) ?? history.find((h) => h.id === id);
  if (!j) return { error: "gone" };
  const dirs = outDirs(j.command);
  const script = [
    j.log ? `echo "@@LOG"; tail -c 6000 ${q(j.log)} 2>/dev/null` : "",
    `echo "@@OUT"; ${outsLs(dirs, 6)}`,
  ].join("; ");
  const r = await sh(j.machine, script, 10000);
  const [, logPart = "", outPart = ""] = r.out.match(/(?:@@LOG\n([\s\S]*?))?@@OUT\n?([\s\S]*)$/) ?? [];
  const logTail = logPart.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").split("\n").map((l) => l.split("\r").filter((s) => s.trim()).pop() ?? "").filter(Boolean).slice(-30).join("\n");
  const outputs = parseOuts(outPart).slice(0, 12);
  return { logTail, outputs, machine: machines[j.machine] };
}

// ---------- state + server ----------
function progress() {
  if (!PROGRESS) return undefined;
  try { const p = JSON.parse(readFileSync(PROGRESS, "utf8")); return { updated: p.updated, machines: p.machines }; } catch { return undefined; }
}
// ---------- what each chat is doing (tail of its transcript) ----------
type Act = { t: number; kind: "user" | "text" | "tool"; s: string };
const transcriptPath = new Map<string, string>(); let tpAt = 0;
const actCache = new Map<string, { at: number; acts: Act[] }>();
function findTranscript(sid: string) {
  if (!transcriptPath.has(sid) && Date.now() - tpAt > 30000) {
    tpAt = Date.now(); const root = join(HOME, ".claude/projects");
    try { for (const d of readdirSync(root)) try { for (const f of readdirSync(join(root, d))) if (f.endsWith(".jsonl")) transcriptPath.set(f.slice(0, -6), join(root, d, f)); } catch {} } catch {}
  }
  return transcriptPath.get(sid);
}
const md = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
async function chatActivity(sid: string): Promise<Act[]> {
  const c = actCache.get(sid); if (c && Date.now() - c.at < 6000) return c.acts;
  const p = findTranscript(sid); if (!p) return [];
  const acts: Act[] = [];
  try {
    const f = Bun.file(p), sz = f.size, txt = await f.slice(Math.max(0, sz - 300000), sz).text();
    const lines = txt.split("\n");
    for (let i = lines.length - 1; i >= 1 && acts.length < 8; i--) {
      let o: any; try { o = JSON.parse(lines[i]); } catch { continue; }
      const t = Date.parse(o.timestamp ?? "") || 0, m = o.message;
      if (!m) continue;
      const items = typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content : [];
      for (const it of [...items].reverse()) {
        if (o.type === "assistant" && it.type === "tool_use") {
          const inp = it.input ?? {};
          const d = inp.description || inp.command || inp.file_path || inp.pattern || inp.prompt || inp.url || "";
          acts.push({ t, kind: "tool", s: `${String(it.name).replace(/^mcp__[^_]+__/, "")}: ${tilde(String(d)).replace(/\s+/g, " ").slice(0, 200)}` });
        } else if (o.type === "assistant" && it.type === "text" && it.text?.trim()) acts.push({ t, kind: "text", s: md(it.text).slice(0, 240) });
        else if (o.type === "user" && it.type === "text" && it.text?.trim() && !o.isMeta && !/^<(system-reminder|command|local-command|task-notification)/.test(it.text.trim()))
          acts.push({ t, kind: "user", s: md(it.text).slice(0, 240) });
        if (acts.length >= 8) break;
      }
    }
  } catch {}
  actCache.set(sid, { at: Date.now(), acts });
  return acts;
}
let activity: Record<string, Act[]> = {};
async function refreshActivity() {
  const ids = new Set<string>();
  for (const s of livePids.values()) if (s.sessionId) ids.add(s.sessionId);
  for (const j of live.values()) if (j.chat?.sessionId) ids.add(j.chat.sessionId);
  const next: Record<string, Act[]> = {};
  for (const id of ids) next[id] = await chatActivity(id);
  activity = next;
}

function snapshot() {
  if (DEMO) return demoSnapshot(VERSION);
  return { now: Date.now(), machines: Object.values(machines), live: [...live.values()].sort((a, b) => b.startedAt - a.startedAt),
    recent: history.filter((j) => (j.endedAt ?? 0) > Date.now() - 86400e3).slice(0, 200), progress: progress(), chats: [...livePids.values()], activity, version: VERSION };
}

// ---------- real previews of output files ----------
// Only files JobTrail itself listed for a job (its log or outputs) can be previewed or fetched.
const VERSION = (() => { try { return Bun.hash(readdirSync(PUBLIC).sort().map((f) => { try { return f + readFileSync(join(PUBLIC, f)).length + statSync(join(PUBLIC, f)).mtimeMs; } catch { return f; } }).join("|")).toString(36); } catch { return "0"; } })();
const THUMBS = join(DATA, "thumbs"); mkdirSync(THUMBS, { recursive: true });
function allowed(id: string, path: string) {
  const j = live.get(id) ?? history.find((h) => h.id === id);
  if (!j) return null;
  const ok = [j.log ? tilde(j.log) : "", ...(j.outs ?? []).map((o) => o.path)].filter(Boolean);
  return ok.includes(path) ? { job: j, abs: path.replace(/^~/, HOME) } : null;
}
const kindOf = (p: string) => { const e = (p.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "exr", "tif", "tiff", "heic"].includes(e) ? "image" : ["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(e) ? "video"
    : ["wav", "mp3", "flac", "aac", "m4a", "ogg", "aiff"].includes(e) ? "audio" : "text"; };
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm",
  wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", aiff: "audio/aiff", log: "text/plain", txt: "text/plain", json: "application/json" };
const FF = "PATH=/opt/homebrew/bin:/usr/local/bin:$PATH";
const thumbBusy = new Map<string, Promise<Response>>();
async function preview(id: string, path: string, mtime: string): Promise<Response> {
  const a = allowed(id, path); if (!a) return new Response("no", { status: 404 });
  const kind = kindOf(path), key = Bun.hash(`${a.job.machine}|${path}|${mtime}`).toString(16), out = join(THUMBS, key + (kind === "audio" ? ".json" : ".jpg"));
  if (existsSync(out)) return new Response(Bun.file(out), { headers: { "Cache-Control": "max-age=86400" } });
  if (thumbBusy.has(key)) return (await thumbBusy.get(key)!).clone();
  const job = (async () => {
    const f = q(a.abs);
    if (kind === "image") {
      const r = await sh(a.job.machine, `${FF}; t=$(mktemp -t jt).jpg; sips -Z 480 -s format jpeg ${f} --out "$t" >/dev/null 2>&1 && base64 -i "$t"; rm -f "$t"`, 20000);
      if (!r.out.trim()) return new Response("no", { status: 404 });
      writeFileSync(out, Buffer.from(r.out.replace(/\s/g, ""), "base64"));
    } else if (kind === "video") {
      const r = await sh(a.job.machine, `${FF}; ffmpeg -v error -ss 1 -i ${f} -frames:v 1 -vf scale=480:-2 -f mjpeg - 2>/dev/null | base64`, 25000);
      if (!r.out.trim()) return new Response("no", { status: 404 });
      writeFileSync(out, Buffer.from(r.out.replace(/\s/g, ""), "base64"));
    } else if (kind === "audio") {
      // 100 samples a second of the real signal, reduced here to 160 peak bars
      const r = await sh(a.job.machine, `${FF}; ffmpeg -v error -i ${f} -ac 1 -ar 100 -f s16le - 2>/dev/null | base64`, 30000);
      const buf = Buffer.from(r.out.replace(/\s/g, ""), "base64"), n = Math.floor(buf.length / 2);
      if (!n) return new Response("no", { status: 404 });
      const bars = 160, peaks: number[] = [];
      let max = 1; for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(buf.readInt16LE(i * 2)));
      for (let b = 0; b < bars; b++) { let m = 0; for (let i = Math.floor(b * n / bars); i < Math.floor((b + 1) * n / bars); i++) m = Math.max(m, Math.abs(buf.readInt16LE(i * 2))); peaks.push(+(m / max).toFixed(3)); }
      writeFileSync(out, JSON.stringify({ peaks, duration: n / 100 }));
    } else return new Response("no", { status: 404 });
    return new Response(Bun.file(out), { headers: { "Cache-Control": "max-age=86400" } });
  })();
  thumbBusy.set(key, job);
  try { return (await job).clone(); } finally { thumbBusy.delete(key); }
}
async function rawFile(id: string, path: string, req: Request): Promise<Response> {
  const a = allowed(id, path); if (!a) return new Response("no", { status: 404 });
  const ext = (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase(), type = MIME[ext] ?? "application/octet-stream";
  if (a.job.machine === "local") return new Response(Bun.file(a.abs), { headers: { "Content-Type": type } }); // Bun handles Range
  // remote: copy once into the cache (one ssh read), then serve with Range support for audio/video players
  const st = await sh("remote", `stat -f "%m %z" ${q(a.abs)}`);
  const [mt, sz] = st.out.trim().split(" ").map(Number);
  if (!sz || sz > 600e6) return new Response("too big or missing", { status: 404 });
  const local = join(THUMBS, Bun.hash(`remote|${path}|${mt}`).toString(16) + "." + (ext || "bin"));
  if (!existsSync(local)) {
    const p = Bun.spawn([...SSH, `cat ${q(a.abs)}`], { stdout: "pipe", stderr: "ignore" });
    await Bun.write(local + ".part", new Response(p.stdout)); await p.exited;
    const { renameSync } = await import("fs"); renameSync(local + ".part", local);
  }
  return new Response(Bun.file(local), { headers: { "Content-Type": type } });
}

// ---------- access: this Mac freely; other devices (the iPhone over Tailscale) need the key ----------
const TOKEN_FILE = join(DATA, "token");
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, crypto.randomUUID().replace(/-/g, ""), { mode: 0o600 });
const TOKEN = readFileSync(TOKEN_FILE, "utf8").trim();
const clients = new Set<ReadableStreamDefaultController>();
function broadcast() {
  const msg = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const c of clients) { try { c.enqueue(msg); } catch { clients.delete(c); } }
}
async function loop(machine: MachineId) {
  for (;;) {
    try { loadSessions(); await poll(machine); if (machine === "local") await refreshActivity(); broadcast(); } catch (e) { console.error(machine, e); }
    const ms = clients.size ? (machine === "remote" ? 2500 : 2000) : 5000, until = Date.now() + ms;
    while (Date.now() < until) { await Bun.sleep(200); if (ms >= 5000 && clients.size) break; }
  }
}

const server = Bun.serve({
  port: PORT, hostname: process.env.JOBTRAIL_HOST ?? "0.0.0.0", idleTimeout: 0,
  async fetch(req, srv) {
    const res = await route(req, srv);
    if ((req as any).jtSetCookie) res.headers.append("Set-Cookie", `jt=${TOKEN}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    return res;
  },
});
async function route(req: Request, srv: any): Promise<Response> {
  {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    const ip = srv.requestIP(req)?.address ?? "";
    // "local" = this Mac's own app/browser. Loopback alone is not enough: a web page could DNS-rebind its own
    // domain to 127.0.0.1, so the Host must also be a loopback name, and cross-site browser requests are refused.
    const loopIP = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
    const loopHost = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    const site = req.headers.get("sec-fetch-site"), origin = req.headers.get("origin");
    const crossSite = site === "cross-site" || (!!origin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin) && loopIP);
    if (crossSite) return new Response("JobTrail: cross-site request refused", { status: 403 });
    const local = loopIP && loopHost;
    const cookie = /(?:^|;\s*)jt=([a-f0-9]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
    const given = url.searchParams.get("k") ?? cookie ?? req.headers.get("x-jobtrail-key");
    if (!local && given !== TOKEN) return new Response("JobTrail: key required", { status: 401 });
    // keep ?k in the address (so "Add to Home Screen" saves a working link) and also set the cookie
    if (!local && url.searchParams.get("k") === TOKEN && !cookie) (req as any).jtSetCookie = true;
    if (DEMO) {
      const id = url.searchParams.get("id") ?? "", p = url.searchParams.get("path") ?? "";
      if (url.pathname === "/api/history") return Response.json(demoHistory(Number(url.searchParams.get("days") ?? 7) || 7));
      if (url.pathname === "/api/detail") return Response.json(demoDetail(id));
      if (url.pathname === "/api/preview") return demoPreview(p);
      if (url.pathname === "/api/file") return demoFile(p);
      if (url.pathname === "/api/phone") return Response.json({ url: "http://100.64.0.7:4791/?k=demo-key-not-real", via: "tailscale" });
    }
    if (url.pathname === "/api/phone") {
      if (!local) return new Response("no", { status: 403 });
      const ip = /inet (100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)/.exec((await run(["/sbin/ifconfig"], 4000)).out)?.[1];
      // Tailscale only: its traffic is encrypted end to end, so the key never crosses Wi-Fi in clear text
      return Response.json({ url: ip ? `http://${ip}:${PORT}/?k=${TOKEN}` : null, via: "tailscale" });
    }
    if (url.pathname === "/api/preview") return preview(url.searchParams.get("id") ?? "", url.searchParams.get("path") ?? "", url.searchParams.get("m") ?? "");
    if (url.pathname === "/api/file") return rawFile(url.searchParams.get("id") ?? "", url.searchParams.get("path") ?? "", req);
    if (url.pathname === "/api/state") return Response.json(snapshot());
    // end a stale orphan (no chat, no parent, idle 6 h+); nothing else can be killed from here
    if (url.pathname === "/api/kill" && req.method === "POST") {
      const j = live.get(url.searchParams.get("id") ?? "");
      if (!j) return Response.json({ ok: false, error: "gone" }, { status: 404 });
      if (!(j.orphan && j.stale)) return Response.json({ ok: false, error: "only stale jobs with no chat can be ended" }, { status: 403 });
      const pids = [...new Set([j.pid, ...(j.pids ?? []).map((p) => p.pid)])].filter((p) => Number.isInteger(p) && p > 1).join(" ");
      await sh(j.machine, `kill -TERM ${pids} 2>/dev/null; sleep 2; kill -KILL ${pids} 2>/dev/null; true`, 10000);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/history") {
      const days = Math.min(HIST_DAYS, Number(url.searchParams.get("days") ?? 7) || 7), cut = Date.now() - days * 86400e3;
      return Response.json(history.filter((j) => (j.endedAt ?? 0) > cut));
    }
    if (url.pathname === "/api/detail") return Response.json(await detail(url.searchParams.get("id") ?? ""));
    if (url.pathname === "/api/stream") {
      let ctl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(c) { ctl = c; clients.add(c); c.enqueue(`data: ${JSON.stringify(snapshot())}\n\n`); },
        cancel() { clients.delete(ctl); },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    }
    const f = join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname.replace(/\.\.+/g, ""));
    if (existsSync(f) && statSync(f).isFile()) return new Response(Bun.file(f), { headers: { "Cache-Control": "no-cache" } });
    return new Response("not found", { status: 404 });
  }
}
setInterval(() => { for (const c of clients) { try { c.enqueue(": ping\n\n"); } catch { clients.delete(c); } } }, 15000);
console.log(`jobtrail · http://127.0.0.1:${PORT} (other devices need the key in ~/.jobtrail/token)`);
if (DEMO) setInterval(broadcast, 2000);
else { loop("local"); if (REMOTE_HOST) loop("remote"); }
