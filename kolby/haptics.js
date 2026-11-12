/* Колбы — вибрация (версия 15).
   Android и другие браузеры с navigator.vibrate — настоящий вибромотор.
   iPhone: в Safari нет navigator.vibrate, но с iOS 18 нажатие на системный
   переключатель (<input type="checkbox" switch>) даёт лёгкий «тик» Taptic
   Engine. Мы держим такой переключатель невидимым и «нажимаем» его кодом.
   Работает только сразу после касания экрана — это ограничение iPhone. */
(function () {
  'use strict';

  var on = true;
  var label = null;
  var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  function setup() {
    if (label || typeof document === 'undefined' || !document.body) return;
    try {
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'kolbyHaptic';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      var hide = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;pointer-events:none;';
      input.style.cssText = hide;
      label = document.createElement('label');
      label.htmlFor = 'kolbyHaptic';
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = hide;
      document.body.appendChild(input);
      document.body.appendChild(label);
    } catch (e) {
      label = null;
    }
  }

  function tick() {
    setup();
    if (!label) return;
    try {
      label.click();
    } catch (e) {
      /* без тика */
    }
  }

  /* pattern — как у navigator.vibrate: [вибрация, пауза, вибрация, ...] мс */
  function play(pattern) {
    if (!on) return;
    if (canVibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        /* нет вибромотора */
      }
      return;
    }
    /* iPhone: один тик на каждый импульс шаблона */
    var t = 0;
    for (var i = 0; i < pattern.length; i += 2) {
      if (t === 0) tick();
      else setTimeout(tick, t);
      t += (pattern[i] || 0) + (pattern[i + 1] || 0);
    }
  }

  window.KolbyHaptics = {
    setOn: function (v) { on = !!v; },
    isOn: function () { return on; },
    native: function () { return canVibrate; },
    /* касание колбы — короткий «тык» */
    tap: function () { play([9]); },
    /* налили: «бзык» — несколько мелких импульсов, чем больше слоёв, тем дольше */
    pour: function (n) {
      var p = [];
      var k = Math.max(2, Math.min(5, (n || 1) + 1));
      for (var i = 0; i < k; i++) p.push(14, 46);
      play(p);
    },
    /* колба собрана, крышечка защёлкнулась */
    done: function () { play([18, 70, 34]); },
    /* так нельзя */
    bad: function () { play([26, 50, 26]); },
    /* уровень пройден */
    win: function () { play([30, 60, 30, 60, 70]); }
  };
}());
