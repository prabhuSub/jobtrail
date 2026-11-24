// Demo mode: made-up chats, machines and jobs that move over time, so JobTrail can be tried (and photographed)
// without any real Claude Code sessions. Start with: JOBTRAIL_DEMO=1 bun server.ts
type Out = { path: string; mtime: number; size: number };
const T0 = Date.now();
const min = 60e3, hr = 3600e3;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const chats = {
  train: { sessionId: "demo-train-0001", title: "Fine-tune tiny-llama on our docs", cwd: "~/code/docs-llm" },
  pod: { sessionId: "demo-pod-0002", title: "Podcast cleanup: episode 12", cwd: "~/audio/podcast" },
  film: { sessionId: "demo-film-0003", title: "Product launch video render", cwd: "~/video/launch" },
  auth: { sessionId: "demo-auth-0004", title: "Refactor the auth service", cwd: "~/code/api" },
  data: { sessionId: "demo-data-0005", title: "Nightly dataset sync", cwd: "~/data" },
};
const status: Record<string, string> = { train: "busy", pod: "idle", film: "busy", auth: "busy", data: "idle" };

type Spec = {
  key: string; machine: "local" | "remote"; chat: keyof typeof chats; startAgo: number; label: string; step?: (t: number) => string;
  command: string; main: string; state?: "running" | "waiting"; cpu: [number, number]; rss: number; log?: string;
  tail: (t: number) => string[]; outs?: (t: number) => Out[]; waitingOn?: number; pid: number; lifetime?: number;
};
const steps = (t: number, every: number, n: number) => Math.min(n, Math.floor(t / every) + 1);
const specs: Spec[] = [
  { key: "train", machine: "local", chat: "train", startAgo: 47 * min, pid: 48211, label: "train.py · tiny-llama", cpu: [180, 260], rss: 9.4e6,
    step: (t) => `step ${steps(t + 47 * min, 30 * min, 3)}/3`,
    command: "cd ~/code/docs-llm && python prep.py && python train.py --model tiny-llama --epochs 3 --lr 2e-4 > logs/train.log 2>&1 && python eval.py",
    main: "python train.py --model tiny-llama --epochs 3 --lr 2e-4", log: "~/code/docs-llm/logs/train.log",
    tail: (t) => { const s = 820 + Math.floor(t / 1500); return [`epoch 2/3  step ${s - 1}/1200  loss ${(1.92 - s / 9000).toFixed(3)}  lr 1.8e-4`, `epoch 2/3  step ${s}/1200  loss ${(1.91 - s / 9000).toFixed(3)}  lr 1.8e-4  ${(3.1 + Math.sin(t / 5000) * .2).toFixed(1)} it/s`]; },
    outs: (t) => [{ path: "~/code/docs-llm/checkpoints/ckpt-0800.safetensors", mtime: T0 - 6 * min, size: 2.2e9 }] },
  { key: "master", machine: "local", chat: "pod", startAgo: 3 * min, pid: 50112, label: "ffmpeg → ep12_master.wav", cpu: [60, 95], rss: 1.4e5,
    command: "ffmpeg -y -i raw/ep12.wav -af 'highpass=f=80,loudnorm=I=-16' out/ep12_master.wav",
    main: "ffmpeg -y -i raw/ep12.wav -af highpass=f=80,loudnorm=I=-16 out/ep12_master.wav",
    tail: (t) => [`size=  ${Math.floor(41000 + t / 30)}kB time=00:${String(31 + Math.floor(t / 9000) % 28).padStart(2, "0")}:12.40 bitrate=1411.2kbits/s speed=38.1x`],
    outs: (t) => [{ path: "~/audio/podcast/out/ep12_master.wav", mtime: Date.now() - 2000, size: 41e6 + t * 30 }] },
  { key: "watch", machine: "local", chat: "film", startAgo: 22 * min, pid: 49001, state: "waiting", label: 'watch: grep -q "ALL DONE" logs/render.log', cpu: [0, 0.2], rss: 1800,
    command: 'until grep -q "ALL DONE" logs/render.log; do sleep 20; done; open renders/', main: "sleep 20", log: "~/video/launch/logs/render.log",
    tail: (t) => [`frame ${118 + Math.floor(t / 4000)}/240 rendered on mac-mini`] },
  { key: "render", machine: "remote", chat: "film", startAgo: 21 * min, pid: 7731, label: "blender -b launch.blend", cpu: [690, 780], rss: 1.1e7,
    step: () => "step 1/2", command: "cd ~/video/launch && blender -b launch.blend -o renders/frame_#### -a > logs/render.log 2>&1 && ffmpeg -framerate 24 -i renders/frame_%04d.png -c:v libx264 launch.mp4",
    main: "blender -b launch.blend -o renders/frame_#### -a", log: "~/video/launch/logs/render.log",
    tail: (t) => { const f = 118 + Math.floor(t / 4000); return [`Fra:${f} Mem:4211.3M | Time:00:04.88 | Sample 96/128`, `Saved: renders/frame_${String(f).padStart(4, "0")}.png`]; },
    outs: (t) => { const f = 118 + Math.floor(t / 4000); return [{ path: `~/video/launch/renders/frame_${String(f).padStart(4, "0")}.png`, mtime: Date.now() - 3000, size: 3.4e6 }]; } },
  { key: "whisper", machine: "remote", chat: "pod", startAgo: 9 * min, pid: 7802, label: "whisper ep12_master.wav", cpu: [140, 220], rss: 3.2e6,
    command: "whisper ~/podcast/out/ep12_master.wav --model medium --output_dir transcripts > logs/whisper.log",
    main: "python -m whisper ep12_master.wav --model medium", log: "~/podcast/logs/whisper.log",
    tail: (t) => { const s = 220 + Math.floor(t / 1000) * 4; const ts = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}.000`; return [`[${ts(s)} --> ${ts(s + 4)}] So the trick is to keep every step reversible.`]; },
    outs: () => [{ path: "~/podcast/transcripts/ep12_master.txt", mtime: Date.now() - 5000, size: 48e3 }] },
  { key: "upscale", machine: "remote", chat: "film", startAgo: 20 * min, pid: 7799, state: "waiting", label: "upscale.py renders/ --x2", cpu: [0, 0.1], rss: 2100, waitingOn: 7731,
    command: "while kill -0 7731; do sleep 30; done; python upscale.py renders/ --x2", main: "sleep 30", tail: () => [] },
];
const recentSpecs = [
  { label: "pytest -q", machine: "local", chat: "auth", ago: 4 * min, took: 41e3, state: "done", tail: ["212 passed, 3 skipped in 39.8s"] },
  { label: "rsync -a dataset/ mac-mini:dataset/", machine: "local", chat: "data", ago: 38 * min, took: 6 * min, state: "done", tail: ["sent 18.42G bytes  received 1.20M bytes"] },
  { label: "eval.py --suite long-context", machine: "remote", chat: "train", ago: 75 * min, took: 3 * min, state: "failed", tail: ["Traceback (most recent call last):", "RuntimeError: MPS backend out of memory"] },
  { label: "convert.py --to gguf", machine: "remote", chat: "train", ago: 2.5 * hr, took: 12 * min, state: "done", tail: ["wrote tiny-llama-q4.gguf (812 MB)"] },
  { label: "ffmpeg → ep11_master.wav", machine: "local", chat: "pod", ago: 26 * hr, took: 4 * min, state: "done", tail: ["video:0kB audio:40211kB"] },
  { label: "blender -b teaser.blend", machine: "remote", chat: "film", ago: 3 * 24 * hr, took: 52 * min, state: "done", tail: ["Finished"] },
];
const activity: Record<string, { kind: string; s: string; ago: number }[]> = {
  train: [{ kind: "tool", s: "Bash: Watch training loss", ago: 40e3 }, { kind: "text", s: "Epoch 2 is converging; loss is down 18% since the first checkpoint.", ago: 2 * min }, { kind: "user", s: "keep going and run the eval when it finishes", ago: 9 * min }],
  pod: [{ kind: "text", s: "Mastered to -16 LUFS. Transcribing on the mac-mini now.", ago: 3 * min }, { kind: "tool", s: "Bash: Master episode 12", ago: 3.2 * min }, { kind: "user", s: "clean up ep 12 and make a transcript", ago: 12 * min }],
  film: [{ kind: "tool", s: "Bash: Render all 240 frames on the mac-mini", ago: 21 * min }, { kind: "text", s: "Frame 118 looks right; rendering the rest. I'll upscale once it's done.", ago: 6 * min }, { kind: "user", s: "render the launch video in full", ago: 25 * min }],
  auth: [{ kind: "tool", s: "Edit: ~/code/api/auth/session.ts", ago: 15e3 }, { kind: "text", s: "Moving token refresh into its own module so the middleware stays small.", ago: 1 * min }, { kind: "user", s: "refactor the auth service, keep the tests green", ago: 30 * min }],
  data: [{ kind: "text", s: "Dataset is in sync on both Macs (18.4 GB).", ago: 32 * min }],
};

const chat = (k: keyof typeof chats) => ({ ...chats[k], status: status[k], via: "process" as const });
const jitter = new Map<string, number>();
function job(sp: Spec) {
  const now = Date.now(), t = now - T0, start = T0 - sp.startAgo;
  const cpu = +(rnd(sp.cpu[0], sp.cpu[1])).toFixed(1);
  return {
    id: `${sp.machine}:${sp.pid}:demo`, machine: sp.machine, pid: sp.pid, startedAt: start, state: sp.state ?? "running", kind: "job",
    label: sp.label, step: sp.step?.(t), command: sp.command, mainCmd: sp.main, cpu, rss: sp.rss * rnd(.98, 1.02),
    pids: [{ pid: sp.pid, cmd: sp.main, cpu, rss: sp.rss }], caffeinated: sp.machine === "remote", waitingOn: sp.waitingOn,
    log: sp.log?.replace(/^~/, "/Users/you"), chat: chat(sp.chat), cwd: chats[sp.chat].cwd, outs: sp.outs?.(t), tail: sp.tail(t),
  };
}
const recent = () => recentSpecs.map((r, i) => {
  const end = T0 - r.ago;
  return { id: `${r.machine}:${9000 + i}:demo`, machine: r.machine, pid: 9000 + i, startedAt: end - r.took, endedAt: end, state: r.state, kind: "job", label: r.label,
    command: r.label, mainCmd: r.label, cpu: 0, rss: 0, pids: [], caffeinated: false, chat: chat(r.chat as keyof typeof chats), tail: r.tail, outs: [] };
});

export function demoSnapshot(version: string) {
  const now = Date.now(), t = now - T0;
  const machines = [
    { id: "local", name: "MacBook Pro", device: "laptop", host: "this Mac", online: true, gpu: Math.round(34 + Math.sin(t / 7000) * 8), memFree: 41, load: (5.2 + Math.sin(t / 9000)).toFixed(2), polledAt: now },
    { id: "remote", name: "Mac mini", device: "desktop", host: "ssh mac-mini", online: true, gpu: Math.round(88 + Math.sin(t / 5000) * 6), memFree: 23, load: (9.8 + Math.sin(t / 8000)).toFixed(2), polledAt: now },
  ];
  const acts: Record<string, any[]> = {};
  for (const [k, list] of Object.entries(activity)) acts[(chats as any)[k].sessionId] = list.map((a) => ({ t: now - a.ago, kind: a.kind, s: a.s }));
  return {
    now, machines, live: specs.map(job), recent: recent().filter((j) => j.endedAt > now - 86400e3), version,
    chats: Object.entries(chats).map(([k, c], i) => ({ ...c, status: status[k], pid: 30000 + i })),
    activity: acts, progress: { updated: new Date().toISOString(), machines: [{ name: "Mac mini", job: "launch video render", state: "rendering" }] },
  };
}
export const demoHistory = (days: number) => recent().filter((j) => j.endedAt > Date.now() - days * 86400e3);
export function demoDetail(id: string) {
  const all = [...specs.map(job), ...recent()];
  const j = all.find((x) => x.id === id); if (!j) return { error: "gone" };
  const sp = specs.find((s) => `${s.machine}:${s.pid}:demo` === id), t = Date.now() - T0;
  const lines = sp ? Array.from({ length: 14 }, (_, i) => sp.tail(t - (13 - i) * 4000).slice(-1)[0]).filter(Boolean) : j.tail ?? [];
  const outs = sp?.outs ? [...sp.outs(t), ...sp.outs(t - 8000), ...sp.outs(t - 16000)] : [];
  const seen = new Set<string>();
  return { logTail: lines.join("\n"), outputs: outs.filter((o) => !seen.has(o.path) && seen.add(o.path)), machine: null };
}

// ---------- made-up previews ----------
export function demoPreview(path: string): Response {
  if (/\.wav$/.test(path)) {
    const peaks = Array.from({ length: 160 }, (_, i) => +Math.min(1, Math.abs(Math.sin(i / 7) * .55 + Math.sin(i / 2.3) * .25 + rnd(-.12, .12)) + .08).toFixed(3));
    return Response.json({ peaks, duration: 2412 });
  }
  if (/\.png$/.test(path)) {
    const f = +(path.match(/(\d{4})\.png$/)?.[1] ?? 1), sun = 90 + (f % 240) * 1.2, hue = 24 + (f % 60) / 3;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue + 200},45%,18%)"/><stop offset=".65" stop-color="hsl(${hue},80%,62%)"/><stop offset="1" stop-color="hsl(${hue - 10},90%,72%)"/></linearGradient></defs>
      <rect width="480" height="270" fill="url(#s)"/><circle cx="${sun}" cy="168" r="34" fill="#fff3d6" opacity=".95"/>
      <path d="M0 200 Q90 150 180 190 T360 180 T480 175 V270 H0Z" fill="#1d1a2b"/><path d="M0 225 Q120 190 240 222 T480 210 V270 H0Z" fill="#0d0b16"/>
      <rect x="208" y="150" width="64" height="40" rx="6" fill="#d9d9de"/><rect x="214" y="155" width="52" height="28" rx="2" fill="#10141c"/></svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
  }
  return new Response("no", { status: 404 });
}
export function demoFile(path: string): Response {
  if (!/\.wav$/.test(path)) return demoPreview(path);
  // 6 s of a soft two-tone chord so the player in the card works
  const sr = 22050, n = sr * 6, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const tt = i / sr, env = Math.min(1, tt * 2, (6 - tt) * 2); buf.writeInt16LE(Math.round(env * 6000 * (Math.sin(2 * Math.PI * 220 * tt) + .6 * Math.sin(2 * Math.PI * 330 * tt))), 44 + i * 2); }
  return new Response(buf, { headers: { "Content-Type": "audio/wav" } });
}
