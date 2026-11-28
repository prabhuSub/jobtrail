// JobTrail sound: small, subtle electronic sounds for what the screen is showing, made live with Web Audio
// (no sound files). While anything runs: a very low hum and soft ticks in step with the pulses. Events: a rising
// blip when a job starts, a two-note chime when one finishes, a low soft tone when one fails, tiny clicks for the UI.
// Nothing running = silence. Muted state is remembered per device. Paused while the page is hidden.
// Three profiles (remembered per device): Classic (above, the default), Beige PC 2000s (PC-speaker beeps, a tiny
// tick on each pulse) and Sound card 1990s (FM-synth bloops, a soft blip on each pulse).
(() => {
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let ctx = null, master = null, humGain = null, humFilter = null, muted = store.get('jt.muted') === '1';
  const NAMES = { classic: 'Classic', beige: 'Beige PC · 2000s', nineties: 'Sound card · 1990s' };
  let profile = NAMES[store.get('jt.soundProfile')] ? store.get('jt.soundProfile') : 'classic';
  let running = 0, writing = 0, known = null, tickTimer = null;
  const PENTA = [0, 2, 4, 7, 9, 12, 14]; // soft pentatonic steps for the ticks
  const VOL = 0.55; // overall level (everything is quiet on top of this)

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      // 'playback' = a larger audio buffer: these sounds don't need instant timing, and it rides through CPU spikes
      // (heavy builds/renders) that otherwise drop audio and crackle in the speakers
      // v2: a 200 ms buffer (numeric hint asks for more than 'playback') — rides through GPU-heavy renders too
      try { ctx = new AC({ latencyHint: 0.2 }); } catch { try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); } }
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -28; comp.ratio.value = 6; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = muted || document.hidden ? 0 : VOL; master.connect(comp);
      // hum: the same low sines + slowly breathing lowpass, but rendered ONCE into a 10 s seamless loop (all tones fit
      // whole cycles in 10 s) and played as one looping buffer. Computing oscillators + an audio-rate filter sweep live
      // dropped out under heavy GPU renders (heard as static); a looping buffer costs the audio thread almost nothing.
      humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 400; humFilter.Q.value = 0.7;
      humGain = ctx.createGain(); humGain.gain.value = 0; humFilter.connect(humGain); humGain.connect(master);
      renderHum(ctx.sampleRate).then((buf) => {
        if (!buf) return;
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(humFilter); src.start();
      });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  async function renderHum(rate) {
    try {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
      const L = 10, W = 2, off = new OAC(1, rate * (L + W), rate);   // +2 s warm-up so the filter has settled
      const f = off.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 2; f.connect(off.destination);
      for (const [hz, g] of [[55, .6], [82.5, .35], [110.4, .12]]) {   // 550, 825, 1104 cycles in 10 s → seamless
        const o = off.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
        const og = off.createGain(); og.gain.value = g; o.connect(og); og.connect(f); o.start();
      }
      const lfo = off.createOscillator(); lfo.frequency.value = 0.1; const lg = off.createGain(); lg.gain.value = 70;   // 1 breath per loop
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      const full = await off.startRendering(), out = new AudioBuffer({ length: rate * L, sampleRate: rate, numberOfChannels: 1 });
      out.copyToChannel(full.getChannelData(0).subarray(rate * W, rate * (W + L)), 0);   // seconds 2–12: one whole period
      return out;
    } catch { return null; }
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
  // PC speaker: square wave, instant on/off, slightly muffled by the case
  function beep(freq, at = 0, dur = .09, gain = .022) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 3200;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .002); g.gain.setValueAtTime(gain, t + dur - .003); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  // 1990s sound card (OPL-style FM): a sine carrier wobbled by a sine modulator whose depth decays, so notes go
  // from bright to round. ratio picks the timbre: 1 = brass/organ, 2 = bell, 3.5 = clangy
  function fm(freq, { at = 0, dur = .18, gain = .03, ratio = 1, index = 3, glideTo = null } = {}) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at, c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.setValueAtTime(freq, t); m.frequency.setValueAtTime(freq * ratio, t);
    if (glideTo) { c.frequency.exponentialRampToValueAtTime(glideTo, t + dur); m.frequency.exponentialRampToValueAtTime(glideTo * ratio, t + dur); }
    mg.gain.setValueAtTime(freq * index, t); mg.gain.exponentialRampToValueAtTime(freq * .2 + 1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .006); g.gain.setValueAtTime(gain, t + dur * .3); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(master); m.start(t); c.start(t); m.stop(t + dur + .05); c.stop(t + dur + .05);
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---- the sounds ----
  const classic = {
    tick() { const n = 84 + PENTA[Math.floor(Math.random() * PENTA.length)]; tone(midi(n), { dur: .07, gain: .012 + Math.min(.01, running * .002), type: 'sine' }); },
    shimmer() { tone(midi(96 + PENTA[Math.floor(Math.random() * 4)]), { dur: .05, gain: .006, type: 'triangle', filter: 6000 }); },
    start() { tone(midi(76), { dur: .14, gain: .028 }); tone(midi(83), { at: .07, dur: .2, gain: .024 }); },
    done() { tone(midi(81), { dur: .5, gain: .03, type: 'triangle', filter: 3500 }); tone(midi(88), { at: .12, dur: .7, gain: .025, type: 'triangle', filter: 3500 }); },
    fail() { tone(midi(52), { dur: .5, gain: .04, type: 'triangle', filter: 900, glideTo: midi(48) }); },
    open() { tone(midi(91), { dur: .04, gain: .016, type: 'square', filter: 2500 }); tone(midi(98), { at: .03, dur: .05, gain: .01 }); },
    close() { tone(midi(93), { dur: .04, gain: .012, type: 'square', filter: 2200, glideTo: midi(86) }); },
    tab() { tone(midi(88), { dur: .03, gain: .012, type: 'square', filter: 3000 }); },
  };
  const PROFILES = {
    classic,
    beige: {   // beeps only: a tiny PC-speaker tick on each pulse while jobs run
      tick() { beep(midi(84 + pick(PENTA)), 0, .014, .007 + Math.min(.005, running * .001)); },
      shimmer() { beep(midi(96 + pick(PENTA.slice(0, 4))), 0, .01, .005); },
      start() { beep(1000, 0, .11); },
      done() { beep(988, 0, .09); beep(1319, .13, .16); },
      fail() { beep(392, 0, .12, .026); beep(392, .19, .12, .026); beep(294, .38, .3, .028); },
      open() { beep(2093, 0, .018, .012); },
      close() { beep(1568, 0, .018, .01); },
      tab() { beep(1760, 0, .012, .01); },
    },
    nineties: {
      tick() { fm(midi(60 + pick(PENTA.slice(0, 5))), { dur: .12, gain: .012 + Math.min(.008, running * .0015), ratio: 2, index: 1.5 }); },
      shimmer() { fm(midi(84 + pick(PENTA.slice(0, 4))), { dur: .06, gain: .007, ratio: 3.5, index: 1 }); },
      start() { fm(midi(67), { dur: .12, gain: .03, ratio: 1, index: 2.5 }); fm(midi(74), { at: .09, dur: .2, gain: .028, ratio: 1, index: 2.5 }); },
      done() { [72, 76, 79, 84].forEach((n, i) => fm(midi(n), { at: i * .075, dur: i === 3 ? .45 : .14, gain: .028, ratio: 2, index: 2 })); },
      fail() { fm(midi(55), { dur: .22, gain: .035, ratio: 1, index: 4 }); fm(midi(50), { at: .2, dur: .55, gain: .035, ratio: 1, index: 4, glideTo: midi(43) }); },
      open() { fm(midi(88), { dur: .07, gain: .018, ratio: 2, index: 1.5 }); },
      close() { fm(midi(83), { dur: .07, gain: .015, ratio: 2, index: 1.5, glideTo: midi(79) }); },
      tab() { fm(midi(91), { dur: .045, gain: .014, ratio: 3.5, index: 1 }); },
    },
  };
  const S = new Proxy({}, { get: (_, k) => PROFILES[profile][k] });   // S.done() etc. play the chosen profile

  // hum level follows how much is running; silence when nothing is
  function applyAmbient() {
    if (!ctx) return;
    const target = muted || !running || profile !== 'classic' ? 0 : Math.min(.05, .018 + running * .006);
    humGain.gain.setTargetAtTime(target, ctx.currentTime, .8);
    humFilter.frequency.setTargetAtTime(260 + Math.min(running, 6) * 40, ctx.currentTime, 1.2);   // brighter as more runs
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

  function setProfile(p) {
    if (!NAMES[p]) return;
    profile = p; store.set('jt.soundProfile', p); ensure(); applyAmbient(); scheduleTicks();
    if (muted) setMuted(false); S.done();   // play a sample so the choice is heard
    document.querySelectorAll('[data-sound-profile]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.soundProfile === p)));
  }

  window.Sound = {
    get profile() { return profile; }, profiles: NAMES, setProfile,
    update, ui: (name) => S[name]?.(), toggle: () => { ensure(); setMuted(!muted); if (!muted) S.tab(); },
    get muted() { return muted; }, init: () => setMuted(muted),
    get state() { return { engine: ctx ? ctx.state : 'not started', profile, running, hum: humGain ? +humGain.gain.value.toFixed(4) : 0, out: master ? +master.gain.value.toFixed(3) : 0 }; },
  };
})();
