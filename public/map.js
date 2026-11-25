// JobTrail flow map: chats -> the machines (drawn as a laptop or a small desktop Mac) -> jobs -> the files they make, live and animated.
// No logos: every box shows the real thing (what the chat is doing, the job's latest log line, the actual
// image / video frame / audio waveform it is writing). Clicking any box opens a floating card with details.
// Nodes are keyed and kept between updates so CSS animations never restart; positions ease every frame.
(() => {
const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cid = s => String(s).replace(/[^a-z0-9]/gi, '_');
const base = p => String(p || '').split('/').filter(Boolean).pop() || p;
const enc = encodeURIComponent;
const tildeP = p => String(p || '').replace(/^\/Users\/[^/]+/, '~');
function dur(ms) { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`; }
const ago = t => t ? dur(Date.now() - t) + ' ago' : '';
function size(b) { if (b == null) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return `${b.toFixed(i ? 1 : 0)} ${u[i]}`; }
const kindOf = p => { const e = (String(p).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'exr', 'tif', 'tiff', 'heic'].includes(e) ? 'image' : ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(e) ? 'video'
    : ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'aiff'].includes(e) ? 'audio' : e ? 'text' : 'folder'; };
const previewURL = (j, o) => `/api/preview?id=${enc(j.id)}&path=${enc(o.path)}&m=${o.mtime || 0}`;
const fileURL = (j, o) => `/api/file?id=${enc(j.id)}&path=${enc(o.path)}`;

// ---------- real audio waveforms ----------
const peaksCache = new Map();
function peaks(j, o) {
  const k = o.path + '|' + (o.mtime || 0);
  if (!peaksCache.has(k)) peaksCache.set(k, fetch(previewURL(j, o)).then(r => r.ok ? r.json() : null).catch(() => null));
  return peaksCache.get(k);
}
function waveSVG(p, w = 160, h = 40, color = '#e58fb8') {
  const n = p.length, bw = w / n;
  return `<svg class="wave" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${p.map((v, i) => { const bh = Math.max(1, v * (h - 2)); return `<rect x="${(i * bw).toFixed(2)}" y="${((h - bh) / 2).toFixed(2)}" width="${Math.max(.6, bw - .5).toFixed(2)}" height="${bh.toFixed(2)}" rx=".4" fill="${color}" style="--i:${i}"/>`; }).join('')}</svg>`;
}
function fillWaves(scope) {
  scope.querySelectorAll('[data-wave]:not([data-done])').forEach(el => {
    el.dataset.done = '1';
    const j = { id: el.dataset.job }, o = { path: el.dataset.wave, mtime: +el.dataset.m };
    peaks(j, o).then(d => { if (d?.peaks) { el.innerHTML = waveSVG(d.peaks, 160, 40, el.dataset.c || '#e58fb8'); if (d.duration) el.dataset.dur = d.duration; el.classList.add('ok'); } else el.classList.add('none'); });
  });
}

// ---------- the machines, drawn (not logos: the devices themselves) ----------
const MBP_SVG = `<svg viewBox="0 0 120 80" class="dsvg"><defs>
  <linearGradient id="alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4d4d8"/><stop offset=".55" stop-color="#a1a1a6"/><stop offset="1" stop-color="#6e6e73"/></linearGradient>
  <linearGradient id="scrg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151a22"/><stop offset="1" stop-color="#07090c"/></linearGradient></defs>
  <ellipse cx="60" cy="77" rx="56" ry="2.6" fill="#000" opacity=".7"/>
  <rect x="12" y="2" width="96" height="63" rx="5" fill="#1c1c1e" stroke="#4a4a4e" stroke-width=".8"/>
  <rect class="glass" x="15" y="5" width="90" height="57" rx="2.2" fill="url(#scrg)"/>
  <rect x="54" y="5" width="12" height="3.2" rx="1.6" fill="#1c1c1e"/>
  <path d="M2 66.2 H118 L115.5 72 Q114.6 74 112 74 H8 Q5.4 74 4.5 72 Z" fill="url(#alu)"/>
  <rect x="49" y="66.2" width="22" height="2.2" rx="1.1" fill="#5d5d62"/></svg>`;
const MINI_SVG = `<svg viewBox="0 0 120 64" class="dsvg"><defs>
  <linearGradient id="alu2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e3e6"/><stop offset=".5" stop-color="#b8b8bd"/><stop offset="1" stop-color="#8a8a8f"/></linearGradient>
  <linearGradient id="alutop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfcfd3"/><stop offset=".5" stop-color="#f2f2f4"/><stop offset="1" stop-color="#c4c4c8"/></linearGradient></defs>
  <ellipse cx="60" cy="58" rx="48" ry="3.4" fill="#000" opacity=".75"/>
  <path d="M22 12 H98 Q108 12 110 20 L112 26 H8 L10 20 Q12 12 22 12 Z" fill="url(#alutop)"/>
  <rect x="8" y="25" width="104" height="29" rx="6" fill="url(#alu2)"/>
  <rect x="8" y="25" width="104" height="1.2" fill="#f7f7f9" opacity=".8"/>
  <circle class="led" cx="19" cy="40" r="1.9"/>
  <rect x="84" y="37.6" width="5.4" height="2.6" rx="1.3" fill="#3a3a3e"/><rect x="92.4" y="37.6" width="5.4" height="2.6" rx="1.3" fill="#3a3a3e"/><circle cx="103" cy="38.9" r="1.5" fill="#3a3a3e"/></svg>`;

// optional "declared" status from a progress file: matched to a machine by name
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function declaredFor(m) { const n = norm(m.name); return (S?.progress?.machines || []).find(x => { const k = norm(x.name); return k && n && (k === n || k.includes(n) || n.includes(k)); }); }

// ---------- state ----------
let snap = false; // while the divider is dragged, boxes follow the new size at once (no easing lag)
let root, svg, layer, gEdges, gParts, W = 0, H = 0, S = null, onPick = () => {}, vertical = false;
const nodes = new Map(), edges = new Map(), cpuHist = new Map(), gpuHist = {}, memHist = {};
const firstSeen = new Map();

function spark(vals, w, h, color, max) {
  if (!vals || vals.length < 2) return '';
  const m = max ?? Math.max(1, ...vals), n = vals.length;
  const pts = vals.map((v, i) => `${(i / (n - 1) * w).toFixed(1)},${(h - Math.min(1, v / m) * (h - 2) - 1).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="0,${h} ${pts} ${w},${h}" fill="${color}" fill-opacity=".14" stroke="none"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function init(el, pick) {
  root = el; onPick = pick || onPick;
  root.innerHTML = `<svg class="edges"><defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs><g class="e"></g><g class="p"></g></svg><div class="layer"></div>
    <div class="legend"><span><i class="lg run"></i>running</span><span><i class="lg wait"></i>waiting</span><span><i class="lg done"></i>done</span><span><i class="lg fail"></i>failed</span><span><i class="lg flow"></i>instructions</span><span class="hint">tap any box</span></div>`;
  svg = root.querySelector('svg'); layer = root.querySelector('.layer'); gEdges = svg.querySelector('.e'); gParts = svg.querySelector('.p');
  new ResizeObserver(() => { measure(); if (S) layout(); }).observe(root);
  measure();
  requestAnimationFrame(frame);
}
function measure() { const r = root.getBoundingClientRect(); W = r.width; H = r.height; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); }

// ---------- node bookkeeping ----------
function node(id, kind, make) {
  let n = nodes.get(id);
  if (!n) {
    const el = document.createElement('div'); el.className = `mn ${kind} enter`; el.dataset.id = id;
    el.style.visibility = 'hidden'; // until it has a position (else it shows in the map's top-left corner)
    make?.(el); layer.appendChild(el);
    n = { id, kind, el, cur: null, tgt: null, seen: true, html: {} };
    nodes.set(id, n);
    setTimeout(() => el.classList.remove('enter'), 700);
  }
  n.seen = true; n.leaving = false; n.el.classList.remove('leaving');
  return n;
}
function place(n, x, y, w, h) {
  n.tgt = { x, y, w, h };
  if (!n.cur) { // first placement: put it there now, not on the next animation frame (slow when the window is in the background)
    n.cur = { ...n.tgt };
    const st = n.el.style;
    st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; st.width = w.toFixed(1) + 'px'; st.height = h.toFixed(1) + 'px'; st.visibility = '';
  }
}
function setHTML(n, sel, html) { if (n.html[sel] === html) return false; n.html[sel] = html; const t = sel === '.' ? n.el : n.el.querySelector(sel); t.innerHTML = html; fillWaves(t); return true; }
function cls(n, c) { const sel = n.el.classList.contains('sel') ? ' sel' : ''; const full = `mn ${n.kind} ${c}${n.el.classList.contains('enter') ? ' enter' : ''}${sel}`.replace(/\s+/g, ' ').trim(); if (n.el.className !== full) n.el.className = full; }

function edge(id, kind, pts, state, title) {
  let e = edges.get(id);
  if (!e) {
    const p = document.createElementNS(NS, 'path'); p.id = 'e-' + cid(id);
    const f = document.createElementNS(NS, 'path');
    const t = document.createElementNS(NS, 'title'); p.appendChild(t);
    gEdges.append(p, f);
    e = { id, kind, p, f, t, parts: null, partKey: '' };
    edges.set(id, e);
  }
  e.pts = pts; e.seen = true; e.t.textContent = title || '';
  if (e.state !== state) { e.state = state; e.p.setAttribute('class', `ed ${kind} ${state}`); e.f.setAttribute('class', `fl ${kind} ${state}`); }
  if (e.partKey !== state) {
    e.parts?.remove(); e.parts = null; e.partKey = state;
    const spec = { run: [3, 2.6], write: [2, 1.8], wait: [1, 6], think: [2, 3.2] }[state];
    if (spec) {
      const g = document.createElementNS(NS, 'g'); g.setAttribute('class', `pt ${state}`);
      for (let i = 0; i < spec[0]; i++) {
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', kind === 'out' ? 2 : 2.6); c.setAttribute('filter', 'url(#glow)');
        const a = document.createElementNS(NS, 'animateMotion'); a.setAttribute('dur', spec[1] + 's'); a.setAttribute('repeatCount', 'indefinite');
        a.setAttribute('begin', `${-(spec[1] / spec[0]) * i}s`);
        const mp = document.createElementNS(NS, 'mpath'); mp.setAttribute('href', '#e-' + cid(id)); a.appendChild(mp);
        c.appendChild(a); g.appendChild(c);
      }
      gParts.appendChild(g); e.parts = g;
    }
  }
}

// ---------- pick what to show for a job's output: its real newest media file, else its log ----------
function outFor(j) {
  const media = (j.outs || []).filter(o => ['image', 'video', 'audio'].includes(kindOf(o.path)));
  if (media.length) return { ...media[0], media: kindOf(media[0].path) };
  if (j.log) return { path: tildeP(j.log), log: true, media: 'log' };
  const any = (j.outs || []).find(o => kindOf(o.path) === 'text');
  return any ? { ...any, media: 'text' } : null;
}
function outInner(j, o, h) {
  const name = `<span class="on"><b>${esc(base(o.path))}</b>${o.size != null && !o.log ? `<i>${size(o.size)} · ${ago(o.mtime)}</i>` : ''}</span>`;
  if (o.media === 'image' || o.media === 'video')
    return `<img class="thumb" loading="lazy" src="${previewURL(j, o)}" alt="" onerror="this.remove()">${o.media === 'video' ? '<span class="vbadge">▶</span>' : ''}${name}`;
  if (o.media === 'audio')
    return `<span class="wv" data-wave="${esc(o.path)}" data-job="${esc(j.id)}" data-m="${o.mtime || 0}"></span>${name}`;
  const lines = (j.tail || []).filter(Boolean).slice(h > 44 ? -2 : -1);
  return `<span class="txt">${lines.map(l => `<span>${esc(l)}</span>`).join('')}</span><span class="on small"><b>${esc(base(o.path))}</b></span>`;
}

// ---------- layout from a snapshot ----------
// only: a machine id to show just that Mac (the top All / Mac / mini filter), or null for all
let only = null;
function update(state, filter) { S = state; only = filter && filter !== 'all' && S.machines.some(m => m.id === filter) ? filter : null; layout(); Card.refresh(); }
function layout() {
  if (!S || !W) return;
  for (const n of nodes.values()) n.seen = false;
  for (const e of edges.values()) e.seen = false;
  const now = Date.now();
  vertical = W < 720;
  const compact = !vertical && W < 980;
  const jobsAll = [...S.live.filter(j => j.kind === 'job'), ...S.recent.filter(j => j.kind === 'job' && now - (j.endedAt || 0) < 90000)].filter(j => !only || j.machine === only);
  for (const j of jobsAll) { if (!firstSeen.has(j.id)) firstSeen.set(j.id, now); if (!j.endedAt) { const h = cpuHist.get(j.id) || []; if (h.at !== S.now) { h.push(j.cpu); if (h.length > 60) h.shift(); h.at = S.now; } cpuHist.set(j.id, h); } }
  for (const m of S.machines) for (const [hist, v] of [[gpuHist, m.gpu], [memHist, m.memFree]]) { const h = (hist[m.id] ||= []); if (v != null && h.at !== m.polledAt) { h.push(v); if (h.length > 90) h.shift(); h.at = m.polledAt; } }

  // chats: every chat that owns a shown job, plus busy chats with nothing running (thinking)
  const chatKey = j => j.chat?.sessionId || '__none';
  const chats = new Map();
  for (const j of jobsAll) { const k = chatKey(j); if (!chats.has(k)) chats.set(k, { key: k, chat: j.chat, jobs: [] }); chats.get(k).jobs.push(j); }
  if (!only) for (const c of S.chats || []) if (c.status === 'busy' && !chats.has(c.sessionId)) chats.set(c.sessionId, { key: c.sessionId, chat: { sessionId: c.sessionId, title: c.title, status: c.status, cwd: c.cwd }, jobs: [] });
  for (const c of chats.values()) if (c.chat?.sessionId) { const lp = (S.chats || []).find(x => x.sessionId === c.chat.sessionId); if (lp) c.chat = { ...c.chat, status: lp.status, cwd: c.chat.cwd || lp.cwd }; }
  const order = [...chats.values()].sort((a, b) => (b.jobs.some(j => !j.endedAt) - a.jobs.some(j => !j.endedAt)) || (Math.min(...a.jobs.map(j => j.startedAt), 9e15) - Math.min(...b.jobs.map(j => j.startedAt), 9e15)));
  const rank = new Map(order.map((c, i) => [c.key, i]));
  const mids = S.machines.map(m => m.id).filter(id => !only || id === only), per = Object.fromEntries(mids.map(m => [m, []]));
  for (const j of jobsAll) per[j.machine]?.push(j);
  const pri = j => j.endedAt ? 2 : j.state === 'running' ? 0 : 1;
  for (const m of mids) per[m].sort((a, b) => (pri(a) - pri(b)) || (rank.get(chatKey(a)) - rank.get(chatKey(b))) || (a.startedAt - b.startedAt));

  const LEGEND = vertical ? 0 : 30, pad = vertical ? 10 : 18, head = 40, OGAP = W < 980 ? 50 : 70;
  const zones = {}, chatPos = new Map();
  let G; // geometry per mode
  if (vertical) {
    const cols = Math.max(1, Math.min(order.length, W > 520 ? 3 : 2)), cgap = 12, chh = 60;
    const chw = (W - pad * 2 - cgap * (cols - 1)) / cols, rows = Math.ceil(order.length / cols);
    order.forEach((c, i) => chatPos.set(c.key, { x: pad + (i % cols) * (chw + cgap), y: pad + Math.floor(i / cols) * (chh + cgap), w: chw, h: chh }));
    let y = pad + rows * (chh + cgap) + (order.length ? 40 : 0);
    const zw = W - pad * 2, ow = Math.max(88, Math.min(130, zw * .27)), mw = 96, mh = 86, gx = 22, jw = zw - gx - ow - 30;
    for (const m of mids) { const n = per[m].length, h = head + 14 + mh + 22 + Math.max(n, .6) * 62; zones[m] = { y, h }; y += h + 18; }
    const total = y + 22;
    if (Math.abs(H - total) > 1) { root.style.height = total + 'px'; root.dataset.auto = '1'; H = total; measure(); }
    G = { zx: pad, zw, gx, jw, ow, cw: chw, chh, mw, mh };
  } else {
    if (root.dataset.auto) { root.style.height = ''; delete root.dataset.auto; measure(); }
    const cw = compact ? 180 : Math.min(260, Math.max(200, W * .17)), gap = compact ? 60 : Math.min(140, W * .085);
    const zx = pad + cw + gap, zw = W - zx - pad;
    const mw = compact ? 112 : 140, mh = compact ? 96 : 116, gx = 18 + mw + (compact ? 60 : 84);
    const jw = Math.min(compact ? 220 : 320, Math.max(180, zw * .34)), ow = Math.max(120, Math.min(280, zw - gx - jw - OGAP - 18));
    const top = pad + 6, room = H - top - pad - 18 - LEGEND; // the legend gets its own strip at the bottom
    const need = m => head + 24 + Math.max(mh + 16, Math.max(1.4, per[m].length) * 62);
    const zmin = head + mh + 20, [A, B] = mids;
    if (!B) zones[A] = { y: top, h: Math.max(zmin, room + 12) };
    else {
      let zh0;
      if (need(A) + need(B) <= room) zh0 = need(A) + (room - need(A) - need(B)) * Math.max(1, per[A].length) / (Math.max(1, per[A].length) + Math.max(1, per[B].length));
      else if (need(B) < room / 2) zh0 = room - need(B);
      else zh0 = Math.max(room / 2, Math.min(need(A), room / 2));
      zones[A] = { y: top, h: Math.max(zmin, zh0) };
      zones[B] = { y: top + zones[A].h + 18, h: Math.max(zmin, room - zones[A].h) };
    }
    G = { zx, zw, gx, jw, ow, cw, chh: order.length > 7 ? 44 : 60, mw, mh };
  }
  const jobPos = new Map(), chatLinks = new Map();

  for (const mid of mids) {
    const m = S.machines.find(x => x.id === mid) || { id: mid, name: mid, online: false };
    const z = zones[mid], jobs = per[mid], running = jobs.filter(j => !j.endedAt && j.state === 'running');
    const zn = node('z:' + mid, 'zone', el => el.innerHTML = `<div class="zh"></div><div class="zb"></div>`);
    cls(zn, `${mid} ${!m.online ? 'down' : running.length ? 'hot' : ''} ${(m.gpu || 0) > 40 ? 'gpuhot' : ''}`);
    place(zn, G.zx, z.y, G.zw, z.h);
    const dec = declaredFor(m);
    const svcs = S.live.filter(j => j.kind === 'service' && j.machine === mid).length;
    const g = m.gpu, f = m.memFree, small = vertical || compact;
    setHTML(zn, '.zh', `<span class="zdot"></span><b>${esc(m.name)}</b>${small ? '' : `<span class="zhost">${esc(m.host || '')}</span>`}
      <span class="zm" title="GPU utilisation"><em>GPU</em>${small ? '' : `<span class="zbar"><i style="width:${g || 0}%"></i></span>`}<strong>${g == null ? '—' : g + '%'}</strong>${spark(gpuHist[mid], small ? 36 : 54, 16, '#e9a23b', 100)}</span>
      <span class="zm" title="memory free"><em>MEM</em>${small ? '' : `<span class="zbar"><i style="width:${f || 0}%;background:${f != null && f < 20 ? '#db6b67' : '#7aa36a'}"></i></span>`}<strong>${f == null ? '—' : f + '%'}</strong></span>
      ${small ? '' : `<span class="zm"><em>LOAD</em><strong>${esc(m.load ?? '—')}</strong></span><span class="zm"><em>JOBS</em><strong>${jobs.filter(j => !j.endedAt).length}</strong></span>`}
      ${svcs && !small ? `<span class="zm muted">+${svcs} svc</span>` : ''}
      ${dec && !small ? `<span class="zdec">declared: ${esc(dec.job)} · ${esc(dec.state)}</span>` : ''}`);
    setHTML(zn, '.zb', !m.online ? `<div class="zempty err">offline · ${esc(m.error || 'unreachable')}</div>` : jobs.length ? '' : `<div class="zempty">idle · nothing heavy running</div>`);
    zn.machine = m;

    const cy0 = z.y + head, ch = z.h - head - 8;
    // the machine itself: a drawn laptop (live screen) or small desktop Mac (live front light)
    const dn = node('m:' + mid, 'device', el => el.innerHTML = `<span class="dv">${m.device === 'desktop' ? MINI_SVG : MBP_SVG}${m.device === 'desktop' ? '' : '<span class="scr"></span>'}</span><span class="dl"></span>`);
    const waitingN = jobs.filter(j => !j.endedAt && j.state === 'waiting').length;
    cls(dn, `${m.device || 'laptop'} ${!m.online ? 'down' : running.length ? 'busy' : waitingN ? 'some' : 'idle'}`);
    dn.el.style.setProperty('--g', ((m.gpu || 0) / 100).toFixed(2));
    const gbar = `<span class="sb"><em>GPU</em><i><b style="width:${m.gpu || 0}%"></b></i><strong>${m.gpu == null ? '—' : m.gpu + '%'}</strong></span>`;
    const mbar = `<span class="sb"><em>MEM</em><i><b style="width:${m.memFree || 0}%;background:${(m.memFree ?? 100) < 20 ? '#db6b67' : '#7aa36a'}"></b></i><strong>${m.memFree == null ? '—' : m.memFree + '%'}</strong></span>`;
    const jl = `${running.length} running${waitingN ? ` · ${waitingN} waiting` : ''}`;
    if (m.device !== 'desktop') setHTML(dn, '.scr', m.online ? `${gbar}${mbar}<span class="sj">${jl}</span><span class="sc"><i></i><i></i><i></i></span>` : `<span class="sj err">offline</span>`);
    setHTML(dn, '.dl', `<b>${esc(m.name)}</b><span>${mid === 'remote' ? (m.online ? 'via ssh' : 'offline') : 'this Mac'}</span>${m.device === 'desktop' && m.online ? `<span class="ms">${gbar}${mbar}</span><span class="sj">${jl}</span>` : ''}`);
    dn.machine = m;
    if (vertical) place(dn, G.zx + G.zw / 2 - G.mw / 2, cy0 + 6, G.mw, G.mh);
    else place(dn, G.zx + 18, cy0 + Math.max(0, (ch - G.mh) / 2), G.mw, G.mh);

    let shown = jobs, more = 0;
    if (!vertical) { const fit = Math.max(1, Math.floor((ch + 4) / 46)); const maxRows = jobs.length > fit ? Math.max(1, Math.floor((ch - 18) / 46)) : fit; shown = jobs.slice(0, maxRows); more = jobs.length - shown.length; }
    const pitch = vertical ? 62 : Math.min(80, ch / Math.max(1, shown.length + (more ? .5 : 0)));
    const jh = vertical ? 46 : Math.max(32, Math.min(56, pitch - 14)), tight = jh < 46;
    const jx = G.zx + G.gx;
    shown.forEach((j, i) => {
      const y = vertical ? cy0 + G.mh + 28 + pitch * i : cy0 + (ch - pitch * (shown.length + (more ? .5 : 0))) / 2 + pitch * i + (pitch - jh) / 2;
      jobPos.set(j.id, { j, y: y + jh / 2 });
      const n = node('j:' + j.id, 'job', el => el.innerHTML = `<span class="ring"></span><span class="sd"></span><span class="jb"></span>`);
      const fresh = now - (firstSeen.get(j.id) || 0) < 4000;
      cls(n, `${j.state} ${tight ? 'tight' : ''} ${j.endedAt ? 'ghost' : ''} ${fresh ? 'new' : ''}`);
      n.job = j;
      const elapsed = j.endedAt ? dur(j.endedAt - j.startedAt) : dur(now - j.startedAt);
      const stWord = j.endedAt ? j.state : j.state === 'waiting' ? 'waiting' : 'running';
      const line = (j.tail || []).filter(Boolean).slice(-1)[0];
      setHTML(n, '.jb', `<span class="jt"><b>${esc(j.label)}</b>${j.step ? `<span class="jstep">${esc(j.step)}</span>` : ''}</span>
        <span class="js"><span class="jst">${esc(stWord)}</span><span ${j.endedAt ? '' : `data-start="${j.startedAt}"`}>${elapsed}</span>${tight ? '' : line ? `<span class="jl">${esc(line)}</span>` : `<span>${j.cpu.toFixed(0)}% cpu · ${size(j.rss * 1024)}</span>`}${!tight && !j.endedAt && !vertical ? spark(cpuHist.get(j.id), 40, 14, j.state === 'running' ? '#7aa36a' : '#e9a23b') : ''}</span>`);
      place(n, jx, y, G.jw, jh);

      const flow = j.endedAt ? 'off' : j.state === 'running' ? 'run' : 'wait';
      edge(`mj:${j.id}`, 'cmd', [['m:' + mid, vertical ? 'b' : 'r'], ['j:' + j.id, 'l']], flow, `${m.name} → ${j.label}`);
      const ck = `cm:${chatKey(j)}:${mid}`, prev = chatLinks.get(ck);
      const rank2 = { run: 2, wait: 1, off: 0 };
      if (!prev || rank2[flow] > rank2[prev.flow]) chatLinks.set(ck, { from: 'c:' + chatKey(j), mid, flow, title: `${j.chat?.title || 'unlinked'} → ${m.name}` });

      const o = outFor(j);
      if (o) {
        const oid = `o:${j.id}`;
        const on = node(oid, 'out', el => el.innerHTML = `<span class="oc"></span>`);
        const writing = !j.endedAt && (o.log ? j.state === 'running' : o.mtime && now - o.mtime < 120000);
        cls(on, `${o.media} ${writing ? 'writing' : ''} ${j.endedAt ? 'ghost' : ''}`);
        setHTML(on, '.oc', outInner(j, o, jh));
        on.job = j; on.out = o;
        place(on, jx + G.jw + (vertical ? 18 : OGAP), y, G.ow, jh);
        edge(`o:${j.id}`, 'out', [['j:' + j.id, 'r'], [oid, 'l']], writing ? 'write' : 'off', o.path);
      }
      if (j.waitingOn && !j.endedAt) {
        const tgt = jobs.find(x => x.pids?.some(p => p.pid === j.waitingOn) || x.pid === j.waitingOn);
        if (tgt) edge(`w:${j.id}`, 'wait', [['j:' + j.id, 'l'], ['j:' + tgt.id, 'l']], 'wait', `waits for PID ${j.waitingOn}`);
      }
    });
    if (more) { const n = node('more:' + mid, 'more', null); setHTML(n, '.', `+${more} more below`); place(n, jx, cy0 + ch - 16, G.jw, 16); }
  }

  // chats: on wide screens a left column near the mean height of their jobs; on phones a grid on top
  if (!vertical) {
    const chh = G.chh, cgap = 16, top = pad + 6;
    const want = order.map(c => { const ys = c.jobs.map(j => jobPos.get(j.id)?.y).filter(v => v != null); return { c, y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length - chh / 2 : H }; });
    want.sort((a, b) => a.y - b.y);
    let y = top;
    for (const w of want) { w.y = Math.max(y, Math.min(w.y, H - pad - chh)); y = w.y + chh + cgap; }
    for (let i = want.length - 1, lim = H - pad; i >= 0; i--) { want[i].y = Math.min(want[i].y, lim - chh); lim = want[i].y - cgap; }
    for (const w of want) chatPos.set(w.c.key, { x: pad, y: w.y, w: G.cw, h: chh });
  }
  for (const c of order) {
    const p = chatPos.get(c.key), ch = c.chat, st = ch ? (ch.status || 'closed') : 'none';
    const n = node('c:' + c.key, 'chat', el => el.innerHTML = `<span class="cdot"></span><span class="cb"></span>`);
    const live = c.jobs.filter(j => !j.endedAt), act = ch?.sessionId ? (S.activity?.[ch.sessionId] || [])[0] : null;
    cls(n, `${st} ${p.h < 50 ? 'tight' : ''} ${live.some(j => j.state === 'running') ? 'driving' : ''}`);
    const doing = act ? `<span class="ca ${act.kind}">${act.kind === 'tool' ? '▸ ' : act.kind === 'user' ? '“' : ''}${esc(act.s)}</span>` : `<span class="ca muted">${live.length ? `${live.length} job${live.length > 1 ? 's' : ''} running` : st === 'busy' ? 'thinking…' : 'finished'}</span>`;
    setHTML(n, '.cb', `<span class="ct"><b>${esc(ch?.title || 'Not linked to a chat')}</b><span class="cpill ${st}">${esc(ch ? st : 'no chat')}</span></span>${p.h < 50 ? '' : doing}`);
    n.chat = c;
    place(n, p.x, p.y, p.w, p.h);
  }

  for (const [k, l] of chatLinks) edge(k, 'cmd', [[l.from, vertical ? 'b' : 'r'], ['m:' + l.mid, vertical ? 't' : 'l']], l.flow, l.title);
  for (const n of nodes.values()) if (!n.seen && !n.leaving) { n.leaving = true; n.el.classList.add('leaving'); setTimeout(() => { if (n.leaving) { n.el.remove(); nodes.delete(n.id); } }, 500); }
  for (const e of edges.values()) if (!e.seen) { e.p.remove(); e.f.remove(); e.parts?.remove(); edges.delete(e.id); }
}

// ---------- animation frame: ease nodes, redraw edges ----------
function anchor(id, side) {
  const n = nodes.get(id); if (!n?.cur) return null; const r = n.cur, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (side) {
    case 'r': return [r.x + r.w, cy, 1, 0];
    case 'l': return [r.x, cy, -1, 0];
    case 'b': return [cx, r.y + r.h, 0, 1];
    case 't': return [cx, r.y, 0, -1];
    case 'gin': return vertical ? [cx, cy, 0, -1] : [cx, cy, -1, 0];
    case 'gout': return vertical ? [cx, cy, 0, 1] : [cx, cy, 1, 0];
  }
  return [cx, cy, 0, 0];
}
function seg(a, b) {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]), d = Math.max(18, dist * .45);
  return `C${(a[0] + a[2] * d).toFixed(1)},${(a[1] + a[3] * d).toFixed(1)} ${(b[0] + b[2] * d).toFixed(1)},${(b[1] + b[3] * d).toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
}
function frame() {
  for (const n of nodes.values()) {
    if (!n.tgt) continue;
    const c = n.cur, t = n.tgt, k = snap ? 1 : .16;
    c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.w += (t.w - c.w) * k; c.h += (t.h - c.h) * k;
    const s = n.el.style, tr = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
    if (s.transform !== tr) s.transform = tr;
    const w = c.w.toFixed(1) + 'px', h = c.h.toFixed(1) + 'px';
    if (s.width !== w) s.width = w; if (s.height !== h) s.height = h;
  }
  for (const e of edges.values()) {
    const ps = e.pts.map(([id, side]) => anchor(id, side));
    // a hidden end (e.g. a job folded into '+N more'): no path, and park its dots, which would otherwise sit at the map's top-left corner
    if (ps.some(p => !p)) { if (e.d !== '') { e.d = ''; e.p.setAttribute('d', ''); e.f.setAttribute('d', ''); } if (e.parts && e.parts.style.display !== 'none') e.parts.style.display = 'none'; continue; }
    if (e.parts && e.parts.style.display === 'none') e.parts.style.display = '';
    let d;
    if (e.kind === 'wait') { const [a, b] = ps, bx = Math.min(a[0], b[0]) - 30; d = `M${a[0]},${a[1]} C${bx},${a[1]} ${bx},${b[1]} ${b[0]},${b[1]}`; }
    else if (ps.length === 4) d = `M${ps[0][0].toFixed(1)},${ps[0][1].toFixed(1)} ${seg(ps[0], ps[1])} ${seg(ps[2], ps[3])}`;
    else d = `M${ps[0][0].toFixed(1)},${ps[0][1].toFixed(1)} ${seg(ps[0], ps[1])}`;
    if (e.d !== d) { e.d = d; e.p.setAttribute('d', d); e.f.setAttribute('d', d); }
  }
  requestAnimationFrame(frame);
}

// ---------- floating detail card (any box) ----------
const Card = (() => {
  let el, cur = null, timer = null, detail = null, mediaKey = '';
  function ensure() {
    if (el) return;
    el = document.createElement('div'); el.className = 'fcard'; el.innerHTML = `<div class="fgrab"></div><button class="fx" aria-label="close"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button><div class="fh"></div><div class="fbody"><div class="fdyn"></div><div class="fmedia"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('.fx').onclick = close;
    el.addEventListener('click', ev => { const a = ev.target.closest('[data-open]'); if (a) { ev.stopPropagation(); openId(a.dataset.open, null); } const p = ev.target.closest('[data-pick]'); if (p) { close(); onPick(p.dataset.pick); } });
  }
  function close() { if (!el) return; el.classList.remove('on'); cur = null; detail = null; mediaKey = ''; clearInterval(timer); el.querySelectorAll('audio,video').forEach(m => m.pause()); document.querySelectorAll('.mn.sel').forEach(x => x.classList.remove('sel')); }
  function position(anchorEl) {
    const phone = innerWidth < 720;
    el.classList.toggle('sheet', phone);
    if (phone) { el.style.left = el.style.top = el.style.width = ''; return; }
    const r = anchorEl?.getBoundingClientRect() || { left: innerWidth / 2, right: innerWidth / 2, top: 120, bottom: 120 };
    const w = Math.min(560, innerWidth - 32); el.style.width = w + 'px';
    let x = r.right + 14; if (x + w > innerWidth - 16) x = r.left - w - 14; if (x < 16) x = Math.max(16, Math.min(innerWidth - w - 16, r.left));
    const h = Math.min(el.offsetHeight || 420, innerHeight - 32);
    const y = Math.max(16, Math.min(r.top - 20, innerHeight - h - 16));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function openId(id, anchorEl) {
    ensure();
    document.querySelectorAll('.mn.sel').forEach(x => x.classList.remove('sel'));
    const n = nodes.get(id); if (n) n.el.classList.add('sel');
    cur = { id }; detail = null; mediaKey = '';
    el.querySelector('.fmedia').innerHTML = '';
    el.querySelectorAll('audio,video').forEach(m => m.pause());
    render(); el.classList.add('on'); position(anchorEl || n?.el);
    clearInterval(timer);
    const job = jobOf(id);
    if (job) { fetchDetail(job); timer = setInterval(() => fetchDetail(job), 3000); }
  }
  function jobOf(id) {
    const m = /^[jo]:(.+)$/.exec(id); if (!m) return null;
    return [...(S?.live || []), ...(S?.recent || [])].find(j => j.id === m[1]) || nodes.get(id)?.job || null;
  }
  async function fetchDetail(job) {
    try { const r = await fetch('/api/detail?id=' + enc(job.id)); const d = await r.json(); if (cur && jobOf(cur.id)?.id === job.id) { detail = d; render(); } } catch {}
  }
  const kv = (k, v) => v == null || v === '' ? '' : `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  function mediaHTML(j, o) {
    const k = kindOf(o.path);
    if (k === 'image') return `<a class="fimg" href="${fileURL(j, o)}" target="_blank"><img src="${previewURL(j, o)}" alt=""></a>`;
    if (k === 'video') return `<video controls playsinline preload="none" poster="${previewURL(j, o)}" src="${fileURL(j, o)}"></video>`;
    if (k === 'audio') return `<div class="fwave" data-wave="${esc(o.path)}" data-job="${esc(j.id)}" data-m="${o.mtime || 0}"></div><audio controls preload="none" src="${fileURL(j, o)}"></audio>`;
    return '';
  }
  function render() {
    if (!cur || !el || cur.custom) return;
    const id = cur.id, n = nodes.get(id), fh = el.querySelector('.fh'), dyn = el.querySelector('.fdyn'), media = el.querySelector('.fmedia');
    let head = '', body = '', mk = '', mhtml = '';
    if (id.startsWith('j:') || id.startsWith('o:')) {
      const j = jobOf(id); if (!j) { head = '<div><b>Job ended</b></div>'; }
      else {
        const m = S.machines.find(x => x.id === j.machine), d = detail;
        const isOut = id.startsWith('o:'), o = isOut ? (nodes.get(id)?.out || outFor(j)) : null;
        head = `<span class="fst ${j.state}"></span><div><b>${esc(isOut && o ? base(o.path) : j.label)}</b><span>${isOut ? `made by ${esc(j.label)}` : `${esc(j.state)}${j.step ? ' · ' + esc(j.step) : ''}`} · ${esc(m?.name || j.machine)}</span></div>`;
        if (isOut && o) {
          body = `<div class="dgrid">${kv('File', esc(o.path))}${kv('Size', size(o.size))}${kv('Written', o.mtime ? new Date(o.mtime).toLocaleString() + ` (${ago(o.mtime)})` : '')}${kv('Machine', esc(m?.name))}</div>
            ${o.log || kindOf(o.path) === 'text' ? `<div class="dsec"><div class="k">Latest lines</div><pre class="log">${d ? esc(d.logTail || (j.tail || []).join('\n') || '(empty)') : esc((j.tail || []).join('\n'))}</pre></div>` : ''}
            <div class="fact"><button data-open="j:${esc(j.id)}">Open the job</button></div>`;
          mk = o.path + o.mtime; mhtml = mediaHTML(j, o);
        } else {
          const elapsed = j.endedAt ? dur(j.endedAt - j.startedAt) : `<span data-start="${j.startedAt}">${dur(Date.now() - j.startedAt)}</span>`;
          body = `<div class="dgrid">${kv('Elapsed', elapsed)}${kv('Started', new Date(j.startedAt).toLocaleString())}${j.endedAt ? kv('Ended', `${new Date(j.endedAt).toLocaleString()} (${ago(j.endedAt)})`) : ''}
              ${kv('CPU / memory', `${j.cpu.toFixed(1)}% · ${size(j.rss * 1024)}`)}${kv('PID', j.pid)}${j.waitingOn ? kv('Waits for', 'PID ' + j.waitingOn) : ''}
              ${kv('Chat', esc(j.chat?.title || '—'))}${kv('Folder', esc(j.cwd || ''))}${kv('Machine', `${esc(m?.name)}${m?.gpu != null ? ` · GPU ${m.gpu}%` : ''}`)}</div>
            ${!j.endedAt && (cpuHist.get(j.id) || []).length > 2 ? `<div class="dsec"><div class="k">CPU, last ${(cpuHist.get(j.id) || []).length} polls</div><div class="bigspark">${spark(cpuHist.get(j.id), 500, 46, '#7aa36a')}</div></div>` : ''}
            <div class="dsec"><div class="k">Log <span>${esc(j.log ? tildeP(j.log) : 'no log file (stdout not redirected)')}</span></div>${j.log ? `<pre class="log">${d ? esc(d.logTail || '(empty)') : esc((j.tail || []).join('\n')) || 'loading…'}</pre>` : ''}</div>
            <div class="dsec"><div class="k">Command</div><pre>${esc(j.command)}</pre></div>
            ${j.pids?.length ? `<div class="dsec"><div class="k">Processes</div><div class="procs">${j.pids.map(p => `<div><span>${p.pid}</span><span>${p.cpu.toFixed(1)}%</span><span>${size(p.rss * 1024)}</span><span title="${esc(p.cmd)}">${esc(p.cmd)}</span></div>`).join('')}</div></div>` : ''}
            ${typeof killBtn === 'function' ? killBtn(j) : ''}
            <div class="fact"><button data-pick="${esc(j.id)}">Show in list</button></div>`;
          const outs = (d?.outputs || j.outs || []).slice(0, 8);
          mk = outs.map(o => o.path + o.mtime).join('|');
          const medias = outs.filter(o => ['image', 'video', 'audio'].includes(kindOf(o.path))).slice(0, 4);
          mhtml = outs.length ? `<div class="dsec"><div class="k">What it made <span>newest first</span></div>${medias.map(o => `<div class="fitem"><div class="fname"><b>${esc(base(o.path))}</b><span>${size(o.size)} · ${ago(o.mtime)}</span></div>${mediaHTML(j, o)}</div>`).join('')}
            <div class="outs">${outs.filter(o => !medias.includes(o)).map(o => `<div><span title="${esc(o.path)}">${esc(o.path)}</span><span>${size(o.size)}</span><span>${ago(o.mtime)}</span></div>`).join('')}</div></div>` : '';
        }
      }
    } else if (id.startsWith('c:')) {
      const c = n?.chat, ch = c?.chat, acts = ch?.sessionId ? (S.activity?.[ch.sessionId] || []) : [];
      head = `<span class="fst ${ch?.status || ''}"></span><div><b>${esc(ch?.title || 'Not linked to a chat')}</b><span>${esc(ch?.status || 'closed')}${ch?.cwd ? ' · ' + esc(tildeP(ch.cwd)) : ''}</span></div>`;
      body = `${acts.length ? `<div class="dsec"><div class="k">What it is doing <span>latest first</span></div><div class="acts">${acts.map(a => `<div class="act ${a.kind}"><span class="ak">${a.kind === 'tool' ? 'ran' : a.kind === 'user' ? 'you' : 'said'}</span><span class="as">${esc(a.s)}</span><span class="at">${a.t ? ago(a.t) : ''}</span></div>`).join('')}</div></div>` : ''}
        <div class="dsec"><div class="k">Jobs</div>${(c?.jobs || []).length ? c.jobs.map(j => `<button class="jrow ${j.state}" data-open="j:${esc(j.id)}"><span class="fst ${j.state}"></span><b>${esc(j.label)}</b><span>${esc(S.machines.find(x => x.id === j.machine)?.name || j.machine)} · ${j.endedAt ? j.state : dur(Date.now() - j.startedAt)}</span></button>`).join('') : '<span class="muted">nothing running</span>'}</div>
        ${ch?.sessionId ? `<div class="dgrid">${kv('Session', esc(ch.sessionId))}${kv('Linked', ch.via === 'transcript' ? 'by command (remote Mac)' : 'by process')}</div>` : ''}`;
    } else if (id.startsWith('z:') || id.startsWith('g:') || id.startsWith('m:')) {
      const mid = id.slice(2), m = S.machines.find(x => x.id === mid) || {}, jobs = S.live.filter(j => j.machine === mid);
      const dec = declaredFor(m);
      head = `<span class="fst ${m.online ? 'running' : 'failed'}"></span><div><b>${esc(m.name)}</b><span>${mid === 'remote' ? `${esc(m.host)} · one shared ssh connection` : 'this Mac'} · ${m.online ? 'online' : 'offline'}</span></div>`;
      body = `<div class="dgrid">${kv('GPU', m.gpu == null ? '—' : m.gpu + '%')}${kv('Memory free', m.memFree == null ? '—' : m.memFree + '%')}${kv('Load', esc(m.load ?? '—'))}${kv('Last poll', m.polledAt ? ago(m.polledAt) : '—')}${m.error ? kv('Error', esc(m.error)) : ''}${dec ? kv('Declared', `${esc(dec.job)} (${esc(dec.state)})`) : ''}</div>
        <div class="dsec"><div class="k">GPU history</div><div class="bigspark">${spark(gpuHist[mid], 500, 50, '#e9a23b', 100) || '<span class="muted">collecting…</span>'}</div></div>
        <div class="dsec"><div class="k">Memory free history</div><div class="bigspark">${spark(memHist[mid], 500, 40, '#7aa36a', 100) || '<span class="muted">collecting…</span>'}</div></div>
        <div class="dsec"><div class="k">Running here</div>${jobs.filter(j => j.kind === 'job').map(j => `<button class="jrow ${j.state}" data-open="j:${esc(j.id)}"><span class="fst ${j.state}"></span><b>${esc(j.label)}</b><span>${esc(j.chat?.title || '')} · ${dur(Date.now() - j.startedAt)}</span></button>`).join('') || '<span class="muted">nothing heavy</span>'}</div>
        ${jobs.some(j => j.kind === 'service') ? `<div class="dsec"><div class="k">Services</div>${jobs.filter(j => j.kind === 'service').map(j => `<div class="muted mono">${esc(j.label)} · ${dur(Date.now() - j.startedAt)}</div>`).join('')}</div>` : ''}`;
    }
    if (fh.innerHTML !== head) fh.innerHTML = head;
    const pre = dyn.querySelector('pre.log'), atBottom = !pre || pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
    dyn.innerHTML = body;
    const p2 = dyn.querySelector('pre.log'); if (p2 && atBottom) p2.scrollTop = p2.scrollHeight;
    // media players are rebuilt only when the set of files changes and nothing is playing
    const playing = [...media.querySelectorAll('audio,video')].some(m => !m.paused);
    if (mk !== mediaKey && !playing) { mediaKey = mk; media.innerHTML = mhtml; fillWaves(media); wirePlayers(media); }
  }
  function wirePlayers(scope) {
    scope.querySelectorAll('audio').forEach(a => {
      const w = a.previousElementSibling; if (!w?.classList.contains('fwave')) return;
      a.addEventListener('timeupdate', () => { const p = a.duration ? a.currentTime / a.duration : 0; w.style.setProperty('--p', (p * 100).toFixed(2) + '%'); });
      w.addEventListener('click', ev => { const r = w.getBoundingClientRect(); if (a.duration) a.currentTime = (ev.clientX - r.left) / r.width * a.duration; a.play(); });
    });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('pointerdown', e => { if (el?.classList.contains('on') && !el.contains(e.target) && !e.target.closest?.('.mn')) close(); });
  function custom(head, body, width) {
    ensure(); clearInterval(timer); el.querySelectorAll('audio,video').forEach(m => m.pause());
    cur = { id: 'custom', custom: true };
    el.querySelector('.fh').innerHTML = head; el.querySelector('.fdyn').innerHTML = body; el.querySelector('.fmedia').innerHTML = ''; mediaKey = '';
    el.classList.add('on'); position(null);
    if (!el.classList.contains('sheet')) { const w = Math.min(width || 520, innerWidth - 32); el.style.width = w + 'px'; el.style.left = (innerWidth - w) / 2 + 'px'; el.style.top = '90px'; }
    return el;
  }
  return { open: openId, close, custom, refresh: () => { if (cur) render(); } };
})();

document.addEventListener('click', ev => {
  const el = ev.target.closest?.('.mn'); if (!el || !root?.contains(el) || el.classList.contains('more')) return;
  Card.open(el.dataset.id, el);
});

window.JobMap = { init, update, card: Card, setSnap: v => { snap = v; } };
})();
