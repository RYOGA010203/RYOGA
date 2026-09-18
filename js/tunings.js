/*
 * Instrument / tuning definitions. Strings are listed from lowest to
 * highest pitch. Works in the browser (window.TUNINGS) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TUNINGS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INSTRUMENTS = [
    {
      id: 'guitar',
      name: 'ギター',
      icon: '🎸',
      tunings: [
        { id: 'standard', name: 'スタンダード', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
        { id: 'drop-d', name: 'ドロップD', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
        { id: 'half-down', name: '半音下げ', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
        { id: 'whole-down', name: '全音下げ', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
        { id: 'drop-c', name: 'ドロップC', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
        { id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
        { id: 'open-g', name: 'オープンG', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
        { id: 'open-d', name: 'オープンD', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
        { id: 'open-e', name: 'オープンE', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
        { id: '7-string', name: '7弦 スタンダード', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] }
      ]
    },
    {
      id: 'bass',
      name: 'ベース',
      icon: '🎸',
      tunings: [
        { id: 'standard', name: '4弦 スタンダード', notes: ['E1', 'A1', 'D2', 'G2'] },
        { id: 'drop-d', name: 'ドロップD', notes: ['D1', 'A1', 'D2', 'G2'] },
        { id: 'half-down', name: '半音下げ', notes: ['Eb1', 'Ab1', 'Db2', 'Gb2'] },
        { id: '5-string', name: '5弦 スタンダード', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] }
      ]
    },
    {
      id: 'ukulele',
      name: 'ウクレレ',
      icon: '🪕',
      tunings: [
        { id: 'standard', name: 'スタンダード (High G)', notes: ['G4', 'C4', 'E4', 'A4'], keepOrder: true },
        { id: 'low-g', name: 'Low G', notes: ['G3', 'C4', 'E4', 'A4'] },
        { id: 'baritone', name: 'バリトン', notes: ['D3', 'G3', 'B3', 'E4'] }
      ]
    },
    {
      id: 'chromatic',
      name: 'クロマチック',
      icon: '🎵',
      tunings: [
        { id: 'chromatic', name: '全音階 (自動)', notes: [] }
      ]
    }
  ];

  function find(instrumentId, tuningId) {
    for (var i = 0; i < INSTRUMENTS.length; i++) {
      var inst = INSTRUMENTS[i];
      if (inst.id !== instrumentId) continue;
      for (var j = 0; j < inst.tunings.length; j++) {
        if (inst.tunings[j].id === tuningId) return { instrument: inst, tuning: inst.tunings[j] };
      }
    }
    return null;
  }

  return { INSTRUMENTS: INSTRUMENTS, find: find };
});
