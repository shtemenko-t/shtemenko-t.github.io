/* Колбы — логика экрана. Движок уровней лежит в engine.js */

(function () {
  'use strict';

  var E = window.KolbyEngine;
  var STORAGE_KEY = 'kolby.state.v1';
  var SETTINGS_KEY = 'kolby.settings.v1';
  var SOUND_RATE = 22050;
  var APP_VERSION = 11;

  /* ---------- активная доска ---------- */

  var mode = 'campaign'; /* 'campaign' | 'daily' */
  var level = 1;

  var colors = 3;
  var empties = 2;
  var caps = [];
  var flasks = [];
  var initial = [];
  var undoStack = [];
  var moves = 0;
  var par = null;
  var extraUsed = false;

  var hidden = [];
  var revealed = [];
  var mysteryShown = false;

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
  var streamStyle = 1;
  var soundPreset = 1;
  var hintTimer = 0;
  var toastTimer = 0;
  var winAction = null;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function tint(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    if (amount >= 0) {
      r += (255 - r) * amount;
      g += (255 - g) * amount;
      b += (255 - b) * amount;
    } else {
      r *= 1 + amount;
      g *= 1 + amount;
      b *= 1 + amount;
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
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
      empties: 2,
      big: date.getDay() % 3 === 0 ? 1 : 0
    };
  }

  /* ---------- закрытые цвета ---------- */

  function pickHidden(seedNumber, colorsCount) {
    var count = colorsCount >= 10 ? 2 : (colorsCount >= 5 ? 1 : 0);
    if (count <= 0) return [];
    var rnd = E.mulberry32(E.hash32(seedNumber | 0));
    var pool = [];
    for (var i = 0; i < colorsCount; i++) pool.push(i);
    var out = [];
    for (var k = 0; k < count && pool.length; k++) {
      out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    return out;
  }

  function isHiddenColor(c) {
    return hidden.indexOf(c) !== -1 && revealed.indexOf(c) === -1;
  }

  function revealTop(i) {
    if (!flasks[i] || !flasks[i].length) return false;
    var c = flasks[i][flasks[i].length - 1];
    if (hidden.indexOf(c) === -1) return false;
    if (revealed.indexOf(c) !== -1) return false;
    revealed.push(c);
    return true;
  }

  /* ---------- звук ---------- */

  var audio = null;
  var soundFiles = null;
  var fileUnlocked = false;

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

  /* Звуки храним как крошечные wav-файлы, собранные на месте:
     проигрывание файла на iPhone надёжнее, чем Web Audio. */
  function encodeWav(data) {
    var n = data.length;
    var buffer = new ArrayBuffer(44 + n * 2);
    var view = new DataView(buffer);
    function str(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SOUND_RATE, true);
    view.setUint32(28, SOUND_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, n * 2, true);
    var off = 44;
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var b = 0; b < bytes.length; b += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(b, b + chunk));
    }
    return 'data:audio/wav;base64,' + window.btoa(binary);
  }

  function normalize(data, target) {
    var peak = 0;
    for (var i = 0; i < data.length; i++) {
      var a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    if (peak < 0.0001) return data;
    var k = target / peak;
    for (var j = 0; j < data.length; j++) data[j] *= k;
    return data;
  }

  function synth(dur, fn) {
    var n = Math.floor(SOUND_RATE * dur);
    var data = new Float32Array(n);
    for (var i = 0; i < n; i++) data[i] = fn(i / SOUND_RATE, i, n);
    return encodeWav(normalize(data, 0.86));
  }

  /* Вода: шум через два фильтра плюс пузырьки — так переливание звучит
     как настоящая жидкость, а не как сигнал. */
  /* Журчание: только шумовые слои и медленная пульсация.
     Никаких чистых тонов — именно они звучали как металл. */
  /* Характеры звука воды. Номер выбирается в лаборатории. */
  var POUR_PRESETS = {
    1: { low: 1.7, mid: 0.8, gurgle: 1, bubbles: 0, plop: 0 },
    2: { low: 2.3, mid: 0.28, gurgle: 1, bubbles: 0, plop: 0 },
    3: { low: 1.6, mid: 0.65, gurgle: 1, bubbles: 1, plop: 0 },
    4: { low: 0.9, mid: 1.15, gurgle: 1, bubbles: 0, plop: 1 }
  };

  function waterPour(seed, preset) {
    var rnd = E.mulberry32(seed);
    var cfg = POUR_PRESETS[preset] || POUR_PRESETS[1];
    var dur = 0.55;
    var lp1 = 0;
    var lp2 = 0;
    var bp = 0;
    var bubbles = [];
    if (cfg.bubbles) {
      var at = 0.03;
      while (at < dur - 0.08) {
        bubbles.push({
          at: at,
          f: 110 + rnd() * 130,
          len: 0.06 + rnd() * 0.07,
          amp: 0.10 + rnd() * 0.12
        });
        at += 0.06 + rnd() * 0.08;
      }
    }
    return synth(dur, function (time) {
      var k = time / dur;
      var env = Math.min(1, time / 0.05) * Math.pow(1 - k, 0.8);
      var white = rnd() * 2 - 1;
      lp1 += (white - lp1) * 0.045;
      lp2 += (white - lp2) * 0.24;
      var gurgle = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3.1 * time + Math.sin(2 * Math.PI * 0.8 * time));
      var body = lp1 * cfg.low + (lp2 - lp1) * cfg.mid * (cfg.gurgle ? gurgle : 1);
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        var local = time - b.at;
        if (local >= 0 && local <= b.len) {
          var e = Math.sin(Math.PI * (local / b.len));
          body += Math.sin(2 * Math.PI * b.f * local * (1 - 0.3 * local / b.len)) * b.amp * e * e;
        }
      }
      if (cfg.plop) {
        bp += (white - lp1 - bp) * 0.35;
        body += bp * 0.5;
      }
      return body * env;
    });
  }

  function waterSplash(seed) {
    var rnd = E.mulberry32(seed);
    var dur = 0.3;
    var lp = 0;
    var low = 0;
    return synth(dur, function (time) {
      var k = time / dur;
      var env = Math.exp(-5 * k);
      var white = rnd() * 2 - 1;
      lp += (white - lp) * 0.32;
      low += (white - low) * 0.045;
      var splatter = (lp - low) * 0.85;
      var plop = Math.sin(2 * Math.PI * (280 - 110 * k) * time) * 0.16 * Math.exp(-10 * k);
      return (splatter + plop) * env;
    });
  }

  function buildSounds() {
    if (soundFiles) return soundFiles;
    try {
      soundFiles = {
        pick: makeEntry(synth(0.08, function (t) {
          var k = t / 0.08;
          return Math.sin(2 * Math.PI * (430 - 120 * k) * t) * 0.5 * Math.pow(1 - k, 1.4);
        })),
        pour0: makeEntry(waterPour(1013, 1)),
        pour1: makeEntry(waterPour(2027, 2)),
        pour2: makeEntry(waterPour(3041, 3)),
        pour3: makeEntry(waterPour(4057, 4)),
        splash: makeEntry(waterSplash(4051)),
        win: makeEntry(synth(0.6, function (t) {
          var notes = [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1046]];
          var sum = 0;
          for (var i = 0; i < notes.length; i++) {
            var start = notes[i][0];
            if (t >= start) {
              var local = t - start;
              var env = Math.pow(1 - local / 0.24, 2);
              if (env > 0) sum += Math.sin(2 * Math.PI * notes[i][1] * local) * 0.35 * env;
            }
          }
          return sum;
        })),
        test: makeEntry(synth(0.7, function (t) {
          var notes = [[0, 660], [0.28, 990]];
          var sum = 0;
          for (var i = 0; i < notes.length; i++) {
            if (t >= notes[i][0]) {
              var local = t - notes[i][0];
              var env = Math.pow(1 - local / 0.36, 2);
              if (env > 0) sum += Math.sin(2 * Math.PI * notes[i][1] * local) * 0.45 * env;
            }
          }
          return sum;
        })),
        extra: makeEntry(synth(0.3, function (t) {
          var k = t / 0.3;
          return Math.sin(2 * Math.PI * (250 + 320 * k) * t) * 0.45 * Math.pow(1 - k, 1.5);
        }))
      };
    } catch (e) {
      soundFiles = null;
    }
    return soundFiles;
  }

  function makeEntry(uri) {
    var list = [];
    for (var i = 0; i < 3; i++) {
      var a = new Audio();
      a.src = uri;
      a.preload = 'auto';
      list.push(a);
    }
    return { uri: uri, list: list, idx: 0 };
  }

  function unlockFiles() {
    if (fileUnlocked) return;
    var files = buildSounds();
    if (!files) return;
    try {
      var a = files.pick.list[0];
      a.volume = 0;
      var p = a.play();
      if (p && p.then) {
        p.then(function () {
          a.pause();
          a.volume = 1;
        }).catch(function () {
          a.volume = 1;
        });
      } else {
        a.pause();
        a.volume = 1;
      }
      fileUnlocked = true;
    } catch (e) {
      /* не страшно */
    }
  }

  function playFile(name, rate) {
    var files = buildSounds();
    if (!files || !files[name]) return false;
    var entry = files[name];
    var a = entry.list[entry.idx % entry.list.length];
    entry.idx += 1;
    try {
      a.volume = 1;
      a.playbackRate = rate || 1;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) {
      return false;
    }
  }

  /* запасной путь через Web Audio, если файл не проигрался */
  function tone(type, f0, f1, vol, delay, dur) {
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
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

  function playSound(name, rate, fallbackFreq) {
    if (!soundOn) return;
    unlockAudio();
    var played = playFile(name, rate);
    if (!played && fallbackFreq) tone('sine', fallbackFreq, fallbackFreq * 0.6, 0.12, 0, 0.16);
  }

  function soundSelect() {
    playSound('pick', 1, 420);
  }

  /* Звук 1 — новая вода (water-sound.js: розовый шум через полосовые фильтры,
     журчание, пузырьки). Звуки 2–4 — прежние варианты. */
  function waterReady() {
    return typeof window.playWater === 'function' && window.waterSoundCount && window.waterSoundCount() > 0;
  }

  function soundPour(count) {
    if (!soundOn) return;
    unlockAudio();
    unlockFiles();
    if (soundPreset === 1 && waterReady()) {
      window.playWater(0.85);
      return;
    }
    var name = 'pour' + Math.max(0, soundPreset - 2);
    var rate = 0.94 + Math.random() * 0.12;
    if (!playFile(name, rate)) tone('sine', 320, 170, 0.12, 0, 0.2);
    setTimeout(function () {
      if (soundOn) playFile('splash', 0.95 + Math.random() * 0.1);
    }, 130 + Math.floor(Math.random() * 60));
  }

  function soundBad() {
    if (!soundOn) return;
    tone('sawtooth', 170, 110, 0.06, 0, 0.15);
  }

  function soundExtra() {
    playSound('extra', 1, 260);
  }

  function soundWin() {
    playSound('win', 1, 620);
  }

  function soundReveal() {
    playSound('pick', 1.35, 520);
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
    unlockFiles();
    if (soundOn) playFile('test');
  }

  var LAB_SOUNDS = ['water', 'pour0', 'pour1', 'pour2'];
  var LAB_STREAMS = ['Лента', 'Гладкая', 'Капли'];
  var POUR_MODES = ['ribbon', 'svg', 'drops'];

  function playLabSound(preset) {
    if (preset === 1 && waterReady()) {
      window.playWater(0.85);
      return;
    }
    playFile(LAB_SOUNDS[preset - 1] === 'water' ? 'pour0' : LAB_SOUNDS[preset - 1], 1);
  }

  function buildLab() {
    if (!els.labSounds) return;
    els.labSounds.innerHTML = '';
    for (var s = 1; s <= 4; s++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lab-btn' + (s === soundPreset ? ' active' : '');
      b.dataset.preset = String(s);
      b.textContent = 'Звук ' + s;
      els.labSounds.appendChild(b);
    }
    els.labStreams.innerHTML = '';
    for (var t = 1; t <= 3; t++) {
      var sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'lab-btn' + (t === streamStyle ? ' active' : '');
      sb.dataset.style = String(t);
      sb.textContent = LAB_STREAMS[t - 1];
      els.labStreams.appendChild(sb);
    }
  }

  function openLab() {
    buildLab();
    els.lab.classList.remove('hidden');
    els.lab.setAttribute('aria-hidden', 'false');
  }

  function closeLab() {
    els.lab.classList.add('hidden');
    els.lab.setAttribute('aria-hidden', 'true');
  }

  function checkSound() {
    if (!soundOn) {
      soundOn = true;
      saveSettings();
      updateSoundBtn();
    }
    unlockAudio();
    unlockFiles();
    var played = playFile('test');
    var ctx = ensureAudio();
    var web = ctx ? ctx.state : 'недоступен';
    toast('Проверка звука: файл ' + (played ? 'играет' : 'не запустился') +
      ', веб-аудио: ' + web + ' · версия ' + APP_VERSION + '. Если тишина — проверь переключатель «Без звука» на боку iPhone');
  }

  function toast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 3200);
  }

  /* ---------- память ---------- */

  function syncDaily() {
    if (!dailyData) return;
    dailyData.colors = colors;
    dailyData.empties = empties;
    dailyData.caps = caps;
    dailyData.flasks = flasks;
    dailyData.initial = initial;
    dailyData.undo = undoStack;
    dailyData.moves = moves;
    dailyData.par = par;
    dailyData.extraUsed = extraUsed;
    dailyData.hidden = hidden;
    dailyData.revealed = revealed;
  }

  function saveProgress() {
    if (mode === 'daily') syncDaily();
    var payload = {
      v: 4,
      mode: mode,
      level: level,
      colors: colors,
      empties: empties,
      caps: caps,
      flasks: flasks,
      initial: initial,
      undo: undoStack,
      moves: moves,
      par: par,
      extraUsed: extraUsed,
      hidden: hidden,
      revealed: revealed,
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
      /* нет места — играем дальше без сохранения */
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
      return Array.isArray(f) && f.length <= 6;
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
      /* в версии 11 варианты звука и струи новые — старый выбор не переносим */
      if (data && data.fx === 2) {
        if (typeof data.streamStyle === 'number') streamStyle = data.streamStyle;
        if (typeof data.soundPreset === 'number') soundPreset = data.soundPreset;
      }
    } catch (e) {
      soundOn = true;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        sound: soundOn,
        fx: 2,
        streamStyle: streamStyle,
        soundPreset: soundPreset
      }));
    } catch (e) {
      /* настройка просто не запомнится */
    }
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
    var bigCount = 0;
    for (var i = 0; i < flasks.length; i++) {
      if (!flasks[i].length) emptyCount += 1;
      if (caps[i] > E.CAP) bigCount += 1;
    }
    var bits = [colors + ' ' + plural(colors, 'цвет', 'цвета', 'цветов')];
    if (bigCount > 0) bits.push(bigCount + ' ' + plural(bigCount, 'большая колба', 'большие колбы', 'больших колб'));
    bits.push(emptyCount + ' ' + plural(emptyCount, 'запасная', 'запасные', 'запасных'));
    els.levelLabel.textContent = 'Уровень ' + level;
    els.levelSub.textContent = bits.join(' · ');
  }

  /* ---------- переходы между досками ---------- */

  function applyFields(src) {
    colors = src.colors || 3;
    empties = src.empties || 2;
    flasks = cloneBoard(src.flasks || []);
    caps = Array.isArray(src.caps) && src.caps.length === flasks.length
      ? src.caps.slice()
      : new Array(flasks.length).fill(E.CAP);
    initial = src.initial && src.initial.length === flasks.length ? cloneBoard(src.initial) : cloneBoard(flasks);
    undoStack = Array.isArray(src.undo) ? src.undo.filter(function (m) {
      return m && typeof m.from === 'number' && typeof m.to === 'number' && typeof m.count === 'number';
    }) : [];
    moves = typeof src.moves === 'number' ? src.moves : 0;
    par = typeof src.par === 'number' && src.par > 0 ? src.par : null;
    extraUsed = !!src.extraUsed;
    hidden = Array.isArray(src.hidden) ? src.hidden.slice() : [];
    revealed = Array.isArray(src.revealed) ? src.revealed.slice() : [];
    mysteryShown = revealed.length > 0 || hidden.length === 0;
    selected = -1;
  }

  function stashCampaign() {
    if (mode !== 'campaign') return;
    campaignStash = {
      level: level,
      colors: colors,
      empties: empties,
      caps: caps.slice(),
      flasks: cloneBoard(flasks),
      initial: cloneBoard(initial),
      undo: undoStack.slice(),
      moves: moves,
      par: par,
      extraUsed: extraUsed,
      hidden: hidden.slice(),
      revealed: revealed.slice()
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
    caps = g.caps.slice();
    flasks = cloneBoard(g.state);
    initial = cloneBoard(g.state);
    undoStack = [];
    moves = 0;
    par = g.solution ? g.solution.length : null;
    extraUsed = false;
    hidden = pickHidden(level * 101 + 7, colors);
    revealed = [];
    mysteryShown = hidden.length === 0;
    selected = -1;
    setHeader();
    render();
    saveProgress();
  }

  function buildDaily(key) {
    var cfg = dailyConfig(key);
    var g = E.generate(cfg.level, { colors: cfg.colors, empties: cfg.empties, big: cfg.big });
    return {
      key: key,
      done: false,
      colors: g.colors,
      empties: g.empties,
      caps: g.caps.slice(),
      flasks: cloneBoard(g.state),
      initial: cloneBoard(g.state),
      undo: [],
      moves: 0,
      par: g.solution ? g.solution.length : null,
      extraUsed: false,
      hidden: pickHidden(Number(key.replace(/-/g, '')), g.colors),
      revealed: []
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
          caps: data.caps,
          flasks: data.flasks,
          initial: data.initial,
          undo: data.undo,
          moves: data.moves,
          par: data.par,
          extraUsed: data.extraUsed,
          hidden: data.hidden,
          revealed: data.revealed
        };

    level = campaignSrc.level || 1;
    if (maxLevel < level) maxLevel = level;

    if (!completed) {
      completed = {};
      for (var passed = 1; passed < level; passed++) completed[String(passed)] = true;
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

    if (E.isSolved(flasks, caps)) {
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
      var cap = caps[i] || E.CAP;
      var el = document.createElement('div');
      el.className = 'flask';
      if (i === selected) el.classList.add('selected');
      if (cap > E.CAP) el.classList.add('big');
      el.dataset.i = String(i);
      el.dataset.cap = String(cap);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Колба ' + (i + 1) + ' на ' + cap + ' слоёв');
      el.tabIndex = 0;

      var glass = document.createElement('div');
      glass.className = 'glass';

      var body = document.createElement('div');
      body.className = 'body';

      var pct = 100 / cap;
      for (var l = 0; l < flasks[i].length; l++) {
        var colorIndex = flasks[i][l];
        var seg = document.createElement('div');
        seg.className = 'liquid';
        seg.style.flex = '0 0 ' + pct + '%';
        if (isHiddenColor(colorIndex)) {
          seg.classList.add('mystery');
          seg.textContent = '?';
        } else {
          var base = E.colorFor(colors, colorIndex);
          seg.style.background = 'linear-gradient(180deg, ' + tint(base, 0.3) + ', ' +
            base + ' 55%, ' + tint(base, -0.18) + ')';
        }
        if (l === flasks[i].length - 1) seg.classList.add('top');
        if (anim && anim.index === i && l >= anim.from) seg.classList.add('in');
        if (anim && anim.outIndex === i && l >= anim.outFrom) seg.classList.add('out');
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

    var maxCap = E.CAP;
    for (var i = 0; i < caps.length; i++) {
      if (caps[i] > maxCap) maxCap = caps[i];
    }

    var rect = board.getBoundingClientRect();
    var availW = Math.max(120, rect.width - 4);
    var availH = Math.max(120, rect.height - 4);

    var gapX = Math.max(8, Math.min(18, availW * 0.03));
    var gapY = Math.max(12, Math.min(24, availH * 0.05));

    var maxByW = (availW - (perRow - 1) * gapX) / perRow;
    var rowH = (availH - (rows - 1) * gapY) / rows;
    var unitH = rowH / maxCap;

    var fw = Math.min(maxByW, unitH / 0.8, 60);
    fw = Math.max(24, fw);
    unitH = Math.min(unitH, fw * 0.8);

    for (var f = 0; f < flaskEls.length; f++) {
      var cap = caps[f] || E.CAP;
      flaskEls[f].style.width = fw.toFixed(1) + 'px';
      flaskEls[f].style.height = (unitH * cap).toFixed(1) + 'px';
    }

    var root = document.documentElement.style;
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

  function selectFlask(i) {
    selected = i;
    var opened = revealTop(i);
    soundSelect();
    render();
    if (opened) {
      soundReveal();
      saveProgress();
      if (!mysteryShown) {
        mysteryShown = true;
        toast('Открылся цвет. Другие закрытые цвета открываются, когда касаешься их колбы');
      }
    }
  }

  function onFlaskTap(i) {
    if (locked || i < 0 || i >= flasks.length) return;

    if (selected === -1) {
      if (!flasks[i].length) {
        shake(i);
        soundBad();
        return;
      }
      selectFlask(i);
      return;
    }

    if (selected === i) {
      selected = -1;
      render();
      return;
    }

    var n = E.canPour(flasks, selected, i, caps);
    if (n > 0) {
      doPour(selected, i, n);
      return;
    }

    if (flasks[i].length) {
      selectFlask(i);
      shake(i);
    } else {
      shake(i);
      soundBad();
    }
  }

  /* Струя льётся дугой: выходит из горлышка наклонённой колбы и падает
     в горлышко приёмника, как настоящая жидкость. */
  function spawnStream(srcEl, dstEl, color, dir, targetLevel, targetCap) {
    if (!srcEl || !dstEl) return;
    var a = srcEl.getBoundingClientRect();
    var b = dstEl.getBoundingClientRect();

    /* колба поднимается на 48% высоты и наклоняется на 32 градуса,
       поэтому горлышко оказывается выше и сбоку от приёмника */
    var theta = (dir > 0 ? 32 : -32) * Math.PI / 180;
    var w = a.width;
    var h = a.height;
    var cx = a.left + w / 2;
    var originY = a.top + h * 0.92;
    var lift = h * 0.48;
    var localX = (dir > 0 ? 1 : -1) * w * 0.46;
    var localY = -h * 0.86;
    var mx = cx + localX * Math.cos(theta) - localY * Math.sin(theta);
    var my = originY - lift + localX * Math.sin(theta) + localY * Math.cos(theta);

    /* струя заканчивается чуть внутри горлышка приёмника */
    var x1 = b.left + b.width / 2;
    var surfaceY = b.top + Math.min(14, b.height * 0.1);

    var dx = x1 - mx;
    var dy = surfaceY - my;
    var cpx = mx + dx * 0.35;
    var cpy = my + dy * 0.8;
    var d = 'M ' + mx.toFixed(1) + ' ' + my.toFixed(1) +
      ' Q ' + cpx.toFixed(1) + ' ' + cpy.toFixed(1) +
      ' ' + x1.toFixed(1) + ' ' + surfaceY.toFixed(1);

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'stream-svg');
    svg.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

    var style = streamStyle;
    var main = null;
    if (style !== 3) {
      main = document.createElementNS(ns, 'path');
      main.setAttribute('d', d);
      main.setAttribute('fill', 'none');
      main.setAttribute('stroke', color);
      main.setAttribute('stroke-width', style === 2 ? '7' : '4.5');
      main.setAttribute('stroke-linecap', 'butt');
      main.setAttribute('class', 'stream-path');
      svg.appendChild(main);
    }

    var dropCount = style === 1 ? 2 : (style === 2 ? 2 : 6);
    for (var k = 0; k < dropCount; k++) {
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('r', (style === 3 ? 3 : 1.8).toFixed(1));
      dot.setAttribute('fill', color);
      var motion = document.createElementNS(ns, 'animateMotion');
      motion.setAttribute('dur', '0.4s');
      motion.setAttribute('begin', (0.04 * k).toFixed(2) + 's');
      motion.setAttribute('fill', 'freeze');
      motion.setAttribute('path', d);
      dot.appendChild(motion);
      svg.appendChild(dot);
    }

    document.body.appendChild(svg);

    if (main) {
      var len = 60;
      try {
        len = main.getTotalLength();
      } catch (e) {
        len = 60;
      }
      main.style.strokeDasharray = len;
      main.style.strokeDashoffset = len;
      setTimeout(function () {
        main.style.transition = 'stroke-dashoffset 0.12s linear';
        main.style.strokeDashoffset = '0';
      }, 10);
    }

    setTimeout(function () {
      svg.classList.add('fade');
    }, 320);
    setTimeout(function () {
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    }, 560);

    var splash = document.createElement('div');
    splash.className = 'splash';
    splash.style.left = x1 + 'px';
    splash.style.top = surfaceY + 'px';
    splash.style.background = 'radial-gradient(circle, ' + tint(color, 0.75) +
      ', rgba(255,255,255,0) 70%)';
    document.body.appendChild(splash);
    setTimeout(function () {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 460);
  }

  function reducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  /* Ход применяется к состоянию игры после анимации (общая часть для обоих путей). */
  function applyPour(i, j, n, oldLen, animateIn) {
    E.pour(flasks, i, j, caps);
    undoStack.push({ from: i, to: j, count: n });
    if (undoStack.length > 500) undoStack.shift();
    moves += 1;
    render(animateIn ? { index: j, from: oldLen } : null);
    if (animateIn) {
      var targetEl = flaskEls[j];
      if (targetEl) {
        targetEl.classList.add('wave');
        setTimeout(function () {
          targetEl.classList.remove('wave');
        }, 560);
      }
    }
    locked = false;
    saveProgress();
    if (E.isSolved(flasks, caps)) {
      setTimeout(onWin, 170);
    }
  }

  function doPour(i, j, n) {
    locked = true;
    selected = -1;

    var oldLen = flasks[j].length;
    var outFrom = flasks[i].length - n;
    var dir = j > i ? 1 : -1;
    var srcEl = flaskEls[i];
    var dstEl = flaskEls[j];
    var colorIndex = flasks[i][flasks[i].length - 1];
    var hidden = isHiddenColor(colorIndex);
    var color = hidden ? '#2b3457' : E.colorFor(colors, colorIndex);

    /* Новый перелив (water-pour.js): колба поднимается над приёмником и
       наклоняется, поверхность жидкости остаётся горизонтальной, уровень
       в источнике падает, а в приёмнике растёт прямо во время струи. */
    if (window.WaterPour && srcEl && dstEl && !reducedMotion()) {
      [srcEl, dstEl].forEach(function (el) {
        el.classList.remove('selected', 'hint-from', 'hint-to', 'shake');
      });
      srcEl.classList.add('wp-pouring');
      dstEl.classList.add('receive');
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        applyPour(i, j, n, oldLen, false);
      };
      var started = false;
      try {
        window.WaterPour.pour(srcEl, dstEl, {
          n: n,
          srcCap: caps[i] || E.CAP,
          dstCap: caps[j] || E.CAP,
          liqSel: '.body',
          srcCount: flasks[i].length,
          dstCount: oldLen,
          color: color,
          mode: POUR_MODES[streamStyle - 1] || 'ribbon',
          onFlow: function () {
            soundPour(n);
          }
        }).then(finish, finish);
        started = true;
      } catch (e) {
        started = false;
      }
      /* страховка: если кадры анимации не пришли (вкладка в фоне), ход всё равно применится */
      setTimeout(finish, 1500);
      if (started) return;
      done = true;
      srcEl.classList.remove('wp-pouring');
    }

    if (srcEl) {
      srcEl.classList.remove('selected');
      srcEl.style.setProperty('--tilt', (dir * 32) + 'deg');
      srcEl.classList.add('pouring');
      var segs = srcEl.querySelectorAll('.liquid');
      for (var k = outFrom; k < segs.length; k++) segs[k].classList.add('out');
    }
    if (dstEl) dstEl.classList.add('receive');

    if (!hidden) spawnStream(srcEl, dstEl, color, dir, oldLen, caps[j]);
    soundPour(n);

    setTimeout(function () {
      applyPour(i, j, n, oldLen, true);
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
    playSound('pick', 0.8, 260);
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
    if (locked || extraUsed || E.isSolved(flasks, caps)) return;
    extraUsed = true;
    flasks.push([]);
    caps.push(E.CAP);
    selected = -1;
    soundExtra();
    setHeader();
    render();
    saveProgress();
    toast('Запасная колба добавлена — она останется до конца уровня');
  }

  function showHint() {
    if (locked) return;
    var solution = E.solve(flasks, 150000, caps);
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

    tone('sine', 700, 620, 0.05, 0, 0.09);
  }

  /* ---------- звёзды, победа, конфетти ---------- */

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
    var solution = E.solve(initial, 150000, caps);
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
      html += '<span class="' + (i <= count ? 'on' : '') + '" style="animation-delay:' +
        ((i - 1) * 0.12).toFixed(2) + 's">★</span>';
    }
    els.winStars.innerHTML = html;
  }

  function confetti() {
    for (var i = 0; i < 16; i++) {
      var d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = (8 + Math.random() * 84) + 'vw';
      d.style.background = E.PALETTE[i % E.PALETTE.length];
      d.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      d.style.animationDuration = (1.1 + Math.random() * 0.8).toFixed(2) + 's';
      d.style.width = (5 + Math.random() * 5).toFixed(0) + 'px';
      d.style.height = (8 + Math.random() * 8).toFixed(0) + 'px';
      document.body.appendChild(d);
      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 2400);
      }(d));
    }
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
    confetti();
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
    /* звук воды собирается заранее, в фоне (OfflineAudioContext не требует касания) */
    if (typeof window.initWaterSound === 'function') {
      try {
        window.initWaterSound();
      } catch (e) {
        /* останутся прежние звуки */
      }
    }
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
    els.soundTest = $('soundTest');
    els.labBtn = $('labBtn');
    els.lab = $('lab');
    els.labSounds = $('labSounds');
    els.labStreams = $('labStreams');
    els.labClose = $('labClose');
    els.labDone = $('labDone');
    els.appVersion = $('appVersion');
    if (els.appVersion) els.appVersion.textContent = 'версия ' + APP_VERSION;

    window.KolbyDebug = {
      sounds: function () {
        var files = buildSounds();
        if (!files) return null;
        var out = {};
        for (var key in files) {
          if (Object.prototype.hasOwnProperty.call(files, key)) out[key] = files[key].uri;
        }
        return out;
      },
      audioState: function () {
        var ctx = ensureAudio();
        return ctx ? ctx.state : 'none';
      }
    };

    loadSettings();
    updateSoundBtn();

    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        unlockAudio();
        unlockFiles();
      }, { once: true, capture: true, passive: true });
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
    if (els.soundTest) els.soundTest.addEventListener('click', checkSound);
    if (els.labBtn) {
      els.labBtn.addEventListener('click', function () {
        closeLevels();
        openLab();
      });
      els.labClose.addEventListener('click', closeLab);
      els.labDone.addEventListener('click', closeLab);
      els.labSounds.addEventListener('click', function (e) {
        var btn = e.target;
        while (btn && btn !== els.labSounds && !btn.classList.contains('lab-btn')) btn = btn.parentNode;
        if (!btn || !btn.dataset || !btn.dataset.preset) return;
        soundPreset = parseInt(btn.dataset.preset, 10);
        if (!soundOn) {
          soundOn = true;
          updateSoundBtn();
        }
        saveSettings();
        buildLab();
        unlockAudio();
        unlockFiles();
        playLabSound(soundPreset);
      });
      els.labStreams.addEventListener('click', function (e) {
        var btn = e.target;
        while (btn && btn !== els.labStreams && !btn.classList.contains('lab-btn')) btn = btn.parentNode;
        if (!btn || !btn.dataset || !btn.dataset.style) return;
        streamStyle = parseInt(btn.dataset.style, 10);
        saveSettings();
        buildLab();
        closeLab();
        toast('Струя «' + LAB_STREAMS[streamStyle - 1] + '»: перелей жидкость на доске');
      });
    }
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
