/*
 * Pitch detection based on the McLeod Pitch Method (MPM):
 * normalized square difference function (NSDF) + peak picking +
 * parabolic interpolation. Works both in the browser (window.Pitch)
 * and in Node (module.exports) so it can be unit tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Pitch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    minFreq: 27,        // Hz, below bass low B (30.9 Hz)
    maxFreq: 1400,      // Hz, well above any open string
    clarityThreshold: 0.85,
    rmsThreshold: 0.004,
    peakRatio: 0.9
  };

  function rms(buf) {
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  /**
   * Compute the NSDF for lags 0..maxTau using a fixed correlation window
   * of size W so that every lag is estimated from the same amount of data.
   */
  function nsdf(buf, maxTau, out) {
    var n = buf.length;
    var W = n - maxTau;
    for (var tau = 0; tau <= maxTau; tau++) {
      var acf = 0, m = 0;
      for (var i = 0; i < W; i++) {
        var a = buf[i], b = buf[i + tau];
        acf += a * b;
        m += a * a + b * b;
      }
      out[tau] = m > 0 ? (2 * acf) / m : 0;
    }
    return out;
  }

  /**
   * Pick the best peak in the NSDF: after the first negative zero crossing,
   * collect the maximum of every positive region, then choose the first
   * one that is at least peakRatio * (highest maximum).
   */
  function pickPeak(nsdfArr, maxTau, minTau, peakRatio) {
    var peaks = [];
    var tau = 1;
    // skip until the function goes negative once
    while (tau < maxTau && nsdfArr[tau] > 0) tau++;
    while (tau < maxTau) {
      // skip negative region
      while (tau < maxTau && nsdfArr[tau] <= 0) tau++;
      // find max of this positive region
      var bestTau = -1, bestVal = -Infinity;
      while (tau < maxTau && nsdfArr[tau] > 0) {
        if (nsdfArr[tau] > bestVal) { bestVal = nsdfArr[tau]; bestTau = tau; }
        tau++;
      }
      if (bestTau >= minTau && bestTau > 0) peaks.push({ tau: bestTau, val: bestVal });
    }
    if (!peaks.length) return null;
    var highest = -Infinity;
    for (var i = 0; i < peaks.length; i++) if (peaks[i].val > highest) highest = peaks[i].val;
    var cutoff = highest * peakRatio;
    for (var j = 0; j < peaks.length; j++) if (peaks[j].val >= cutoff) return peaks[j];
    return peaks[0];
  }

  function interpolate(arr, tau) {
    if (tau <= 0 || tau >= arr.length - 1) return { tau: tau, val: arr[tau] };
    var a = arr[tau - 1], b = arr[tau], c = arr[tau + 1];
    var denom = a - 2 * b + c;
    if (denom === 0) return { tau: tau, val: b };
    var shift = 0.5 * (a - c) / denom;
    var val = b - 0.25 * (a - c) * shift;
    return { tau: tau + shift, val: val };
  }

  /**
   * Detect the fundamental frequency of a mono Float32 buffer.
   * Returns null when the signal is too quiet or not periodic enough,
   * otherwise { freq, clarity, rms }.
   */
  function detect(buf, sampleRate, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var level = rms(buf);
    if (level < opts.rmsThreshold) return null;

    var maxTau = Math.min(Math.floor(sampleRate / opts.minFreq), Math.floor(buf.length / 2));
    var minTau = Math.max(2, Math.floor(sampleRate / opts.maxFreq));
    var arr = detect._scratch && detect._scratch.length === maxTau + 1
      ? detect._scratch
      : (detect._scratch = new Float32Array(maxTau + 1));

    nsdf(buf, maxTau, arr);
    var peak = pickPeak(arr, maxTau, minTau, opts.peakRatio);
    if (!peak) return null;
    var p = interpolate(arr, peak.tau);
    if (p.val < opts.clarityThreshold) return null;
    var freq = sampleRate / p.tau;
    if (!isFinite(freq) || freq < opts.minFreq || freq > opts.maxFreq) return null;
    return { freq: freq, clarity: Math.min(1, p.val), rms: level };
  }

  // ---- music helpers -------------------------------------------------

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function midiToFreq(midi, a4) {
    return (a4 || 440) * Math.pow(2, (midi - 69) / 12);
  }

  function freqToMidi(freq, a4) {
    return 69 + 12 * Math.log2(freq / (a4 || 440));
  }

  function centsBetween(freq, target) {
    return 1200 * Math.log2(freq / target);
  }

  function noteName(midi) {
    var m = Math.round(midi);
    var name = NOTE_NAMES[((m % 12) + 12) % 12];
    var octave = Math.floor(m / 12) - 1;
    return { name: name, octave: octave, label: name + octave, midi: m };
  }

  /** Parse "E2", "F#3", "Bb1" into a MIDI number. */
  function parseNote(str) {
    var m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(str.trim());
    if (!m) throw new Error('Bad note: ' + str);
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    if (m[2] === '#') base += 1;
    if (m[2] === 'b') base -= 1;
    return (parseInt(m[3], 10) + 1) * 12 + base;
  }

  return {
    detect: detect,
    nsdf: nsdf,
    rms: rms,
    midiToFreq: midiToFreq,
    freqToMidi: freqToMidi,
    centsBetween: centsBetween,
    noteName: noteName,
    parseNote: parseNote,
    NOTE_NAMES: NOTE_NAMES,
    DEFAULTS: DEFAULTS
  };
});
