// JobTrail sound: small, subtle electronic sounds for what the screen is showing, made live with Web Audio
// (no sound files), only for events: a rising blip when a job starts, a two-note chime when one finishes, a low
// soft tone when one fails, tiny clicks for the UI. No continuous sound: the old low hum and per-pulse ticks played
// constantly (once per open window) and came out as static/buzz on laptop and phone speakers. Muted state is
// remembered per device. The audio engine is suspended while the page is hidden.
(() => {
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let ctx = null, master = null, muted = store.get('jt.muted') === '1';
  let running = 0, known = null;
  const VOL = 0.55; // overall level (everything is quiet on top of this)

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -28; comp.ratio.value = 6; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = muted || document.hidden ? 0 : VOL; master.connect(comp);
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return ctx;
  }
  // browsers only start audio after a click or tap; the Mac app allows it straight away
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (!muted) ensure(); }, { passive: true });

  function tone(freq, { at = 0, dur = .12, type = 'sine', gain = .03, attack = .004, glideTo = null, filter = null } = {}) {
    if (muted || document.hidden || !ensure()) return;
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
    start() { tone(midi(76), { dur: .14, gain: .028 }); tone(midi(83), { at: .07, dur: .2, gain: .024 }); },
    done() { tone(midi(81), { dur: .5, gain: .03, type: 'triangle', filter: 3500 }); tone(midi(88), { at: .12, dur: .7, gain: .025, type: 'triangle', filter: 3500 }); },
    fail() { tone(midi(52), { dur: .5, gain: .04, type: 'triangle', filter: 900, glideTo: midi(48) }); },
    open() { tone(midi(91), { dur: .04, gain: .016, type: 'square', filter: 2500 }); tone(midi(98), { at: .03, dur: .05, gain: .01 }); },
    close() { tone(midi(93), { dur: .04, gain: .012, type: 'square', filter: 2200, glideTo: midi(86) }); },
    tab() { tone(midi(88), { dur: .03, gain: .012, type: 'square', filter: 3000 }); },
  };

  // compare each live snapshot with the last one to hear starts, finishes and failures
  function update(state) {
    const jobs = (state.live || []).filter((j) => j.kind === 'job');
    running = jobs.filter((j) => j.state === 'running').length;
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
  }

  function setMuted(m) {
    muted = m; store.set('jt.muted', m ? '1' : '0');
    if (ctx) master.gain.setTargetAtTime(m || document.hidden ? 0 : VOL, ctx.currentTime, .15);
    document.querySelectorAll('[data-sound-btn]').forEach((b) => { b.classList.toggle('off', m); b.title = m ? 'Sound off · click to turn on' : 'Sound on · click to mute'; b.setAttribute('aria-pressed', String(!m)); });
  }
  // hidden page: stop the audio engine entirely (no output, no CPU); it resumes when shown
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else { master.gain.value = muted ? 0 : VOL; ctx.resume().catch(() => {}); }
  });

  window.Sound = {
    update, ui: (name) => S[name]?.(), toggle: () => { ensure(); setMuted(!muted); if (!muted) S.tab(); },
    get muted() { return muted; }, init: () => setMuted(muted),
    get state() { return { engine: ctx ? ctx.state : 'not started', running, out: master ? +master.gain.value.toFixed(3) : 0 }; },
  };
})();
