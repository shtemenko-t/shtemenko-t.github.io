/* Колбы — логика экрана. Движок уровней лежит в engine.js */

(function () {
  'use strict';

  var E = window.KolbyEngine;
  var STORAGE_KEY = 'kolby.state.v1';
  var SETTINGS_KEY = 'kolby.settings.v1';

  /* ---------- активная доска ---------- */

  var mode = 'campaign'; /* 'campaign' | 'daily' */
  var level = 1;

  var colors = 3;
  var empties = 2;
  var flasks = [];
  var initial = [];
  var undoStack = [];
  var moves = 0;
  var par = null;
  var extraUsed = false;

  var campaignStash = null;
  var dailyData = null;

  var completed = {};
  var stars = {};
  var maxLevel = 1;
  var streak = 0;
  var lastDaily = null;

  var selected = -1;
  var locked = false;
  var flaskEls = [];
  var soundOn = true;
  var hintTimer = 0;
  var toastTimer = 0;
  var winAction = null;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cloneBoard(list) {
    var out = new Array(list.length);
    for (var i = 0; i < list.length; i++) out[i] = list[i].slice();
    return out;
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function dateKey(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dateKey(d);
  }

  function dailyConfig(key) {
    var parts = key.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
    return {
      level: 200000 + Number(key.replace(/-/g, '')),
      colors: 6 + (date.getDay() % 5),
      empties: 2
    };
  }

  /* ---------- память ---------- */

  function syncDaily() {
    if (!dailyData) return;
    dailyData.colors = colors;
    dailyData.empties = empties;
    dailyData.flasks = flasks;
    dailyData.initial = initial;
    dailyData.undo = undoStack;
    dailyData.moves = moves;
    dailyData.par = par;
    dailyData.extraUsed = extraUsed;
  }

  function saveProgress() {
    if (mode === 'daily') syncDaily();
    var payload = {
      v: 3,
      mode: mode,
      level: level,
      colors: colors,
      empties: empties,
      flasks: flasks,
      initial: initial,
      undo: undoStack,
      moves: moves,
      par: par,
      extraUsed: extraUsed,
      campaign: mode === 'daily' ? campaignStash : null,
      daily: dailyData,
      stars: stars,
      completed: completed,
      maxLevel: maxLevel,
      streak: streak,
      lastDaily: lastDaily
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
      /* настройка просто не запомнится */
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

  /* iOS включает звук только после первого касания экрана */
  function unlockAudio() {
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {
      /* не страшно */
    }
  }

  /* Пока звук заблокирован браузером, ждём разрешения и только потом играем:
     иначе на iPhone первый звук уходит «в пустоту». */
  function whenReady(ctx, run) {
    if (ctx.state === 'running') {
      run();
      return;
    }
    try {
      var p = ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(run).catch(function () { run(); });
      } else {
        run();
      }
    } catch (e) {
      run();
    }
  }

  function playTone(ctx, type, f0, f1, vol, delay, dur) {
    try {
      var t = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
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

  function tone(type, f0, f1, vol, delay, dur) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    whenReady(ctx, function () {
      playTone(ctx, type, f0, f1, vol, delay, dur);
    });
  }

  function playSplash(ctx, vol, delay) {
    try {
      var t = ctx.currentTime + (delay || 0);
      var len = Math.floor(ctx.sampleRate * 0.12);
      var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.9;
      var gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
    } catch (e) {
      /* не страшно */
    }
  }

  function splash(vol, delay) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    whenReady(ctx, function () {
      playSplash(ctx, vol, delay);
    });
  }

  function soundSelect() {
    tone('sine', 430, 320, 0.06, 0, 0.07);
  }

  function soundPour(count) {
    tone('sine', 340 - count * 12, 150, 0.12, 0, 0.2);
    tone('triangle', 660 - count * 30, 340, 0.05, 0.01, 0.16);
    splash(0.05, 0.02);
  }

  function soundBad() {
    tone('sawtooth', 170, 110, 0.055, 0, 0.15);
  }

  function soundExtra() {
    tone('sine', 250, 540, 0.07, 0, 0.16);
    splash(0.03, 0.05);
  }

  function soundWin() {
    tone('triangle', 523, 523, 0.09, 0, 0.18);
    tone('triangle', 659, 659, 0.09, 0.1, 0.18);
    tone('triangle', 784, 784, 0.1, 0.2, 0.3);
    splash(0.03, 0.2);
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
    unlockAudio();
    if (soundOn) {
      tone('triangle', 523, 523, 0.08, 0, 0.14);
      tone('triangle', 784, 784, 0.08, 0.12, 0.22);
    }
  }

  function toast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2400);
  }

  /* ---------- шапка ---------- */

  function setHeader() {
    if (!els.levelLabel) return;
    if (mode === 'daily') {
      var doneToday = dailyData && dailyData.done;
      els.levelLabel.textContent = 'Задание дня';
      els.levelSub.textContent = (doneToday ? 'пройдено · ' : '') +
        'серия ' + (streak || 0) + ' ' + plural(streak || 0, 'день', 'дня', 'дней');
      return;
    }
    var emptyCount = 0;
    for (var i = 0; i < flasks.length; i++) {
      if (!flasks[i].length) emptyCount += 1;
    }
    els.levelLabel.textContent = 'Уровень ' + level;
    els.levelSub.textContent = colors + ' ' + plural(colors, 'цвет', 'цвета', 'цветов') +
      ' · ' + emptyCount + ' ' + plural(emptyCount, 'запасная колба', 'запасные колбы', 'запасных колб');
  }

  /* ---------- переходы между досками ---------- */

  function applyFields(src) {
    colors = src.colors || 3;
    empties = src.empties || 2;
    flasks = cloneBoard(src.flasks || []);
    initial = src.initial && src.initial.length === flasks.length ? cloneBoard(src.initial) : cloneBoard(flasks);
    undoStack = Array.isArray(src.undo) ? src.undo.filter(function (m) {
      return m && typeof m.from === 'number' && typeof m.to === 'number' && typeof m.count === 'number';
    }) : [];
    moves = typeof src.moves === 'number' ? src.moves : 0;
    par = typeof src.par === 'number' && src.par > 0 ? src.par : null;
    extraUsed = !!src.extraUsed;
    selected = -1;
  }

  function stashCampaign() {
    if (mode !== 'campaign') return;
    campaignStash = {
      level: level,
      colors: colors,
      empties: empties,
      flasks: cloneBoard(flasks),
      initial: cloneBoard(initial),
      undo: undoStack.slice(),
      moves: moves,
      par: par,
      extraUsed: extraUsed
    };
  }

  function newLevel(n) {
    mode = 'campaign';
    campaignStash = null;
    level = Math.max(1, n);
    if (level > maxLevel) maxLevel = level;
    var g = E.generate(level);
    colors = g.colors;
    empties = g.empties;
    flasks = cloneBoard(g.state);
    initial = cloneBoard(g.state);
    undoStack = [];
    moves = 0;
    par = g.solution ? g.solution.length : null;
    extraUsed = false;
    selected = -1;
    setHeader();
    render();
    saveProgress();
  }

  function buildDaily(key) {
    var cfg = dailyConfig(key);
    var g = E.generate(cfg.level, { colors: cfg.colors, empties: cfg.empties });
    return {
      key: key,
      done: false,
      colors: g.colors,
      empties: g.empties,
      flasks: cloneBoard(g.state),
      initial: cloneBoard(g.state),
      undo: [],
      moves: 0,
      par: g.solution ? g.solution.length : null,
      extraUsed: false
    };
  }

  function startDaily() {
    var today = todayKey();
    stashCampaign();
    if (dailyData && dailyData.key === today && !dailyData.done) {
      applyFields(dailyData);
    } else {
      dailyData = buildDaily(today);
      applyFields(dailyData);
    }
    mode = 'daily';
    setHeader();
    render();
    saveProgress();
  }

  function backToCampaign() {
    if (!campaignStash) {
      newLevel(level);
      return;
    }
    mode = 'campaign';
    level = campaignStash.level || level;
    var stash = campaignStash;
    campaignStash = null;
    applyFields(stash);
    setHeader();
    render();
    saveProgress();
  }

  function restore(data) {
    completed = data.completed && typeof data.completed === 'object' ? data.completed : null;
    stars = data.stars && typeof data.stars === 'object' ? data.stars : {};
    maxLevel = typeof data.maxLevel === 'number' ? data.maxLevel : 1;
    streak = typeof data.streak === 'number' ? data.streak : 0;
    lastDaily = typeof data.lastDaily === 'string' ? data.lastDaily : null;
    dailyData = data.daily && data.daily.key && Array.isArray(data.daily.flasks) ? data.daily : null;

    var campaignSrc = data.campaign && data.campaign.level && Array.isArray(data.campaign.flasks)
      ? data.campaign
      : {
          level: data.level,
          colors: data.colors,
          empties: data.empties,
          flasks: data.flasks,
          initial: data.initial,
          undo: data.undo,
          moves: data.moves,
          par: data.par,
          extraUsed: data.extraUsed
        };

    level = campaignSrc.level || 1;
    if (maxLevel < level) maxLevel = level;

    if (!completed) {
      /* сохранение от версии без списка пройденных: уровни до текущего считаем пройденными */
      completed = {};
      for (var passed = 1; passed < level; passed++) {
        completed[String(passed)] = true;
      }
    }

    var today = todayKey();
    var resumeDaily = data.mode === 'daily' && dailyData && dailyData.key === today && !dailyData.done;
    if (resumeDaily) {
      mode = 'daily';
      campaignStash = campaignSrc;
      applyFields(dailyData);
    } else {
      mode = 'campaign';
      campaignStash = null;
      applyFields(campaignSrc);
      if (dailyData && dailyData.key !== today) dailyData = null;
    }

    if (E.isSolved(flasks)) {
      if (mode === 'daily') {
        backToCampaign();
        return;
      }
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
    els.addFlask.disabled = extraUsed;
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
    tone('sine', 260, 200, 0.05, 0, 0.08);
    render();
    saveProgress();
  }

  function restart() {
    if (locked) return;
    flasks = cloneBoard(initial);
    undoStack = [];
    moves = 0;
    extraUsed = false;
    selected = -1;
    setHeader();
    render();
    saveProgress();
  }

  function addExtraFlask() {
    if (locked || extraUsed || E.isSolved(flasks)) return;
    extraUsed = true;
    flasks.push([]);
    selected = -1;
    soundExtra();
    setHeader();
    render();
    saveProgress();
    toast('Запасная колба добавлена — она останется до конца уровня');
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

    tone('sine', 700, 620, 0.045, 0, 0.09);
  }

  /* ---------- звёзды и победа ---------- */

  function bestOf(lv) {
    var value = completed[String(lv)];
    return typeof value === 'number' ? value : null;
  }

  function isDone(lv) {
    var value = completed[String(lv)];
    return value !== undefined && value !== null && value !== false;
  }

  function ensurePar() {
    if (typeof par === 'number' && par > 0) return par;
    var solution = E.solve(initial, 150000);
    par = solution ? solution.length : null;
    return par;
  }

  function starsFor(moveCount, parValue) {
    if (!parValue || parValue <= 0) return 3;
    var extra = moveCount - parValue;
    if (extra <= 1) return 3;
    if (extra <= Math.max(3, Math.round(parValue * 0.35))) return 2;
    return 1;
  }

  function showStars(count) {
    var html = '';
    for (var i = 1; i <= 3; i++) {
      html += '<span class="' + (i <= count ? 'on' : '') + '">★</span>';
    }
    els.winStars.innerHTML = html;
  }

  function showWin(opts) {
    showStars(opts.stars);
    els.winTitle.textContent = opts.title;
    els.winSub.innerHTML = opts.sub;
    els.winRecord.classList.toggle('hidden', !opts.record);
    els.next.textContent = opts.primary;
    winAction = opts.onPrimary;
    els.win.classList.remove('hidden');
    els.win.setAttribute('aria-hidden', 'false');
    soundWin();
  }

  function finishLevel() {
    var best = bestOf(level);
    var isRecord = best === null || moves < best;
    if (isRecord) completed[String(level)] = moves;

    var earned = starsFor(moves, ensurePar());
    if ((stars[String(level)] || 0) < earned) stars[String(level)] = earned;
    if (level + 1 > maxLevel) maxLevel = level + 1;

    showWin({
      title: 'Уровень ' + level + ' пройден',
      stars: earned,
      record: isRecord,
      sub: 'ходов: <span>' + moves + '</span> · лучший: <span>' + (isRecord ? moves : best) + '</span>',
      primary: 'Следующий уровень',
      onPrimary: function () {
        newLevel(level + 1);
      }
    });
    saveProgress();
  }

  function finishDaily() {
    var today = todayKey();
    if (lastDaily === today) {
      if (streak < 1) streak = 1;
    } else if (lastDaily === yesterdayKey()) {
      streak = (streak || 0) + 1;
    } else {
      streak = 1;
    }
    lastDaily = today;

    var earned = starsFor(moves, ensurePar());
    dailyData.done = true;
    dailyData.stars = earned;
    syncDaily();

    showWin({
      title: 'Задание дня пройдено',
      stars: earned,
      record: false,
      sub: 'ходов: <span>' + moves + '</span> · серия: <span>' + streak + ' ' +
        plural(streak, 'день', 'дня', 'дней') + '</span>',
      primary: 'К уровням',
      onPrimary: backToCampaign
    });
    saveProgress();
  }

  function onWin() {
    if (mode === 'daily') finishDaily();
    else finishLevel();
  }

  /* ---------- список уровней ---------- */

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

  function totalStars() {
    var sum = 0;
    for (var key in stars) {
      if (!Object.prototype.hasOwnProperty.call(stars, key)) continue;
      sum += stars[key] || 0;
    }
    return sum;
  }

  function renderLevels() {
    var total = Math.max(50, maxLevel + 5, level + 5);
    if (total > 200) total = 200;

    var passed = Object.keys(completed).length;
    var overall = bestOverall();
    var bits = [];
    bits.push(passed === 0
      ? 'пока ни одного уровня — вперёд'
      : 'пройдено ' + passed + ' ' + plural(passed, 'уровень', 'уровня', 'уровней'));
    if (totalStars() > 0) bits.push('★ ' + totalStars());
    if (overall !== null) bits.push('лучший: ' + overall + ' ' + plural(overall, 'ход', 'хода', 'ходов'));
    els.levelsSummary.textContent = bits.join(' · ');

    var doneToday = dailyData && dailyData.key === todayKey() && dailyData.done;
    els.dailySub.textContent = (streak > 0 ? 'серия ' + streak + ' ' + plural(streak, 'день', 'дня', 'дней') + ' · ' : '') +
      (doneToday ? 'сегодня пройдено' : 'сыграть');

    var frag = document.createDocumentFragment();
    for (var n = 1; n <= total; n++) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'level-cell';
      cell.dataset.level = String(n);
      if (n === level && mode === 'campaign') cell.classList.add('current');

      var earned = stars[String(n)] || 0;
      var best = bestOf(n);
      if (isDone(n)) {
        cell.classList.add('done');
        var line = earned > 0 ? '★'.repeat(earned) : (best !== null ? String(best) : '');
        cell.innerHTML = n + (line ? '<span class="best">' + line + '</span>' : '');
      } else {
        cell.textContent = String(n);
      }
      frag.appendChild(cell);
    }

    els.levelsGrid.innerHTML = '';
    els.levelsGrid.appendChild(frag);
    els.levelsContinue.textContent = mode === 'daily' ? 'К уровням' : 'Продолжить: уровень ' + level;

    var current = els.levelsGrid.querySelector('.level-cell.current');
    if (current) {
      setTimeout(function () {
        current.scrollIntoView({ block: 'center' });
      }, 30);
    }
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
    els.addFlask = $('addFlask');
    els.soundBtn = $('soundBtn');
    els.toast = $('toast');
    els.win = $('win');
    els.winTitle = $('winTitle');
    els.winSub = $('winSub');
    els.winStars = $('winStars');
    els.winRecord = $('winRecord');
    els.next = $('next');
    els.again = $('again');
    els.levels = $('levels');
    els.levelsGrid = $('levelsGrid');
    els.levelsSummary = $('levelsSummary');
    els.levelsClose = $('levelsClose');
    els.levelsContinue = $('levelsContinue');
    els.dailyCard = $('dailyCard');
    els.dailySub = $('dailySub');

    loadSettings();
    updateSoundBtn();

    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, unlockAudio, { once: true, capture: true, passive: true });
    });

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
    els.addFlask.addEventListener('click', addExtraFlask);
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
      if (mode === 'daily') backToCampaign();
      else newLevel(level);
    });
    els.dailyCard.addEventListener('click', function () {
      closeLevels();
      startDaily();
    });

    els.next.addEventListener('click', function () {
      els.win.classList.add('hidden');
      els.win.setAttribute('aria-hidden', 'true');
      var action = winAction;
      winAction = null;
      if (action) action();
    });
    els.again.addEventListener('click', function () {
      els.win.classList.add('hidden');
      els.win.setAttribute('aria-hidden', 'true');
      restart();
    });

    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    var saved = loadProgress();
    if (saved) restore(saved);
    else newLevel(1);

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
