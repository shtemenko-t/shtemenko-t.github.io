/* Колбы — спецэффекты (версия 15): искры и блёстки на холсте поверх доски.
   KolbyFx.burst(x, y, color) — колба собрана: искры её цвета и звёздочки.
   KolbyFx.rain(colors) — уровень пройден: блёстки сверху по всему экрану. */
(function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var parts = [];
  var running = false;
  var dpr = 1;

  function ensure() {
    if (canvas) return true;
    if (!document.body) return false;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return !!ctx;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }

  function reduced() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function lighten(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function add(p) {
    parts.push(p);
    if (!running) {
      running = true;
      requestAnimationFrame(step);
    }
  }

  var last = 0;
  function step(now) {
    if (!ctx) {
      running = false;
      return;
    }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var u = p.t / p.life;
      ctx.globalAlpha = Math.max(0, 1 - u * u);
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        drawStar(p.x, p.y, p.size * (1 - u * 0.5), p.rot);
      } else if (p.kind === 'flake') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.2 * (1 - u);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + u * p.grow, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - u * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      running = false;
      last = 0;
    }
  }

  function drawStar(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var rr = k % 2 ? r * 0.28 : r;
      var a = k * Math.PI / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* колба собрана: искры её цвета разлетаются от горлышка + белые звёздочки */
  function burst(x, y, color) {
    if (reduced() || !ensure()) return;
    var light = lighten(color, 0.45);
    add({ kind: 'ring', x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1, size: 6, grow: 34, rot: 0, spin: 0, t: 0, life: 0.45, color: light });
    for (var i = 0; i < 22; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      var v = 120 + Math.random() * 230;
      add({
        kind: 'dot', x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        g: 520, drag: 0.93, size: 1.6 + Math.random() * 2.4,
        rot: 0, spin: 0, t: 0, life: 0.55 + Math.random() * 0.4,
        color: Math.random() < 0.65 ? light : color
      });
    }
    for (var s = 0; s < 6; s++) {
      var b = Math.random() * Math.PI * 2;
      var w = 40 + Math.random() * 80;
      add({
        kind: 'star', x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(b) * w, vy: Math.sin(b) * w - 40,
        g: 60, drag: 0.95, size: 4 + Math.random() * 4,
        rot: Math.random() * 3, spin: (Math.random() - 0.5) * 6, t: 0, life: 0.7 + Math.random() * 0.4,
        color: '#ffffff'
      });
    }
  }

  /* уровень пройден: блёстки цветов уровня сыплются сверху */
  function rain(colors) {
    if (reduced() || !ensure()) return;
    var W = window.innerWidth;
    var list = colors && colors.length ? colors : ['#ffd76a', '#7ee7c7', '#ec4899'];
    for (var i = 0; i < 70; i++) {
      add({
        kind: Math.random() < 0.2 ? 'star' : 'flake',
        x: Math.random() * W, y: -20 - Math.random() * 180,
        vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 160,
        g: 90, drag: 0.985, size: 3 + Math.random() * 3.5,
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, t: 0, life: 2 + Math.random() * 1.2,
        color: Math.random() < 0.2 ? '#ffffff' : list[Math.floor(Math.random() * list.length)]
      });
    }
  }

  window.KolbyFx = { burst: burst, rain: rain };
}());
