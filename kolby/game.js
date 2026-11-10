/* Колбы — логика экрана. Движок уровней лежит в engine.js */

(function () {
  'use strict';

  var E = window.KolbyEngine;
  var STORAGE_KEY = 'kolby.state.v1';

  var flasks = [];
  var colors = 3;
  var empties = 2;
  var initial = [];
  var undoStack = [];
  var moves = 0;
  var level = 1;
  var selected = -1;
  var locked = false;
  var flaskEls = [];

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- сохранение ---------- */

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        level: level,
        colors: colors,
        empties: empties,
        flasks: flasks,
        initial: initial,
        undo: undoStack,
        moves: moves
      }));
    } catch (e) {
      /* приватный режим или нет места — играем дальше без сохранения */
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

  /* ---------- уровень ---------- */

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function setHeader() {
    var colorCount = flasks.length - empties;
    els.levelLabel.textContent = 'Уровень ' + level;
    els.levelSub.textContent = colorCount + ' ' + plural(colorCount, 'цвет', 'цвета', 'цветов') +
      ' · ' + empties + ' ' + plural(empties, 'запасная колба', 'запасные колбы', 'запасных колб');
  }

  function newLevel(n) {
    level = Math.max(1, n);
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
        return;
      }
      selected = i;
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

    /* сюда лить нельзя: если в колбе что-то есть, она становится выбранной */
    if (flasks[i].length) {
      selected = i;
      render();
      shake(i);
    } else {
      shake(i);
    }
  }

  function doPour(i, j, n) {
    locked = true;
    selected = -1;

    var oldLen = flasks[j].length;
    var dir = j > i ? 1 : -1;
    var srcEl = flaskEls[i];
    var dstEl = flaskEls[j];

    if (srcEl) {
      srcEl.classList.remove('selected');
      srcEl.style.setProperty('--tilt', (dir * 26) + 'deg');
      srcEl.classList.add('pouring');
    }
    if (dstEl) dstEl.classList.add('receive');

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
    }, 170);
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

  function onWin() {
    els.winMoves.textContent = String(moves);
    els.winTitle.textContent = 'Уровень ' + level + ' пройден';
    els.win.classList.remove('hidden');
    els.win.setAttribute('aria-hidden', 'false');
    saveProgress();
  }

  function nextLevel() {
    els.win.classList.add('hidden');
    els.win.setAttribute('aria-hidden', 'true');
    newLevel(level + 1);
  }

  /* ---------- запуск ---------- */

  function init() {
    els.app = $('app');
    els.board = $('board');
    els.flasks = $('flasks');
    els.levelLabel = $('levelLabel');
    els.levelSub = $('levelSub');
    els.moves = $('moves');
    els.undo = $('undo');
    els.restart = $('restart');
    els.win = $('win');
    els.winTitle = $('winTitle');
    els.winMoves = $('winMoves');
    els.next = $('next');
    els.again = $('again');

    els.flasks.addEventListener('click', function (e) {
      var target = e.target;
      while (target && target !== els.flasks && !target.classList.contains('flask')) {
        target = target.parentNode;
      }
      if (!target || !target.dataset || typeof target.dataset.i !== 'string') return;
      onFlaskTap(parseInt(target.dataset.i, 10));
    });

    els.undo.addEventListener('click', undo);
    els.restart.addEventListener('click', restart);
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
