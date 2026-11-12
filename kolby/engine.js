/* Колбы — движок уровней.
   Работает и в браузере (window.KolbyEngine), и в Node (module.exports).
   Правила: переливать можно только верхний цвет, в пустую колбу или в колбу
   с тем же верхним цветом. Обычная колба держит 4 слоя, большая — 6.
   Большая колба (версия 15) собирает только свой цвет: колба с номером i
   принимает только цвет i. На старте в ней уже налито 2 слоя этого цвета. */

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
  var BIG_CAP = 6;

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

  function capOf(caps, i) {
    return caps && typeof caps[i] === 'number' ? caps[i] : CAP;
  }

  /* цвет, который принимает колба: у большой — только свой, у обычной — любой (-1) */
  function lockOf(caps, i) {
    return capOf(caps, i) > CAP ? i : -1;
  }

  /* старое сохранение, где в большой колбе лежат чужие цвета */
  function hasForeignInBig(state, caps) {
    for (var i = 0; i < state.length; i++) {
      var lock = lockOf(caps, i);
      if (lock < 0) continue;
      for (var k = 0; k < state[i].length; k++) {
        if (state[i][k] !== lock) return true;
      }
    }
    return false;
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

  function isSolved(state, caps) {
    for (var i = 0; i < state.length; i++) {
      var f = state[i];
      if (f.length === 0) continue;
      if (f.length !== capOf(caps, i)) return false;
      for (var j = 1; j < f.length; j++) {
        if (f[j] !== f[0]) return false;
      }
    }
    return true;
  }

  function canPour(state, i, j, caps) {
    if (i === j) return 0;
    var src = state[i];
    var dst = state[j];
    if (!src || !dst) return 0;
    if (!src.length) return 0;
    var dstCap = capOf(caps, j);
    if (dst.length >= dstCap) return 0;
    var c = src[src.length - 1];
    if (dst.length && dst[dst.length - 1] !== c) return 0;
    var lock = lockOf(caps, j);
    if (lock >= 0 && c !== lock) return 0;
    return Math.min(dstCap - dst.length, topRun(src));
  }

  /* Переливает и возвращает число перелитых слоёв (0 — ход невозможен). */
  function pour(state, i, j, caps) {
    var n = canPour(state, i, j, caps);
    if (!n) return 0;
    var src = state[i];
    var dst = state[j];
    for (var k = 0; k < n; k++) dst.push(src.pop());
    return n;
  }

  function legalMoves(state, caps) {
    var moves = [];
    for (var i = 0; i < state.length; i++) {
      if (!state[i].length) continue;
      for (var j = 0; j < state.length; j++) {
        if (i === j) continue;
        var n = canPour(state, i, j, caps);
        if (!n) continue;
        if (!state[j].length && isUniform(state[i])) continue;
        moves.push([i, j, n]);
      }
    }
    return moves;
  }

  function stateKey(state, caps) {
    var parts = new Array(state.length);
    for (var i = 0; i < state.length; i++) {
      parts[i] = (lockOf(caps, i) >= 0 ? 'B' : '') + state[i].join(',');
    }
    parts.sort();
    return parts.join('|');
  }

  /* Поиск решения в глубину: отсечение повторов и разумный порядок ходов. */
  function solve(state, budget, caps) {
    var limit = budget || 60000;
    var start = clone(state);
    if (isSolved(start, caps)) return [];
    var seen = Object.create(null);
    var path = [];
    var nodes = 0;

    function order(st) {
      var moves = [];
      for (var i = 0; i < st.length; i++) {
        if (!st[i].length) continue;
        for (var j = 0; j < st.length; j++) {
          if (i === j) continue;
          var n = canPour(st, i, j, caps);
          if (!n) continue;
          if (!st[j].length && isUniform(st[i])) continue;
          var s = 0;
          var src = st[i];
          var dst = st[j];
          var c = src[src.length - 1];
          var dstCap = capOf(caps, j);
          if (!dst.length) s -= 4;
          if (dst.length + n === dstCap && (dst.length === 0 || dst[dst.length - 1] === c)) s += 20;
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
      var k = stateKey(st, caps);
      if (seen[k]) return null;
      seen[k] = true;
      var moves = order(st);
      for (var m = 0; m < moves.length; m++) {
        var i = moves[m][0];
        var j = moves[m][1];
        var cnt = pour(st, i, j, caps);
        path.push([i, j]);
        if (isSolved(st, caps)) return path.slice();
        var res = dfs(st);
        if (res) return res;
        path.pop();
        for (var u = 0; u < cnt; u++) st[i].push(st[j].pop());
      }
      return null;
    }

    return dfs(start);
  }

  function levelConfig(level) {
    var lv = Math.max(1, Math.floor(level) || 1);
    var colors = 3 + Math.floor((lv - 1) / 4);
    if (colors > PALETTE.length) colors = PALETTE.length;
    var empties = 2;
    if (lv >= 45 && lv % 3 === 0) empties = 1;
    /* большая колба появляется на каждом пятом уровне, но только там,
       где есть две запасные — иначе уровень становится нечестно тяжёлым */
    var big = (lv >= 10 && lv % 5 === 0 && empties === 2) ? 1 : 0;
    return { colors: colors, empties: empties, big: big };
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

  /* Раскладка: сначала большие колбы (в каждой 2 слоя её цвета), потом
     обычные полные колбы со смешанными цветами, в конце пустые. */
  function randomState(caps, empties, rnd) {
    var big = 0;
    while (big < caps.length && caps[big] > CAP) big++;
    var colored = caps.length - empties - big;
    var colorsCount = colored; /* обычных колб столько же, сколько цветов */
    var cells = [];
    for (var c = 0; c < colorsCount; c++) {
      for (var k = 0; k < CAP; k++) cells.push(c);
    }
    cells = shuffled(cells, rnd);
    var state = new Array(caps.length);
    var pos = 0;
    for (var f = 0; f < caps.length; f++) {
      if (f < big) {
        state[f] = [];
        for (var s = 0; s < caps[f] - CAP; s++) state[f].push(f);
      } else if (f < big + colored) {
        state[f] = cells.slice(pos, pos + CAP);
        pos += CAP;
      } else {
        state[f] = [];
      }
    }
    return state;
  }

  function hasReadyFlask(state, caps) {
    for (var i = 0; i < state.length; i++) {
      if (isUniform(state[i]) && state[i].length === capOf(caps, i)) return true;
    }
    return false;
  }

  /* большие колбы идут первыми и не занимают место обычной колбы своего цвета:
     колб всего big + colors + empties, в конце одна обычная колба освободится */
  function buildCaps(colors, empties, big) {
    big = Math.min(big || 0, colors);
    var caps = [];
    for (var b = 0; b < big; b++) caps.push(BIG_CAP);
    for (var i = 0; i < colors + empties; i++) caps.push(CAP);
    return caps;
  }

  function attemptGenerate(level, colors, empties, big, budget, maxAttempts) {
    var caps = buildCaps(colors, empties, big);
    var needMixed = Math.max(2, Math.ceil(colors * 0.6));
    var minLen = colors + 2;
    var strictAttempts = 10;
    var started = Date.now();

    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      /* после десятка строгих попыток или 350 мс поиска условия мягче:
         генерировать уровень дольше, чем он играется, не нужно */
      var relaxed = attempt >= strictAttempts || (Date.now() - started) > 350;
      var seed = hash32(Math.imul(level, 7919) + Math.imul(attempt, 104729) + 17);
      var rnd = mulberry32(seed);
      var state = randomState(caps, empties, rnd);
      if (isSolved(state, caps)) continue;
      if (hasReadyFlask(state, caps)) continue;
      if (!relaxed && mixedCount(state) < needMixed) continue;
      var solution = solve(state, budget, caps);
      if (!solution) continue;
      if (!relaxed && solution.length < minLen) continue;
      return {
        level: level,
        colors: colors,
        empties: empties,
        big: big,
        caps: caps,
        state: state,
        initial: clone(state),
        solution: solution,
        seed: seed
      };
    }
    return null;
  }

  /* Уровень строится детерминированно по номеру: один и тот же номер даёт
     одну и ту же доску на любом устройстве. */
  function generate(level, options) {
    var opts = options || {};
    var cfg = levelConfig(level);
    var colors = opts.colors
      ? Math.max(3, Math.min(PALETTE.length, opts.colors))
      : cfg.colors;
    var empties = typeof opts.empties === 'number'
      ? Math.max(1, Math.min(3, opts.empties))
      : cfg.empties;
    var big = typeof opts.big === 'number' ? Math.max(0, Math.min(2, opts.big)) : cfg.big;
    var budget = opts.budget || (colors >= 9 ? 35000 : 30000);
    var attempts = opts.attempts || (colors >= 9 ? (empties < 2 ? 30 : 80) : 30);

    var result = attemptGenerate(level, colors, empties, big, budget, attempts);

    if (!result && empties < 2) {
      /* самая тяжёлая комбинация — одна запасная колба: добавляем вторую,
         а цвета и большие колбы оставляем как задумано */
      result = attemptGenerate(level, colors, 2, big, budget, 60);
    }
    if (!result) {
      result = attemptGenerate(level, Math.max(3, colors - 2), 2, 0, 60000, 40);
    }
    if (!result) {
      var safeCaps = buildCaps(3, 2, 0);
      var safe = randomState(safeCaps, 2, mulberry32(hash32(Math.imul(level, 31337))));
      result = {
        level: level,
        colors: 3,
        empties: 2,
        big: 0,
        caps: safeCaps,
        state: safe,
        initial: clone(safe),
        solution: solve(safe, 200000, safeCaps),
        seed: 0
      };
    }
    return result;
  }

  function colorFor(colors, index) {
    return PALETTE[index % PALETTE.length];
  }

  return {
    CAP: CAP,
    BIG_CAP: BIG_CAP,
    PALETTE: PALETTE,
    hash32: hash32,
    mulberry32: mulberry32,
    clone: clone,
    capOf: capOf,
    lockOf: lockOf,
    hasForeignInBig: hasForeignInBig,
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
