/* PocketTuner – main UI / audio glue. Depends on js/pitch.js and js/tunings.js. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tuningBtn: $('tuningBtn'), tuningIcon: $('tuningIcon'), tuningInst: $('tuningInst'), tuningName: $('tuningName'),
    settingsBtn: $('settingsBtn'), status: $('status'), note: $('note'), octave: $('octave'), cents: $('cents'),
    gauge: $('gauge'), ticks: $('ticks'), needle: $('needle'), freq: $('freq'), strings: $('strings'),
    modeAuto: $('modeAuto'), modeManual: $('modeManual'), micBtn: $('micBtn'), micLabel: $('micLabel'),
    startOverlay: $('startOverlay'), startBtn: $('startBtn'),
    tuningSheet: $('tuningSheet'), instTabs: $('instTabs'), tuningList: $('tuningList'),
    settingsSheet: $('settingsSheet'), a4Minus: $('a4Minus'), a4Plus: $('a4Plus'), a4Value: $('a4Value'),
    playTone: $('playTone'), haptics: $('haptics')
  };

  // ---------------------------------------------------------------- state
  var STORAGE_KEY = 'pockettuner.settings';
  var state = {
    instrument: 'guitar',
    tuning: 'standard',
    mode: 'auto',          // 'auto' | 'manual'
    selected: 0,           // manual string index
    a4: 440,
    playTone: true,
    haptics: true
  };
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.keys(saved).forEach(function (k) { if (k in state) state[k] = saved[k]; });
  } catch (e) { /* ignore */ }
  if (!TUNINGS.find(state.instrument, state.tuning)) { state.instrument = 'guitar'; state.tuning = 'standard'; }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  var current = null;      // { instrument, tuning }
  var strings = [];        // [{ note, midi, freq, label, done, el }]
  var done = {};           // string index -> true

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

  // ---------------------------------------------------------------- tuning UI
  function applyTuning(instrumentId, tuningId) {
    var found = TUNINGS.find(instrumentId, tuningId);
    if (!found) return;
    current = found;
    state.instrument = instrumentId;
    state.tuning = tuningId;
    done = {};
    el.tuningIcon.textContent = found.instrument.icon;
    el.tuningInst.textContent = found.instrument.name;
    el.tuningName.textContent = found.tuning.name;
    rebuildStrings();
    if (state.selected >= strings.length) state.selected = 0;
    renderStrings();
    resetReadout();
    save();
  }

  function rebuildStrings() {
    strings = current.tuning.notes.map(function (n) {
      var midi = Pitch.parseNote(n);
      var nn = Pitch.noteName(midi);
      return { note: n, midi: midi, name: nn.name, octave: nn.octave };
    });
    el.strings.innerHTML = '';
    el.strings.classList.toggle('chromatic', strings.length === 0);
    el.modeAuto.parentElement.hidden = strings.length === 0;
    if (!strings.length) {
      el.strings.textContent = '近い音名を自動で表示します';
      return;
    }
    strings.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'string-btn';
      b.innerHTML = s.name.replace('#', '♯') + '<small>' + s.octave + '</small>';
      b.setAttribute('aria-label', (i + 1) + '弦 ' + s.note);
      b.addEventListener('click', function () { onStringTap(i); });
      el.strings.appendChild(b);
      s.el = b;
    });
  }

  function stringFreq(i) { return Pitch.midiToFreq(strings[i].midi, state.a4); }

  function renderStrings() {
    strings.forEach(function (s, i) {
      s.el.classList.toggle('done', !!done[i]);
      s.el.classList.toggle('active', isManual() ? i === state.selected : i === activeString);
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
    el.note.textContent = s.name.replace('#', '♯');
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
      b.className = 'tuning-item' + (active ? ' active' : '');
      b.innerHTML = '<div><div class="t-name">' + t.name + '</div><div class="t-notes">' +
        (t.notes.length ? t.notes.join('  ').replace(/#/g, '♯').replace(/b(?=\d)/g, '♭') : 'すべての音') +
        '</div></div>' + (active ? '<span class="check">✓</span>' : '');
      b.addEventListener('click', function () {
        applyTuning(inst.id, t.id);
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
  el.a4Minus.addEventListener('click', function () { state.a4 = Math.max(415, state.a4 - 1); renderA4(); save(); if (state.mode === 'manual') showTarget(state.selected); });
  el.a4Plus.addEventListener('click', function () { state.a4 = Math.min(466, state.a4 + 1); renderA4(); save(); if (state.mode === 'manual') showTarget(state.selected); });
  el.playTone.checked = state.playTone;
  el.haptics.checked = state.haptics;
  el.playTone.addEventListener('change', function () { state.playTone = el.playTone.checked; save(); });
  el.haptics.addEventListener('change', function () { state.haptics = el.haptics.checked; save(); });

  el.modeAuto.addEventListener('click', function () { setMode('auto'); resetReadout(); });
  el.modeManual.addEventListener('click', function () { setMode('manual'); });

  // ---------------------------------------------------------------- audio
  var audio = {
    ctx: null, stream: null, analyser: null, buf: null, running: false,
    raf: 0, lastDetect: 0, wakeLock: null, muteUntil: 0
  };
  var history = [];          // recent { t, freq }
  var lastHeard = 0;
  var inTuneSince = 0;

  function start() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('このブラウザはマイク入力に対応していません。Safari で開いてください。'));
    }
    if (!audio.ctx) audio.ctx = new AC({ latencyHint: 'interactive' });
    var ctx = audio.ctx;
    var resume = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    return resume.then(function () {
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
    }).then(function (stream) {
      audio.stream = stream;
      var src = ctx.createMediaStreamSource(stream);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 25;
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(hp);
      hp.connect(analyser);
      audio.analyser = analyser;
      audio.buf = new Float32Array(analyser.fftSize);
      audio.running = true;
      history = [];
      el.micBtn.classList.add('on');
      el.micLabel.textContent = 'マイク ON';
      resetReadout();
      requestWakeLock();
      loop(performance.now());
    });
  }

  function stop() {
    audio.running = false;
    cancelAnimationFrame(audio.raf);
    if (audio.stream) { audio.stream.getTracks().forEach(function (t) { t.stop(); }); audio.stream = null; }
    if (audio.wakeLock) { audio.wakeLock.release().catch(function () {}); audio.wakeLock = null; }
    el.micBtn.classList.remove('on');
    el.micLabel.textContent = 'マイク開始';
    resetReadout();
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

    el.note.textContent = label.replace('#', '♯');
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
  function playReference(freq) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio.ctx) audio.ctx = new AC();
    var ctx = audio.ctx;
    if (ctx.state !== 'running') ctx.resume().catch(function () {});
    var t0 = ctx.currentTime;
    var dur = 1.6;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(8000, freq * 12), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 2), t0 + dur);
    [[freq, 'sawtooth', 0.5], [freq, 'triangle', 0.6], [freq * 2, 'sine', 0.15]].forEach(function (spec) {
      var o = ctx.createOscillator();
      o.type = spec[1];
      o.frequency.value = spec[0];
      var g = ctx.createGain();
      g.gain.value = spec[2];
      o.connect(g); g.connect(lp);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
    lp.connect(gain); gain.connect(ctx.destination);
    // don't let the microphone "hear" our own reference tone
    audio.muteUntil = performance.now() + dur * 1000;
    history = [];
  }

  // ---------------------------------------------------------------- start / mic button
  function beginFromGesture(btn) {
    btn.disabled = true;
    start().then(function () {
      el.startOverlay.hidden = true;
    }).catch(function (err) {
      var msg = err && err.name === 'NotAllowedError'
        ? 'マイクの使用が許可されていません。設定 › Safari › マイク で許可してください。'
        : (err && err.message) || 'マイクを開始できませんでした。';
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
  applyTuning(state.instrument, state.tuning);
  setMode(state.mode);
  resetReadout();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // expose a little for debugging / tests
  window.PocketTuner = { state: state, start: start, stop: stop, update: update, strings: function () { return strings; } };
})();
