const test = require('node:test');
const assert = require('node:assert');
const Pitch = require('../js/pitch.js');
const TUNINGS = require('../js/tunings.js');

const SR = 48000;
const N = 4096;

/** Synthesize a pluck-like tone with several harmonics and a bit of noise. */
function tone(freq, { harmonics = [1, 0.6, 0.4, 0.25, 0.15], amp = 0.3, noise = 0.005, phase = 0.3 } = {}) {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 1) * i / SR + phase * h);
    }
    buf[i] = amp * s + (Math.random() * 2 - 1) * noise;
  }
  return buf;
}

test('detects every open string of every tuning within 2 cents', () => {
  for (const inst of TUNINGS.INSTRUMENTS) {
    for (const t of inst.tunings) {
      for (const note of t.notes) {
        const midi = Pitch.parseNote(note);
        const f = Pitch.midiToFreq(midi);
        const r = Pitch.detect(tone(f), SR);
        assert.ok(r, `no detection for ${note} (${f.toFixed(2)} Hz)`);
        const cents = Pitch.centsBetween(r.freq, f);
        assert.ok(Math.abs(cents) < 2, `${note}: got ${r.freq.toFixed(2)} Hz, ${cents.toFixed(2)} cents`);
        assert.ok(r.clarity > 0.9, `${note}: clarity ${r.clarity}`);
      }
    }
  }
});

test('does not octave-jump on strong second harmonic (low E)', () => {
  const f = Pitch.midiToFreq(Pitch.parseNote('E2'));
  const r = Pitch.detect(tone(f, { harmonics: [0.5, 1.0, 0.5, 0.3] }), SR);
  assert.ok(r);
  assert.ok(Math.abs(Pitch.centsBetween(r.freq, f)) < 3, `got ${r.freq}`);
});

test('reports detuned strings with the right sign', () => {
  const target = Pitch.midiToFreq(Pitch.parseNote('A2'));
  const sharp = target * Math.pow(2, 20 / 1200);
  const flat = target * Math.pow(2, -20 / 1200);
  const rs = Pitch.detect(tone(sharp), SR);
  const rf = Pitch.detect(tone(flat), SR);
  assert.ok(Math.abs(Pitch.centsBetween(rs.freq, target) - 20) < 2);
  assert.ok(Math.abs(Pitch.centsBetween(rf.freq, target) + 20) < 2);
});

test('returns null for silence and for noise', () => {
  assert.strictEqual(Pitch.detect(new Float32Array(N), SR), null);
  const noise = new Float32Array(N);
  for (let i = 0; i < N; i++) noise[i] = (Math.random() * 2 - 1) * 0.3;
  assert.strictEqual(Pitch.detect(noise, SR), null);
});

test('works at 44100 Hz too', () => {
  const f = Pitch.midiToFreq(Pitch.parseNote('G3'));
  const sr = 44100;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = 0.3 * Math.sin(2 * Math.PI * f * i / sr) + 0.15 * Math.sin(4 * Math.PI * f * i / sr);
  const r = Pitch.detect(buf, sr);
  assert.ok(Math.abs(Pitch.centsBetween(r.freq, f)) < 2);
});

test('note helpers', () => {
  assert.strictEqual(Pitch.parseNote('A4'), 69);
  assert.strictEqual(Pitch.parseNote('E2'), 40);
  assert.strictEqual(Pitch.parseNote('Bb1'), 34);
  assert.strictEqual(Pitch.parseNote('F#3'), 54);
  assert.strictEqual(Pitch.noteName(69).label, 'A4');
  assert.strictEqual(Pitch.noteName(40).label, 'E2');
  assert.ok(Math.abs(Pitch.midiToFreq(40) - 82.407) < 0.01);
  assert.ok(Math.abs(Pitch.midiToFreq(69, 442) - 442) < 1e-9);
  assert.ok(Math.abs(Pitch.centsBetween(440 * Math.pow(2, 1 / 12), 440) - 100) < 1e-6);
});

test('tunings are well formed', () => {
  for (const inst of TUNINGS.INSTRUMENTS) {
    for (const t of inst.tunings) {
      t.notes.forEach((n) => Pitch.parseNote(n));
      if (!t.keepOrder && t.notes.length > 1) {
        const midis = t.notes.map(Pitch.parseNote);
        for (let i = 1; i < midis.length; i++) assert.ok(midis[i] > midis[i - 1], `${inst.id}/${t.id} not ascending`);
      }
    }
  }
  assert.ok(TUNINGS.find('guitar', 'standard'));
  assert.strictEqual(TUNINGS.find('guitar', 'nope'), null);
  // every playable instrument offers a custom tuning that starts from its standard tuning
  for (const inst of TUNINGS.INSTRUMENTS.filter((i) => i.id !== 'chromatic')) {
    const custom = TUNINGS.find(inst.id, 'custom');
    assert.ok(custom && custom.tuning.custom, `${inst.id} has no custom tuning`);
    assert.deepStrictEqual(TUNINGS.defaultNotes(inst.id), inst.tunings[0].notes);
  }
  assert.deepStrictEqual(TUNINGS.defaultNotes('nope'), []);
});
