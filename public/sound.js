// JobTrail sound: small, subtle electronic sounds for what the screen is showing, made live with Web Audio
// (no sound files). While anything runs: a very low hum and soft ticks in step with the pulses. Events: a rising
// blip when a job starts, a two-note chime when one finishes, a low soft tone when one fails, tiny clicks for the UI.
// Nothing running = silence. Muted state is remembered per device. Paused while the page is hidden.
(() => {
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let ctx = null, master = null, humGain = null, humFilter = null, muted = store.get('jt.muted') === '1';
  let running = 0, writing = 0, known = null, tickTimer = null;
  const PENTA = [0, 2, 4, 7, 9, 12, 14]; // soft pentatonic steps for the ticks
  const VOL = 0.55; // overall level (everything is quiet on top of this)

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      // 'playback' = a larger audio buffer: these sounds don't need instant timing, and it rides through CPU spikes
      // (heavy builds/renders) that otherwise drop audio and crackle in the speakers
      try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); }
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -28; comp.ratio.value = 6; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = muted || document.hidden ? 0 : VOL; master.connect(comp);
      // hum: two detuned low sines through a lowpass that breathes slowly
      humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 220; humFilter.Q.value = 2;
      humGain = ctx.createGain(); humGain.gain.value = 0; humFilter.connect(humGain); humGain.connect(master);
      for (const [f, g] of [[55, .6], [82.6, .35], [110.4, .12]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(humFilter); o.start();
      }
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 70;
      lfo.connect(lg); lg.connect(humFilter.frequency); lfo.start();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // browsers only start audio after a click or tap; the Mac app allows it straight away
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { ensure(); applyAmbient(); }, { passive: true });

  function tone(freq, { at = 0, dur = .12, type = 'sine', gain = .03, attack = .004, glideTo = null, filter = null } = {}) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---- the sounds ----
  const S = {
    tick() { const n = 84 + PENTA[Math.floor(Math.random() * PENTA.length)]; tone(midi(n), { dur: .07, gain: .012 + Math.min(.01, running * .002), type: 'sine' }); },
    shimmer() { tone(midi(96 + PENTA[Math.floor(Math.random() * 4)]), { dur: .05, gain: .006, type: 'triangle', filter: 6000 }); },
    start() { tone(midi(76), { dur: .14, gain: .028 }); tone(midi(83), { at: .07, dur: .2, gain: .024 }); },
    done() { tone(midi(81), { dur: .5, gain: .03, type: 'triangle', filter: 3500 }); tone(midi(88), { at: .12, dur: .7, gain: .025, type: 'triangle', filter: 3500 }); },
    fail() { tone(midi(52), { dur: .5, gain: .04, type: 'triangle', filter: 900, glideTo: midi(48) }); },
    open() { tone(midi(91), { dur: .04, gain: .016, type: 'square', filter: 2500 }); tone(midi(98), { at: .03, dur: .05, gain: .01 }); },
    close() { tone(midi(93), { dur: .04, gain: .012, type: 'square', filter: 2200, glideTo: midi(86) }); },
    tab() { tone(midi(88), { dur: .03, gain: .012, type: 'square', filter: 3000 }); },
  };

  // hum level follows how much is running; silence when nothing is
  function applyAmbient() {
    if (!ctx) return;
    const target = muted || !running ? 0 : Math.min(.05, .018 + running * .006);
    humGain.gain.setTargetAtTime(target, ctx.currentTime, .8);
    humFilter.frequency.setTargetAtTime(160 + Math.min(running, 6) * 30, ctx.currentTime, 1.2);
  }
  // ticks in step with the pulses (a run line sends a dot about every 0.87 s); none when idle
  function scheduleTicks() {
    clearTimeout(tickTimer);
    if (!running || muted) return;
    tickTimer = setTimeout(() => {
      if (!document.hidden) { S.tick(); if (writing && Math.random() < .5) setTimeout(S.shimmer, 180); }
      scheduleTicks();
    }, 870 + (Math.random() * 160 - 80));
  }

  // compare each live snapshot with the last one to hear starts, finishes and failures
  function update(state) {
    const jobs = (state.live || []).filter((j) => j.kind === 'job');
    running = jobs.filter((j) => j.state === 'running').length;
    writing = jobs.filter((j) => (j.outs || []).some((o) => Date.now() - o.mtime < 120000)).length;
    const now = new Map(jobs.map((j) => [j.id, j.state]));
    if (known) {
      let started = 0;
      for (const [id] of now) if (!known.has(id)) started++;
      const recent = new Map((state.recent || []).map((j) => [j.id, j.state]));
      let done = 0, failed = 0;
      for (const [id] of known) if (!now.has(id)) { const st = recent.get(id); if (st === 'failed') failed++; else if (st) done++; }
      if (failed) S.fail(); else if (done) S.done();
      if (started) setTimeout(S.start, failed || done ? 260 : 0);
    }
    known = now;
    applyAmbient(); scheduleTicks();
  }

  function setMuted(m) {
    muted = m; store.set('jt.muted', m ? '1' : '0');
    if (ctx) master.gain.setTargetAtTime(m || document.hidden ? 0 : VOL, ctx.currentTime, .15);
    applyAmbient(); scheduleTicks();
    document.querySelectorAll('[data-sound-btn]').forEach((b) => { b.classList.toggle('off', m); b.title = m ? 'Sound off · click to turn on' : 'Sound on · click to mute'; b.setAttribute('aria-pressed', String(!m)); });
  }
  document.addEventListener('visibilitychange', () => { if (ctx) master.gain.setTargetAtTime(muted || document.hidden ? 0 : VOL, ctx.currentTime, .2); });

  window.Sound = {
    update, ui: (name) => S[name]?.(), toggle: () => { ensure(); setMuted(!muted); if (!muted) S.tab(); },
    get muted() { return muted; }, init: () => setMuted(muted),
    get state() { return { engine: ctx ? ctx.state : 'not started', running, hum: humGain ? +humGain.gain.value.toFixed(4) : 0, out: master ? +master.gain.value.toFixed(3) : 0 }; },
  };
})();
