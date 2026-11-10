/* Колбы — логика экрана. Движок уровней лежит в engine.js */

(function () {
  'use strict';

  var E = window.KolbyEngine;
  var STORAGE_KEY = 'kolby.state.v1';
  var SETTINGS_KEY = 'kolby.settings.v1';

  var flasks = [];
  var colors = 3;
  var empties = 2;
  var initial = [];
  var undoStack = [];
  var moves = 0;
  var level = 1;
  var completed = {};
  var maxLevel = 1;
  var selected = -1;
  var locked = false;
  var flaskEls = [];
  var soundOn = true;
  var hintTimer = 0;
  var toastTimer = 0;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- память ---------- */

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 2,
        level: level,
        colors: colors,
        empties: empties,
        flasks: flasks,
        initial: initial,
        undo: undoStack,
        moves: moves,
        completed: completed,
        maxLevel: maxLevel
      }));
    } catch (e) {
      /* нет места или приватный режим — играем дальше без сохранения */
    }
  }

  function loadProgress() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!data || typeof data.level !== 'number' || !Array.isArray(data.flasks)) return null;
    var sane = data.flasks.every(function (f) {
      return Array.isArray(f) && f.length <= E.CAP;
    });
    if (!sane || data.flasks.length < 3) return null;
    return data;
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      soundOn = !data || data.sound !== false;
    } catch (e) {
      soundOn = true;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sound: soundOn }));
    } catch (e) {
      /* не страшно: настройка просто не запомнится */
    }
  }

  /* ---------- звук ---------- */

  var audio = null;

  function ensureAudio() {
    if (audio) return audio;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
    } catch (e) {
      audio = null;
    }
    return audio;
  }

  function blip(freq, dur, vol, type, delay) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var t = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.62), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    } catch (e) {
      /* звук не критичен */
    }
  }

  function soundSelect() {
    blip(330, 0.06, 0.025, 'sine');
  }

  function soundPour(count) {
    blip(560 - Math.min(count, 4) * 45, 0.15, 0.05, 'triangle');
  }

  function soundBad() {
    blip(140, 0.14, 0.035, 'sawtooth');
  }

  function soundWin() {
    blip(523, 0.2, 0.045, 'triangle', 0);
    blip(659, 0.2, 0.045, 'triangle', 0.11);
    blip(784, 0.26, 0.05, 'triangle', 0.22);
  }

  function updateSoundBtn() {
    if (!els.soundBtn) return;
    els.soundBtn.classList.toggle('muted', !soundOn);
    els.soundBtn.setAttribute('aria-label', soundOn ? 'Звук включён' : 'Звук выключен');
  }

  function toggleSound() {
    soundOn = !soundOn;
    saveSettings();
    updateSoundBtn();
    if (soundOn) soundSelect();
  }

  /* ---------- мелкие помощники ---------- */

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function toast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2600);
  }

  /* ---------- уровень ---------- */

  function setHeader() {
    var colorCount = flasks.length - empties;
    els.levelLabel.textContent = 'Уровень ' + level;
    els.levelSub.textContent = colorCount + ' ' + plural(colorCount, 'цвет', 'цвета', 'цветов') +
      ' · ' + empties + ' ' + plural(empties, 'запасная колба', 'запасные колбы', 'запасных колб');
  }

  function newLevel(n) {
    level = Math.max(1, n);
    if (level > maxLevel) maxLevel = level;
    var g = E.generate(level);
    colors = g.colors;
    empties = g.empties;
    flasks = E.clone(g.state);
    initial = E.clone(g.state);
    undoStack = [];
    moves = 0;
    selected = -1;
    setHeader();
    render();
    saveProgress();
  }

  function restore(data) {
    level = data.level;
    flasks = data.flasks.map(function (f) { return f.slice(); });
    empties = data.flasks.filter(function (f) { return f.length === 0; }).length;
    colors = data.colors || (flasks.length - empties);
    initial = Array.isArray(data.initial) && data.initial.length === flasks.length
      ? data.initial.map(function (f) { return f.slice(); })
      : E.clone(flasks);
    undoStack = Array.isArray(data.undo) ? data.undo.filter(function (m) {
      return m && typeof m.from === 'number' && typeof m.to === 'number' && typeof m.count === 'number';
    }) : [];
    moves = typeof data.moves === 'number' ? data.moves : 0;
    completed = data.completed && typeof data.completed === 'object' ? data.completed : null;
    if (!completed) {
      /* сохранение от версии без списка пройденных: уровни до текущего считаем пройденными */
      completed = {};
      for (var passedLevel = 1; passedLevel < level; passedLevel++) {
        completed[String(passedLevel)] = true;
      }
    }
    maxLevel = typeof data.maxLevel === 'number' ? data.maxLevel : level;
    if (maxLevel < level) maxLevel = level;
    selected = -1;

    if (E.isSolved(flasks)) {
      /* закрыли приложение на экране победы — сразу следующий уровень */
      newLevel(level + 1);
      return;
    }
    setHeader();
    render();
  }

  /* ---------- отрисовка ---------- */

  function render(anim) {
    var wrap = els.flasks;
    var frag = document.createDocumentFragment();
    flaskEls = [];

    for (var i = 0; i < flasks.length; i++) {
      var el = document.createElement('div');
      el.className = 'flask';
      if (i === selected) el.classList.add('selected');
      el.dataset.i = String(i);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Колба ' + (i + 1));
      el.tabIndex = 0;

      var glass = document.createElement('div');
      glass.className = 'glass';

      var body = document.createElement('div');
      body.className = 'body';

      for (var l = 0; l < flasks[i].length; l++) {
        var seg = document.createElement('div');
        seg.className = 'liquid';
        seg.style.background = E.colorFor(colors, flasks[i][l]);
        if (anim && anim.index === i && l >= anim.from) seg.classList.add('in');
        body.appendChild(seg);
      }

      glass.appendChild(body);
      el.appendChild(glass);
      frag.appendChild(el);
      flaskEls.push(el);
    }

    wrap.innerHTML = '';
    wrap.appendChild(frag);

    els.moves.textContent = String(moves);
    els.undo.disabled = undoStack.length === 0;
    layout();
  }

  function layout() {
    var board = els.board;
    if (!board) return;

    var count = Math.max(1, flasks.length);
    var rows = Math.ceil(count / 7);
    var perRow = Math.ceil(count / rows);

    var rect = board.getBoundingClientRect();
    var availW = Math.max(120, rect.width - 4);
    var availH = Math.max(120, rect.height - 4);

    var gapX = Math.max(8, Math.min(18, availW * 0.03));
    var gapY = Math.max(14, Math.min(26, availH * 0.06));

    var maxByW = (availW - (perRow - 1) * gapX) / perRow;
    var maxByH = (availH - (rows - 1) * gapY) / rows;

    var fw = Math.min(maxByW, maxByH / 3.2, 62);
    fw = Math.max(24, fw);
    var fh = fw * 3.2;

    var root = document.documentElement.style;
    root.setProperty('--flask-w', fw.toFixed(1) + 'px');
    root.setProperty('--flask-h', fh.toFixed(1) + 'px');
    root.setProperty('--flask-gap', gapX.toFixed(1) + 'px');
    root.setProperty('--row-gap', gapY.toFixed(1) + 'px');
  }

  function shake(i) {
    var el = flaskEls[i];
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () {
      el.classList.remove('shake');
    }, 360);
  }

  /* ---------- ходы ---------- */

  function onFlaskTap(i) {
    if (locked || i < 0 || i >= flasks.length) return;

    if (selected === -1) {
      if (!flasks[i].length) {
        shake(i);
        soundBad();
        return;
      }
      selected = i;
      soundSelect();
      render();
      return;
    }

    if (selected === i) {
      selected = -1;
      render();
      return;
    }

    var n = E.canPour(flasks, selected, i);
    if (n > 0) {
      doPour(selected, i, n);
      return;
    }

    if (flasks[i].length) {
      selected = i;
      soundSelect();
      render();
      shake(i);
    } else {
      shake(i);
      soundBad();
    }
  }

  function spawnStream(srcEl, dstEl, color) {
    if (!srcEl || !dstEl) return;
    var a = srcEl.getBoundingClientRect();
    var b = dstEl.getBoundingClientRect();
    var height = Math.max(10, (b.top + b.height * 0.3) - (a.top + a.height * 0.2));
    var s = document.createElement('div');
    s.className = 'stream';
    s.style.left = (b.left + b.width / 2 - 3) + 'px';
    s.style.top = (a.top + a.height * 0.2) + 'px';
    s.style.height = height + 'px';
    s.style.background = color;
    document.body.appendChild(s);
    setTimeout(function () {
      if (s.parentNode) s.parentNode.removeChild(s);
    }, 420);
  }

  function doPour(i, j, n) {
    locked = true;
    selected = -1;

    var oldLen = flasks[j].length;
    var dir = j > i ? 1 : -1;
    var srcEl = flaskEls[i];
    var dstEl = flaskEls[j];
    var color = E.colorFor(colors, flasks[i][flasks[i].length - 1]);

    if (srcEl) {
      srcEl.classList.remove('selected');
      srcEl.style.setProperty('--tilt', (dir * 26) + 'deg');
      srcEl.classList.add('pouring');
    }
    if (dstEl) dstEl.classList.add('receive');

    spawnStream(srcEl, dstEl, color);
    soundPour(n);

    setTimeout(function () {
      E.pour(flasks, i, j);
      undoStack.push({ from: i, to: j, count: n });
      if (undoStack.length > 500) undoStack.shift();
      moves += 1;
      render({ index: j, from: oldLen });
      locked = false;
      saveProgress();
      if (E.isSolved(flasks)) {
        setTimeout(onWin, 160);
      }
    }, 190);
  }

  function undo() {
    if (locked) return;
    var m = undoStack.pop();
    if (!m) return;
    for (var k = 0; k < m.count; k++) {
      if (flasks[m.to].length) flasks[m.from].push(flasks[m.to].pop());
    }
    moves = Math.max(0, moves - 1);
    selected = -1;
    render();
    saveProgress();
    blip(240, 0.07, 0.025, 'sine');
  }

  function restart() {
    if (locked) return;
    flasks = initial.map(function (f) { return f.slice(); });
    undoStack = [];
    moves = 0;
    selected = -1;
    render();
    saveProgress();
  }

  function showHint() {
    if (locked) return;
    var solution = E.solve(flasks, 150000);
    if (!solution || !solution.length) {
      toast('Отсюда не собрать: отмени ход или начни заново');
      soundBad();
      return;
    }
    var move = solution[0];
    selected = -1;
    render();

    var from = flaskEls[move[0]];
    var to = flaskEls[move[1]];
    if (from) from.classList.add('hint-from');
    if (to) to.classList.add('hint-to');

    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      if (from) from.classList.remove('hint-from');
      if (to) to.classList.remove('hint-to');
    }, 1900);

    blip(700, 0.08, 0.03, 'sine');
  }

  /* ---------- победа ---------- */

  function bestOf(lv) {
    var value = completed[String(lv)];
    return typeof value === 'number' ? value : null;
  }

  function isDone(lv) {
    var value = completed[String(lv)];
    return value !== undefined && value !== null && value !== false;
  }

  function onWin() {
    var best = bestOf(level);
    var isRecord = best === null || moves < best;
    if (isRecord) completed[String(level)] = moves;
    if (level + 1 > maxLevel) maxLevel = level + 1;

    els.winMoves.textContent = String(moves);
    els.winBest.textContent = isRecord ? String(moves) : String(best);
    els.winRecord.classList.toggle('hidden', !isRecord);
    els.winTitle.textContent = 'Уровень ' + level + ' пройден';
    els.win.classList.remove('hidden');
    els.win.setAttribute('aria-hidden', 'false');

    soundWin();
    saveProgress();
  }

  function nextLevel() {
    els.win.classList.add('hidden');
    els.win.setAttribute('aria-hidden', 'true');
    newLevel(level + 1);
  }

  /* ---------- выбор уровня ---------- */

  function renderLevels() {
    var total = Math.max(50, maxLevel + 5, level + 5);
    if (total > 200) total = 200;

    var passed = Object.keys(completed).length;
    var overall = bestOverall();
    els.levelsSummary.textContent = passed === 0
      ? 'пройдено пока 0 — вперёд'
      : 'пройдено ' + passed + ' ' + plural(passed, 'уровень', 'уровня', 'уровней') +
        (overall === null ? '' : ' · лучший результат: ' + overall + ' ' + plural(overall, 'ход', 'хода', 'ходов'));

    var frag = document.createDocumentFragment();
    for (var n = 1; n <= total; n++) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'level-cell';
      cell.dataset.level = String(n);
      if (n === level) cell.classList.add('current');
      var best = bestOf(n);
      if (isDone(n)) {
        cell.classList.add('done');
        cell.innerHTML = best === null ? String(n) : n + '<span class="best">' + best + '</span>';
      } else {
        cell.textContent = String(n);
      }
      frag.appendChild(cell);
    }

    els.levelsGrid.innerHTML = '';
    els.levelsGrid.appendChild(frag);
    els.levelsContinue.textContent = 'Продолжить: уровень ' + level;

    var current = els.levelsGrid.querySelector('.level-cell.current');
    if (current) {
      setTimeout(function () {
        current.scrollIntoView({ block: 'center' });
      }, 30);
    }
  }

  function bestOverall() {
    var best = null;
    for (var key in completed) {
      if (!Object.prototype.hasOwnProperty.call(completed, key)) continue;
      var value = completed[key];
      if (typeof value !== 'number') continue;
      if (best === null || value < best) best = value;
    }
    return best;
  }

  function openLevels() {
    renderLevels();
    els.levels.classList.remove('hidden');
    els.levels.setAttribute('aria-hidden', 'false');
  }

  function closeLevels() {
    els.levels.classList.add('hidden');
    els.levels.setAttribute('aria-hidden', 'true');
  }

  /* ---------- запуск ---------- */

  function init() {
    els.app = $('app');
    els.board = $('board');
    els.flasks = $('flasks');
    els.levelLabel = $('levelLabel');
    els.levelSub = $('levelSub');
    els.levelBtn = $('levelBtn');
    els.moves = $('moves');
    els.undo = $('undo');
    els.restart = $('restart');
    els.hint = $('hint');
    els.soundBtn = $('soundBtn');
    els.toast = $('toast');
    els.win = $('win');
    els.winTitle = $('winTitle');
    els.winMoves = $('winMoves');
    els.winBest = $('winBest');
    els.winRecord = $('winRecord');
    els.next = $('next');
    els.again = $('again');
    els.levels = $('levels');
    els.levelsGrid = $('levelsGrid');
    els.levelsSummary = $('levelsSummary');
    els.levelsClose = $('levelsClose');
    els.levelsContinue = $('levelsContinue');

    loadSettings();
    updateSoundBtn();

    els.flasks.addEventListener('click', function (e) {
      var target = e.target;
      while (target && target !== els.flasks && !target.classList.contains('flask')) {
        target = target.parentNode;
      }
      if (!target || !target.dataset || typeof target.dataset.i !== 'string') return;
      onFlaskTap(parseInt(target.dataset.i, 10));
    });

    els.hint.addEventListener('click', showHint);
    els.undo.addEventListener('click', undo);
    els.restart.addEventListener('click', restart);
    els.soundBtn.addEventListener('click', toggleSound);
    els.levelBtn.addEventListener('click', openLevels);
    els.levelsClose.addEventListener('click', closeLevels);
    els.levels.addEventListener('click', function (e) {
      if (e.target === els.levels) closeLevels();
    });
    els.levelsGrid.addEventListener('click', function (e) {
      var cell = e.target;
      while (cell && cell !== els.levelsGrid && !cell.classList.contains('level-cell')) {
        cell = cell.parentNode;
      }
      if (!cell || !cell.dataset || typeof cell.dataset.level !== 'string') return;
      closeLevels();
      newLevel(parseInt(cell.dataset.level, 10));
    });
    els.levelsContinue.addEventListener('click', function () {
      closeLevels();
      newLevel(level);
    });

    els.next.addEventListener('click', nextLevel);
    els.again.addEventListener('click', function () {
      els.win.classList.add('hidden');
      els.win.setAttribute('aria-hidden', 'true');
      restart();
    });

    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    var saved = loadProgress();
    if (saved) {
      restore(saved);
    } else {
      newLevel(1);
    }

    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', function () {
      setTimeout(layout, 120);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', layout);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
