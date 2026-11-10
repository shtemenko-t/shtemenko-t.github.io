/* Колбы — движок уровней.
   Работает и в браузере (window.KolbyEngine), и в Node (module.exports).
   Правила: 4 слоя в колбе, переливать можно только верхний цвет,
   в пустую колбу или в колбу с тем же верхним цветом. */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KolbyEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CAP = 4;

  /* Порядок палитры: первые цвета максимально далеко друг от друга по тону,
     поэтому лёгкие уровни выглядят наглядно. */
  var PALETTE = [
    '#ef4444', // красный
    '#3b82f6', // синий
    '#22c55e', // зелёный
    '#facc15', // жёлтый
    '#a855f7', // фиолетовый
    '#fb923c', // оранжевый
    '#22d3ee', // голубой
    '#ec4899', // розовый
    '#a3e635', // салатовый
    '#94a3b8', // серый
    '#b07c3f', // коричневый
    '#2dd4bf'  // бирюзовый
  ];

  function hash32(n) {
    var x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function clone(state) {
    var out = new Array(state.length);
    for (var i = 0; i < state.length; i++) out[i] = state[i].slice();
    return out;
  }

  function topRun(flask) {
    if (!flask.length) return 0;
    var c = flask[flask.length - 1];
    var n = 1;
    for (var i = flask.length - 2; i >= 0 && flask[i] === c; i--) n++;
    return n;
  }

  function isUniform(flask) {
    for (var i = 1; i < flask.length; i++) {
      if (flask[i] !== flask[0]) return false;
    }
    return flask.length > 0;
  }

  function isSolved(state) {
    for (var i = 0; i < state.length; i++) {
      var f = state[i];
      if (f.length === 0) continue;
      if (f.length !== CAP) return false;
      for (var j = 1; j < f.length; j++) {
        if (f[j] !== f[0]) return false;
      }
    }
    return true;
  }

  function canPour(state, i, j) {
    if (i === j) return 0;
    var src = state[i];
    var dst = state[j];
    if (!src || !dst) return 0;
    if (!src.length) return 0;
    if (dst.length >= CAP) return 0;
    var c = src[src.length - 1];
    if (dst.length && dst[dst.length - 1] !== c) return 0;
    return Math.min(CAP - dst.length, topRun(src));
  }

  /* Переливает и возвращает число перелитых слоёв (0 — ход невозможен). */
  function pour(state, i, j) {
    var n = canPour(state, i, j);
    if (!n) return 0;
    var src = state[i];
    var dst = state[j];
    for (var k = 0; k < n; k++) dst.push(src.pop());
    return n;
  }

  function legalMoves(state) {
    var moves = [];
    for (var i = 0; i < state.length; i++) {
      if (!state[i].length) continue;
      for (var j = 0; j < state.length; j++) {
        if (i === j) continue;
        var n = canPour(state, i, j);
        if (!n) continue;
        /* переливание одноцветной колбы в пустую ничего не меняет по сути */
        if (!state[j].length && isUniform(state[i])) continue;
        moves.push([i, j, n]);
      }
    }
    return moves;
  }

  function stateKey(state) {
    var parts = new Array(state.length);
    for (var i = 0; i < state.length; i++) parts[i] = state[i].join(',');
    parts.sort();
    return parts.join('|');
  }

  /* Поиск решения в глубину с отсечением повторов и разумным порядком ходов.
     Возвращает массив ходов [[from, to], ...] или null. */
  function solve(state, budget) {
    var limit = budget || 60000;
    var start = clone(state);
    if (isSolved(start)) return [];
    var seen = Object.create(null);
    var path = [];
    var nodes = 0;

    function order(st) {
      var moves = [];
      for (var i = 0; i < st.length; i++) {
        if (!st[i].length) continue;
        for (var j = 0; j < st.length; j++) {
          if (i === j) continue;
          var n = canPour(st, i, j);
          if (!n) continue;
          if (!st[j].length && isUniform(st[i])) continue;
          var s = 0;
          var src = st[i];
          var dst = st[j];
          var c = src[src.length - 1];
          if (!dst.length) s -= 4;
          if (dst.length + n === CAP && (dst.length === 0 || dst[dst.length - 1] === c)) s += 20;
          if (src.length === n) s += 5;
          moves.push([i, j, s]);
        }
      }
      moves.sort(function (a, b) { return b[2] - a[2]; });
      return moves;
    }

    function dfs(st) {
      nodes++;
      if (nodes > limit) return null;
      var k = stateKey(st);
      if (seen[k]) return null;
      seen[k] = true;
      var moves = order(st);
      for (var m = 0; m < moves.length; m++) {
        var i = moves[m][0];
        var j = moves[m][1];
        var cnt = pour(st, i, j);
        path.push([i, j]);
        if (isSolved(st)) return path.slice();
        var res = dfs(st);
        if (res) return res;
        path.pop();
        for (var u = 0; u < cnt; u++) st[i].push(st[j].pop());
      }
      return null;
    }

    return dfs(start);
  }

  /* Сколько колб с цветами, сколько пустых, сколько уровней впереди. */
  function levelConfig(level) {
    var lv = Math.max(1, Math.floor(level) || 1);
    var colors = 3 + Math.floor((lv - 1) / 4);
    if (colors > PALETTE.length) colors = PALETTE.length;
    var empties = 2;
    if (lv >= 45 && lv % 3 === 0) empties = 1;
    return { colors: colors, empties: empties };
  }

  function mixedCount(state) {
    var mixed = 0;
    for (var i = 0; i < state.length; i++) {
      var seen = {};
      var distinct = 0;
      for (var j = 0; j < state[i].length; j++) {
        var c = state[i][j];
        if (!seen[c]) {
          seen[c] = 1;
          distinct++;
          if (distinct >= 2) break;
        }
      }
      if (distinct >= 2) mixed++;
    }
    return mixed;
  }

  function randomState(colors, empties, rnd) {
    var cells = [];
    for (var c = 0; c < colors; c++) {
      for (var k = 0; k < CAP; k++) cells.push(c);
    }
    cells = shuffled(cells, rnd);
    var state = new Array(colors + empties);
    for (var i = 0; i < colors; i++) state[i] = cells.slice(i * CAP, (i + 1) * CAP);
    for (var e = 0; e < empties; e++) state[colors + e] = [];
    return state;
  }

  function hasFreeFlask(state) {
    for (var i = 0; i < state.length; i++) {
      if (isUniform(state[i]) && state[i].length === CAP) return true;
    }
    return false;
  }

  /* Уровень строится детерминированно по номеру: на разных телефонах
     один и тот же номер даёт одну и ту же доску. */
  function generate(level, options) {
    var opts = options || {};
    var cfg = levelConfig(level);
    var colors = opts.colors ? Math.max(3, Math.min(PALETTE.length, opts.colors)) : cfg.colors;
    var empties = typeof opts.empties === 'number'
      ? Math.max(1, Math.min(3, opts.empties))
      : cfg.empties;
    var needMixed = Math.max(2, Math.ceil(colors * 0.6));
    var minLen = colors + 2;
    var budget = opts.budget || 30000;
    var maxAttempts = opts.attempts || 40;
    var relaxed = false;

    for (var attempt = 0; attempt < maxAttempts * 2; attempt++) {
      if (attempt === maxAttempts) relaxed = true; // вторая половина попыток — мягкие условия
      var seed = hash32(Math.imul(level, 7919) + Math.imul(attempt, 104729) + 17);
      var rnd = mulberry32(seed);
      var state = randomState(colors, empties, rnd);
      if (isSolved(state)) continue;
      if (hasFreeFlask(state)) continue;
      if (!relaxed && mixedCount(state) < needMixed) continue;
      var solution = solve(state, budget);
      if (!solution) continue;
      if (!relaxed && solution.length < minLen) continue;
      return {
        level: level,
        colors: colors,
        empties: empties,
        state: state,
        initial: clone(state),
        solution: solution,
        seed: seed
      };
    }

    /* Совсем крайний случай: гарантированно решаемая простая доска. */
    var fallbackColors = Math.max(3, colors - 2);
    var fallback = randomState(fallbackColors, 2, mulberry32(hash32(Math.imul(level, 31337))));
    return {
      level: level,
      colors: fallbackColors,
      empties: 2,
      state: fallback,
      initial: clone(fallback),
      solution: solve(fallback, 200000),
      seed: 0
    };
  }

  function colorFor(colors, index) {
    return PALETTE[index % PALETTE.length];
  }

  return {
    CAP: CAP,
    PALETTE: PALETTE,
    hash32: hash32,
    mulberry32: mulberry32,
    clone: clone,
    topRun: topRun,
    isUniform: isUniform,
    isSolved: isSolved,
    canPour: canPour,
    pour: pour,
    legalMoves: legalMoves,
    stateKey: stateKey,
    solve: solve,
    levelConfig: levelConfig,
    generate: generate,
    colorFor: colorFor
  };
}));
