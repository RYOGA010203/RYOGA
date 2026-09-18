/* PocketTuner – main UI / audio glue. Depends on js/pitch.js and js/tunings.js. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tuningBtn: $('tuningBtn'), tuningIcon: $('tuningIcon'), tuningInst: $('tuningInst'), tuningName: $('tuningName'),
    settingsBtn: $('settingsBtn'), status: $('status'), note: $('note'), octave: $('octave'), cents: $('cents'),
    gauge: $('gauge'), ticks: $('ticks'), needle: $('needle'), freq: $('freq'),
    stringsWrap: $('stringsWrap'), strings: $('strings'), stringsTools: $('stringsTools'), editBtn: $('editBtn'), resetBtn: $('resetBtn'),
    modeAuto: $('modeAuto'), modeManual: $('modeManual'), micBtn: $('micBtn'), micLabel: $('micLabel'),
    startOverlay: $('startOverlay'), startBtn: $('startBtn'),
    tuningSheet: $('tuningSheet'), instTabs: $('instTabs'), tuningList: $('tuningList'),
    settingsSheet: $('settingsSheet'), a4Minus: $('a4Minus'), a4Plus: $('a4Plus'), a4Value: $('a4Value'),
    playTone: $('playTone'), haptics: $('haptics'), volume: $('volume'), volumeValue: $('volumeValue'), pauseMic: $('pauseMic')
  };

  var MIN_MIDI = 24;   // C1 – lowest note a custom string can be set to
  var MAX_MIDI = 84;   // C6

  // ---------------------------------------------------------------- state
  var STORAGE_KEY = 'pockettuner.settings';
  var state = {
    instrument: 'guitar',
    tuning: 'standard',
    mode: 'auto',          // 'auto' | 'manual'
    selected: 0,           // manual string index
    a4: 440,
    playTone: true,
    haptics: true,
    volume: 100,           // reference tone volume, percent
    pauseMic: true,        // stop the mic while a reference tone plays (iOS turns output down otherwise)
    customNotes: {}        // instrument id -> ['D2', 'A2', ...]
  };
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.keys(saved).forEach(function (k) { if (k in state) state[k] = saved[k]; });
  } catch (e) { /* ignore */ }
  if (!TUNINGS.find(state.instrument, state.tuning)) { state.instrument = 'guitar'; state.tuning = 'standard'; }
  state.volume = Math.min(100, Math.max(20, Number(state.volume) || 100));
  (function validateCustom() {
    var clean = {};
    var src = state.customNotes && typeof state.customNotes === 'object' ? state.customNotes : {};
    Object.keys(src).forEach(function (k) {
      var arr = src[k];
      if (!Array.isArray(arr) || !arr.length) return;
      try { arr.forEach(Pitch.parseNote); clean[k] = arr.slice(); } catch (e) { /* drop */ }
    });
    state.customNotes = clean;
  })();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  var current = null;      // { instrument, tuning }
  var strings = [];        // [{ note, midi, name, octave, el, up, down }]
  var done = {};           // string index -> true
  var editing = false;     // per-string ▲▼ visible

  // ---------------------------------------------------------------- gauge
  function buildTicks() {
    var html = '';
    for (var c = -50; c <= 50; c += 5) {
      var a = c * 0.9 * Math.PI / 180;
      var major = c % 10 === 0;
      var r1 = major ? 122 : 126, r2 = major ? 138 : 134;
      var x1 = 160 + r1 * Math.sin(a), y1 = 170 - r1 * Math.cos(a);
      var x2 = 160 + r2 * Math.sin(a), y2 = 170 - r2 * Math.cos(a);
      html += '<line class="' + (major ? 'major' : '') + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
        '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
    }
    el.ticks.innerHTML = html;
  }

  function setNeedle(cents) {
    var c = Math.max(-50, Math.min(50, cents));
    el.needle.style.transform = 'rotate(' + (c * 0.9).toFixed(2) + 'deg)';
  }

  // ---------------------------------------------------------------- tuning data
  /** Notes of a tuning, resolving the custom tuning from saved state. */
  function notesFor(instrument, tuning) {
    if (!tuning.custom) return tuning.notes;
    var savedNotes = state.customNotes[instrument.id];
    return savedNotes && savedNotes.length ? savedNotes : TUNINGS.defaultNotes(instrument.id);
  }

  function pretty(note) { return note.replace('#', '♯').replace(/b(?=-?\d)/, '♭'); }

  function letters(notes) {
    return notes.map(function (n) { return pretty(n).replace(/-?\d+$/, ''); }).join(' ');
  }

  function applyTuning(instrumentId, tuningId) {
    var found = TUNINGS.find(instrumentId, tuningId);
    if (!found) return;
    current = found;
    state.instrument = instrumentId;
    state.tuning = tuningId;
    done = {};
    var notes = notesFor(found.instrument, found.tuning);
    el.tuningIcon.textContent = found.instrument.icon;
    el.tuningInst.textContent = found.instrument.name + (notes.length ? ' · ' + letters(notes) : '');
    el.tuningName.textContent = found.tuning.name;
    rebuildStrings(notes);
    if (state.selected >= strings.length) state.selected = 0;
    renderStrings();
    resetReadout();
    save();
  }

  function rebuildStrings(notes) {
    strings = notes.map(function (n) {
      var midi = Pitch.parseNote(n);
      var nn = Pitch.noteName(midi);
      return { note: n, midi: midi, name: nn.name, octave: nn.octave };
    });
    el.strings.innerHTML = '';
    el.strings.classList.toggle('chromatic', strings.length === 0);
    el.modeAuto.parentElement.hidden = strings.length === 0;
    el.stringsTools.hidden = strings.length === 0;
    if (!strings.length) {
      el.strings.textContent = '近い音名を自動で表示します';
      setEditing(false);
      return;
    }
    strings.forEach(function (s, i) {
      var cell = document.createElement('div');
      cell.className = 'string-cell';

      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'shift up';
      up.textContent = '▲';
      up.setAttribute('aria-label', (i + 1) + '弦を半音上げる');
      up.addEventListener('click', function () { shiftString(i, 1); });

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'string-btn';
      b.innerHTML = pretty(s.name) + '<small>' + s.octave + '</small>';
      b.setAttribute('aria-label', (i + 1) + '弦 ' + s.note);
      b.addEventListener('click', function () { onStringTap(i); });

      var down = document.createElement('button');
      down.type = 'button';
      down.className = 'shift down';
      down.textContent = '▼';
      down.setAttribute('aria-label', (i + 1) + '弦を半音下げる');
      down.addEventListener('click', function () { shiftString(i, -1); });

      cell.appendChild(up); cell.appendChild(b); cell.appendChild(down);
      el.strings.appendChild(cell);
      s.el = b; s.up = up; s.down = down;
    });
  }

  function stringFreq(i) { return Pitch.midiToFreq(strings[i].midi, state.a4); }

  function renderStrings() {
    strings.forEach(function (s, i) {
      s.el.classList.toggle('done', !!done[i]);
      s.el.classList.toggle('active', isManual() ? i === state.selected : i === activeString);
      s.up.disabled = s.midi >= MAX_MIDI;
      s.down.disabled = s.midi <= MIN_MIDI;
    });
  }

  var activeString = -1;

  function onStringTap(i) {
    if (state.mode !== 'manual') setMode('manual');
    state.selected = i;
    save();
    renderStrings();
    if (state.playTone) playReference(stringFreq(i));
    showTarget(i);
  }

  /** Move one string up or down a semitone; the result becomes the instrument's custom tuning. */
  function shiftString(i, delta) {
    var midi = strings[i].midi + delta;
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    var notes = strings.map(function (s) { return s.note; });
    notes[i] = Pitch.noteName(midi).label;
    state.customNotes[current.instrument.id] = notes;
    var wasManual = isManual();
    applyTuning(current.instrument.id, 'custom');
    if (wasManual) { state.selected = i; save(); renderStrings(); showTarget(i); }
    if (state.playTone) playReference(stringFreq(i), 1.2);
  }

  function setEditing(on) {
    editing = !!on && strings.length > 0;
    el.stringsWrap.classList.toggle('editing', editing);
    el.editBtn.textContent = editing ? '完了' : '弦を半音ずつ調整';
    el.editBtn.classList.toggle('active', editing);
    el.resetBtn.hidden = !editing;
  }
  el.editBtn.addEventListener('click', function () { setEditing(!editing); });
  el.resetBtn.addEventListener('click', function () {
    if (!current) return;
    delete state.customNotes[current.instrument.id];
    applyTuning(current.instrument.id, current.instrument.tunings[0].id);
  });

  function setMode(mode) {
    state.mode = mode;
    el.modeAuto.classList.toggle('active', mode === 'auto');
    el.modeManual.classList.toggle('active', mode === 'manual');
    save();
    renderStrings();
    if (isManual()) showTarget(state.selected);
  }

  function isManual() { return state.mode === 'manual' && strings.length > 0; }

  function showTarget(i) {
    var s = strings[i];
    if (!s) return;
    el.note.textContent = pretty(s.name);
    el.octave.textContent = s.octave;
    el.cents.textContent = stringFreq(i).toFixed(1) + ' Hz';
  }

  function resetReadout() {
    activeString = -1;
    setTuneClass('');
    el.needle.classList.add('idle');
    setNeedle(0);
    el.freq.innerHTML = '&nbsp;';
    if (isManual()) {
      showTarget(state.selected);
      el.status.textContent = '弦を弾いてください';
    } else {
      el.note.textContent = '–';
      el.octave.textContent = '';
      el.cents.innerHTML = '&nbsp;';
      el.status.textContent = audio.running ? '弦を弾いてください' : 'マイクを開始してください';
    }
    el.status.classList.remove('good');
  }

  function setTuneClass(cls) {
    document.body.classList.remove('tune-good', 'tune-flat', 'tune-sharp', 'tune-far');
    if (cls) document.body.classList.add(cls);
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(sheet) { sheet.hidden = false; }
  function closeSheet(sheet) { sheet.hidden = true; }
  [el.tuningSheet, el.settingsSheet].forEach(function (sheet) {
    sheet.querySelector('[data-close]').addEventListener('click', function () { closeSheet(sheet); });
  });

  var sheetInstrument = state.instrument;
  function renderTuningSheet() {
    el.instTabs.innerHTML = '';
    TUNINGS.INSTRUMENTS.forEach(function (inst) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-tab' + (inst.id === sheetInstrument ? ' active' : '');
      b.textContent = inst.icon + ' ' + inst.name;
      b.addEventListener('click', function () { sheetInstrument = inst.id; renderTuningSheet(); });
      el.instTabs.appendChild(b);
    });
    el.tuningList.innerHTML = '';
    var inst = TUNINGS.INSTRUMENTS.filter(function (x) { return x.id === sheetInstrument; })[0];
    inst.tunings.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      var active = inst.id === state.instrument && t.id === state.tuning;
      var notes = notesFor(inst, t);
      b.className = 'tuning-item' + (active ? ' active' : '');
      b.innerHTML = '<div><div class="t-name">' + t.name + '</div><div class="t-notes">' +
        (notes.length ? notes.map(pretty).join('  ') : 'すべての音') +
        (t.custom ? '  ·  ▲▼ で弦ごとに変更' : '') +
        '</div></div>' + (active ? '<span class="check">✓</span>' : '');
      b.addEventListener('click', function () {
        applyTuning(inst.id, t.id);
        if (t.custom) setEditing(true);
        closeSheet(el.tuningSheet);
      });
      el.tuningList.appendChild(b);
    });
  }
  el.tuningBtn.addEventListener('click', function () {
    sheetInstrument = state.instrument;
    renderTuningSheet();
    openSheet(el.tuningSheet);
  });

  el.settingsBtn.addEventListener('click', function () { openSheet(el.settingsSheet); });
  function renderA4() { el.a4Value.textContent = state.a4; }
  el.a4Minus.addEventListener('click', function () { state.a4 = Math.max(415, state.a4 - 1); renderA4(); save(); if (isManual()) showTarget(state.selected); });
  el.a4Plus.addEventListener('click', function () { state.a4 = Math.min(466, state.a4 + 1); renderA4(); save(); if (isManual()) showTarget(state.selected); });
  el.playTone.checked = state.playTone;
  el.haptics.checked = state.haptics;
  el.pauseMic.checked = state.pauseMic;
  el.playTone.addEventListener('change', function () { state.playTone = el.playTone.checked; save(); });
  el.haptics.addEventListener('change', function () { state.haptics = el.haptics.checked; save(); });
  el.pauseMic.addEventListener('change', function () { state.pauseMic = el.pauseMic.checked; save(); });
  function renderVolume() { el.volume.value = state.volume; el.volumeValue.textContent = state.volume + '%'; }
  el.volume.addEventListener('input', function () {
    state.volume = Number(el.volume.value);
    renderVolume();
    if (audio.master) audio.master.gain.value = state.volume / 100;
  });
  el.volume.addEventListener('change', function () {
    save();
    // let the user hear the new level right away
    if (strings.length) playReference(stringFreq(isManual() ? state.selected : strings.length - 1), 1.0);
  });

  el.modeAuto.addEventListener('click', function () { setMode('auto'); resetReadout(); });
  el.modeManual.addEventListener('click', function () { setMode('manual'); });

  // ---------------------------------------------------------------- audio
  var MIC_CONSTRAINTS = {
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false
  };
  var audio = {
    ctx: null, stream: null, source: null, input: null, analyser: null, buf: null,
    out: null, master: null,
    running: false, paused: false, resumeTimer: 0,
    raf: 0, lastDetect: 0, wakeLock: null, muteUntil: 0
  };
  var history = [];          // recent { t, freq }
  var lastHeard = 0;
  var inTuneSince = 0;

  /** Create the AudioContext and the analysis / output graph once (must be called from a user gesture). */
  function ensureContext() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio.ctx) {
      var ctx = audio.ctx = new AC({ latencyHint: 'interactive' });

      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 25;
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      hp.connect(analyser);
      audio.input = hp;
      audio.analyser = analyser;
      audio.buf = new Float32Array(analyser.fftSize);

      // reference tone output: compressor keeps the loud, harmonic-rich tone from clipping
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      var master = ctx.createGain();
      master.gain.value = state.volume / 100;
      comp.connect(master);
      master.connect(ctx.destination);
      audio.out = comp;
      audio.master = master;
    }
    return audio.ctx;
  }

  function openMic() {
    return navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS).then(function (stream) {
      closeMic();
      audio.stream = stream;
      audio.source = audio.ctx.createMediaStreamSource(stream);
      audio.source.connect(audio.input);
      history = [];
    });
  }

  function closeMic() {
    if (audio.stream) { audio.stream.getTracks().forEach(function (t) { t.stop(); }); audio.stream = null; }
    if (audio.source) { try { audio.source.disconnect(); } catch (e) { /* ignore */ } audio.source = null; }
  }

  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ensureContext()) {
      return Promise.reject(new Error('このブラウザはマイク入力に対応していません。Safari で開いてください。'));
    }
    var ctx = audio.ctx;
    var resume = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    return resume.then(openMic).then(function () {
      audio.running = true;
      audio.paused = false;
      el.micBtn.classList.add('on');
      el.micLabel.textContent = 'マイク ON';
      resetReadout();
      requestWakeLock();
      loop(performance.now());
    });
  }

  function stop() {
    audio.running = false;
    audio.paused = false;
    clearTimeout(audio.resumeTimer);
    cancelAnimationFrame(audio.raf);
    closeMic();
    if (audio.wakeLock) { audio.wakeLock.release().catch(function () {}); audio.wakeLock = null; }
    el.micBtn.classList.remove('on');
    el.micLabel.textContent = 'マイク開始';
    resetReadout();
  }

  /** Release the microphone for a while (iOS lowers speaker output while capturing). */
  function pauseMicFor(ms) {
    if (!audio.running) return;
    clearTimeout(audio.resumeTimer);
    if (!audio.paused) {
      audio.paused = true;
      closeMic();
      idle();
    }
    el.status.textContent = '参考音を再生中…';
    audio.resumeTimer = setTimeout(resumeMic, ms);
  }

  function resumeMic() {
    if (!audio.running || !audio.paused) return;
    var ctx = audio.ctx;
    (ctx.state !== 'running' ? ctx.resume() : Promise.resolve()).then(openMic).then(function () {
      if (!audio.running) { closeMic(); return; }
      audio.paused = false;
      lastHeard = performance.now();
      el.status.textContent = '弦を弾いてください';
    }).catch(function () {
      stop();
      el.status.textContent = 'マイクを再開できませんでした。マイクボタンで再開してください';
    });
  }

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) { audio.wakeLock = lock; }).catch(function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && audio.running) {
      if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(function () {});
      requestWakeLock();
    }
  });

  var DETECT_INTERVAL = 33;   // ms
  var HOLD_MS = 500;          // how long to stay in tune before marking a string "done"
  var SILENCE_MS = 700;       // after this, fall back to idle display

  function loop(now) {
    if (!audio.running) return;
    audio.raf = requestAnimationFrame(loop);
    if (audio.paused) return;
    if (now - audio.lastDetect < DETECT_INTERVAL) return;
    audio.lastDetect = now;
    if (now < audio.muteUntil) return;

    audio.analyser.getFloatTimeDomainData(audio.buf);
    var r = Pitch.detect(audio.buf, audio.ctx.sampleRate);
    if (r) {
      lastHeard = now;
      history.push({ t: now, freq: r.freq });
      while (history.length && now - history[0].t > 250) history.shift();
      if (history.length > 7) history.shift();
      update(medianFreq(), now);
    } else if (now - lastHeard > SILENCE_MS) {
      idle();
    }
  }

  function medianFreq() {
    var f = history.map(function (h) { return h.freq; }).sort(function (a, b) { return a - b; });
    return f[Math.floor(f.length / 2)];
  }

  function idle() {
    if (el.needle.classList.contains('idle')) return;
    el.needle.classList.add('idle');
    setNeedle(0);
    setTuneClass('');
    el.status.classList.remove('good');
    el.freq.innerHTML = '&nbsp;';
    inTuneSince = 0;
    if (!isManual()) {
      activeString = -1;
      renderStrings();
      el.note.textContent = '–';
      el.octave.textContent = '';
      el.cents.innerHTML = '&nbsp;';
      el.status.textContent = '弦を弾いてください';
    } else {
      showTarget(state.selected);
      el.status.textContent = '弦を弾いてください';
    }
  }

  function update(freq, now) {
    el.needle.classList.remove('idle');
    var targetFreq, label, octave, idx = -1;

    if (!strings.length) {
      // chromatic mode: nearest semitone
      var midi = Pitch.freqToMidi(freq, state.a4);
      var nn = Pitch.noteName(midi);
      targetFreq = Pitch.midiToFreq(nn.midi, state.a4);
      label = nn.name; octave = nn.octave;
    } else {
      if (isManual()) {
        idx = state.selected;
      } else {
        var best = Infinity;
        for (var i = 0; i < strings.length; i++) {
          var d = Math.abs(Pitch.centsBetween(freq, stringFreq(i)));
          if (d < best) { best = d; idx = i; }
        }
      }
      targetFreq = stringFreq(idx);
      label = strings[idx].name; octave = strings[idx].octave;
    }

    var cents = Pitch.centsBetween(freq, targetFreq);
    if (idx !== activeString) { activeString = idx; renderStrings(); }

    el.note.textContent = pretty(label);
    el.octave.textContent = octave;
    var rounded = Math.round(cents);
    el.cents.textContent = (rounded > 0 ? '+' : '') + rounded + ' cent';
    el.freq.textContent = freq.toFixed(1) + ' Hz';
    setNeedle(cents);

    var abs = Math.abs(cents);
    if (abs <= 5) {
      setTuneClass('tune-good');
      el.status.textContent = '合っています ✓';
      el.status.classList.add('good');
      if (!inTuneSince) inTuneSince = now;
      if (idx >= 0 && !done[idx] && now - inTuneSince > HOLD_MS) {
        done[idx] = true;
        renderStrings();
        if (state.haptics && navigator.vibrate) navigator.vibrate(30);
      }
    } else {
      inTuneSince = 0;
      el.status.classList.remove('good');
      if (abs > 50) {
        setTuneClass('tune-far');
        el.status.textContent = cents < 0 ? '大きく低い ↑ 巻き上げてください' : '大きく高い ↓ 緩めてください';
      } else if (cents < 0) {
        setTuneClass('tune-flat');
        el.status.textContent = '少し低い ↑ 上げてください';
      } else {
        setTuneClass('tune-sharp');
        el.status.textContent = '少し高い ↓ 下げてください';
      }
    }
  }

  // ---------------------------------------------------------------- reference tone
  /**
   * Plucked-string style tone: two slightly detuned saws + triangle + octave
   * and twelfth sines, through a closing lowpass and a percussive envelope.
   * Phone speakers barely reproduce low fundamentals, so the harmonics carry
   * the note; the compressor in ensureContext() keeps the level high.
   */
  function playReference(freq, dur) {
    var ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(function () {});
    dur = dur || 2.2;
    var t0 = ctx.currentTime + 0.02;

    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.012);
    env.gain.setValueAtTime(1, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.4, t0 + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(9000, freq * 24), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(600, freq * 4), t0 + dur);

    var voices = [
      [freq, 'sawtooth', 0.45, 0],
      [freq, 'sawtooth', 0.35, 5],
      [freq, 'triangle', 0.5, 0],
      [freq * 2, 'sine', 0.3, 0],
      [freq * 3, 'sine', 0.12, 0]
    ];
    voices.forEach(function (spec) {
      var o = ctx.createOscillator();
      o.type = spec[1];
      o.frequency.value = spec[0];
      o.detune.value = spec[3];
      var g = ctx.createGain();
      g.gain.value = spec[2];
      o.connect(g); g.connect(lp);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
    lp.connect(env);
    env.connect(audio.out);

    if (state.pauseMic && audio.running) {
      pauseMicFor(dur * 1000 + 250);
    } else {
      // don't let the microphone "hear" our own reference tone
      audio.muteUntil = performance.now() + dur * 1000 + 100;
      history = [];
    }
  }

  // ---------------------------------------------------------------- start / mic button
  function beginFromGesture(btn) {
    btn.disabled = true;
    start().then(function () {
      el.startOverlay.hidden = true;
    }).catch(function (err) {
      var msg;
      if (err && err.name === 'NotAllowedError') {
        msg = window.top !== window.self
          ? 'マイクを使う許可が得られませんでした。埋め込み表示ではマイクを使えないことがあります。Safari で直接開くか、GitHub Pages などに公開した URL から開いてください。'
          : 'マイクの使用が許可されていません。設定 › Safari › マイク で許可してください。';
      } else {
        msg = (err && err.message) || 'マイクを開始できませんでした。';
      }
      el.startOverlay.hidden = false;
      el.startOverlay.querySelector('p').textContent = msg;
    }).then(function () { btn.disabled = false; });
  }
  el.startBtn.addEventListener('click', function () { beginFromGesture(el.startBtn); });
  el.micBtn.addEventListener('click', function () {
    if (audio.running) stop(); else beginFromGesture(el.micBtn);
  });

  // ---------------------------------------------------------------- init
  buildTicks();
  renderA4();
  renderVolume();
  applyTuning(state.instrument, state.tuning);
  setMode(state.mode);
  resetReadout();

  /* sw:start */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
  /* sw:end */

  // expose a little for debugging / tests
  window.PocketTuner = { state: state, start: start, stop: stop, update: update, strings: function () { return strings; } };
})();
