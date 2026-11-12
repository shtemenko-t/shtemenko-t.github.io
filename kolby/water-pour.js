/* ============================================================
   ВОДА: переливание колб (3 режима: 'svg' | 'drops' | 'ribbon')
   Вставить в игру целиком. Без зависимостей.
   Вызов:  await WaterPour.pour(srcEl, dstEl, {n:2, cap:4, mode:'ribbon', onFlow: playPour});
   После await — обновляйте состояние игры и перерисовывайте колбы.
   ============================================================ */
(() => {
  'use strict';
  const G = 14000;                       // «гравитация» струи, px/с² (подогнана под ~340 мс)
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  // накопленный объём при расходе-трапеции (разгон 20% — плато — спад 20%), 0..1
  const cumFlow = u => {
    u = clamp(u, 0, 1); const r = .2, A = 1 - r;
    if (u < r) return u * u / (2 * r) / A;
    if (u < 1 - r) return (r / 2 + (u - r)) / A;
    return (A - (1 - u) * (1 - u) / (2 * r)) / A;
  };
  const rateAt = u => u <= 0 || u >= 1 ? 0 : Math.min(1, u / .2, (1 - u) / .2);

  const rgbCache = {};
  function toRGB(c) {
    if (rgbCache[c]) return rgbCache[c];
    const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d);
    const m = getComputedStyle(d).color.match(/[\d.]+/g); d.remove();
    return rgbCache[c] = m.slice(0, 3).map(Number);
  }
  const mix = (c, w, a) => { const r = toRGB(c); return 'rgb(' + r.map(v => Math.round(lerp(v, w, a))).join(',') + ')'; };
  function layerColor(el) {
    const cs = getComputedStyle(el); let c = cs.backgroundColor;
    if (!c || c === 'transparent' || /,\s*0\)$/.test(c)) {
      const m = (cs.backgroundImage || '').match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i); c = m ? m[0] : '#4aa8ff';
    }
    return c;
  }

  /* ---------- оверлеи: один SVG и один canvas на всю игру, создаются лениво ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  let svg, sPath, sHl, sR1, sR2, sFoot, cv, cx;
  function ensureSvg() {
    if (svg) return;
    svg = document.createElementNS(NS, 'svg'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60;display:none;overflow:visible';
    const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    sPath = mk('path', {}); sHl = mk('path', { fill: 'none', 'stroke-linecap': 'round' });
    sFoot = mk('ellipse', {}); sR1 = mk('ellipse', { fill: 'none' }); sR2 = mk('ellipse', { fill: 'none' });
    document.body.appendChild(svg);
  }
  function ensureCanvas() {
    if (!cv) {
      cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60;display:none';
      document.body.appendChild(cv); cx = cv.getContext('2d');
    }
    cv.style.display = 'block';
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- геометрия струи: x растёт линейно, y ~ s² — как падающая вода ---------- */
  function ribbon(S, t, wob) {
    const N = 14, L = [], R = [], C = [], H = [];
    for (let i = 0; i <= N; i++) {
      const s = S.sT + (S.sH - S.sT) * i / N;
      const u = (t - s * S.Tf * 1000 - S.f0) / (S.f1 - S.f0);
      const rate = rateAt(u);
      let wd = S.W * (.3 + .7 * rate) * (1 - .5 * s);
      if (wob) wd *= 1 + .1 * Math.sin(s * 17 - t * .045);
      if (S.sH < 1) wd *= Math.min(1, (N - i + .6) / 2.2);        // округлая «голова» струи
      if (S.sT > 0) wd *= Math.min(1, (i + .6) / 2.2);            // и «хвост»
      let x = S.x0 + (S.x1 - S.x0) * s, y = S.y0 + (S.y1 - S.y0) * s * s;
      const tx = S.x1 - S.x0, ty = 2 * (S.y1 - S.y0) * s, len = Math.hypot(tx, ty) || 1, nx = -ty / len, ny = tx / len;
      if (wob) { const o = 1.1 * s * Math.sin(s * 11 - t * .03); x += nx * o; y += ny * o; }
      L.push([x + nx * wd / 2, y + ny * wd / 2]); R.push([x - nx * wd / 2, y - ny * wd / 2]); C.push([x, y]);
      H.push([x + nx * wd * .2, y + ny * wd * .2]);
    }
    return { L, R, C, H };
  }
  const pts = a => a.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');

  /* ---------- ядро ---------- */
  let queue = Promise.resolve();
  function pour(src, dst, o) {
    const p = queue.then(() => run(src, dst, o || {}));
    queue = p.catch(() => {});
    return p;
  }

  function run(src, dst, o) {
    return new Promise(resolve => {
      const sel = o.liqSel || '.liq', mode = o.mode || 'ribbon';
      const srcLiq = src.querySelector(sel) || src, dstLiq = dst.querySelector(sel) || dst;
      if (getComputedStyle(dstLiq).position === 'static') dstLiq.style.position = 'relative';
      const unit = 1 / (o.dstCap || o.cap || 4), sUnit = 1 / (o.srcCap || o.cap || 4);   // у большой колбы 6 слоёв
      const srcCount = o.srcCount != null ? o.srcCount : srcLiq.children.length;
      const dstCount = o.dstCount != null ? o.dstCount : dstLiq.children.length;
      const n = Math.max(1, o.n || 1);
      const layers = o.srcLayers || Array.from(srcLiq.children).slice(-n).reverse();   // верхний слой первым
      const color = o.color || layerColor(layers[0]);
      const light = mix(color, 255, .55), dark = mix(color, 0, .12);
      const dur = o.dur || 340, k = dur / 340;
      const tiltDeg = o.tilt || (o.fly !== false ? 56 : 32), lift = o.lift != null ? o.lift : .48, oy = o.originY || .92, neck = o.neck || .3;
      const keepSurface = o.keepSurface !== false;

      // --- замеры один раз (никаких чтений layout в кадре) ---
      const ss = src.style, keep = { t: ss.transform, tr: ss.transition, o: ss.transformOrigin, z: ss.zIndex, w: ss.willChange };
      const r1 = src.getBoundingClientRect();
      ss.transition = 'none'; ss.transform = 'none';
      const r0 = src.getBoundingClientRect(), rd = dst.getBoundingClientRect(), liqR = dstLiq.getBoundingClientRect();
      const lift0 = r1.top - r0.top, W_ = r0.width, H_ = r0.height;
      const sgn = (rd.left + rd.width / 2) > (r0.left + r0.width / 2) ? 1 : -1;
      const Ox = r0.left + W_ / 2, Oy = r0.top + oy * H_;
      ss.transformOrigin = '50% ' + oy * 100 + '%'; ss.zIndex = 20; ss.willChange = 'transform';
      const ls = srcLiq.style, lkeep = { t: ls.transform, o: ls.transformOrigin, l: ls.left, r: ls.right };
      if (keepSurface) { ls.left = '-160%'; ls.right = '-160%'; }
      layers.forEach(l => { l.style.transformOrigin = '50% 100%'; });

      // призраки в приёмнике: клоны слоёв, растут снизу вверх
      const ghosts = layers.map((l, i) => {
        const g = l.cloneNode(false); const s = g.style;
        s.position = 'absolute'; s.left = '0'; s.right = '0'; s.margin = '0';
        s.bottom = (dstCount + i) * unit * 100 + '%'; s.height = unit * 100 + '%';
        s.transformOrigin = '50% 100%'; s.transform = 'scaleY(0)';
        dstLiq.appendChild(g); return g;
      });

      // --- траектория ---
      const hitY = f => liqR.bottom - (dstCount + n * f) * unit * liqR.height;
      const W = clamp(W_ * .2, 6, 12) * (o.width || 1);
      const x1 = rd.left + rd.width / 2;
      /* колба подлетает к приёмнику: горлышко при полном наклоне — чуть сбоку
         от центра приёмника и немного выше его края; струя короткая, падает вниз */
      const lipRaw = (deg) => {
        const f = sgn * deg * Math.PI / 180, c = Math.cos(f), s = Math.sin(f), vx = sgn * neck * W_, vy = -oy * H_;
        return [Ox + vx * c - vy * s, Oy + vx * s + vy * c];
      };
      const lipFull = lipRaw(tiltDeg * 1.1);
      const fly = o.fly !== false;
      const dxT = fly ? (x1 - sgn * rd.width * .12) - lipFull[0] : 0;
      const tyT = fly ? (rd.top - .32 * H_) - lipFull[1] : -lift * H_;
      const yMid = hitY(.5), yLip = lipFull[1] + tyT;
      const Tf = clamp(Math.sqrt(2 * Math.max(30, yMid - yLip) / G), .06, .2);
      const tTilt = 140 * k, f0 = 110 * k, f1 = 270 * k, rs = 285 * k, re = 430 * k;   // подлёт — струя — возврат
      const tEnd = Math.max(re, f1 + Tf * 1000 + 40);
      const S = { W, Tf, f0, f1, x1, sT: 0, sH: 0 };
      const lipAt = (deg, tx, ty) => { const q = lipRaw(deg); return [q[0] + tx, q[1] + ty]; };

      // оверлей
      let P = [], Q = [], sparkAcc = 0;
      if (mode === 'svg') {
        ensureSvg(); svg.style.display = 'block';
        sPath.setAttribute('fill', color); sFoot.setAttribute('fill', color);
        sHl.setAttribute('stroke', 'rgba(255,255,255,.4)'); sHl.setAttribute('stroke-width', '1.4');
        sR1.setAttribute('stroke', light); sR2.setAttribute('stroke', light);
      } else {
        ensureCanvas();
      }
      const clr = { x: Math.min(r0.left, rd.left) - 160, y: Math.min(r0.top - (lift + .15) * H_, rd.top) - 40,
                    w: Math.abs(rd.left - r0.left) + W_ + 280, h: Math.max(rd.bottom, r0.bottom) - Math.min(r0.top - (lift + .15) * H_, rd.top) + 80 };
      const liqL = liqR.left + 2, liqRr = liqR.right - 2;

      let T0 = 0, last = 0, fired = false;
      function ripples(t, fillNow, rate) {
        // два расходящихся кольца на поверхности приёмника, ограничены стенками
        const y = hitY(fillNow), out = [];
        if (rate <= 0 && t > f1 + Tf * 1000 + 260) return out;
        for (let j = 0; j < 2; j++) {
          const q = ((t * .0036 + j * .5) % 1);
          const rx = Math.min(3 + 15 * q, Math.min(x1 - liqL, liqRr - x1));
          out.push([x1, y, rx, .8 + 2.6 * q, (1 - q) * .75 * Math.max(.25, rate)]);
        }
        return out;
      }

      function frame(now) {
        if (!T0) { T0 = now; last = now; }
        const t = now - T0, dt = Math.min(now - last, 33); last = now;
        const ein = ease(clamp(t / tTilt, 0, 1)), eout = 1 - ease(clamp((t - rs) / (re - rs), 0, 1)), e = ein * eout;
        const drain = cumFlow((t - f0) / (f1 - f0)), fill = cumFlow((t - f0 - Tf * 1000) / (f1 - f0));
        const deg = tiltDeg * (1 + .2 * drain) * e, ty = lerp(lift0, tyT, e), tx = dxT * e;
        ss.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) rotate(' + (sgn * deg).toFixed(2) + 'deg)';
        if (keepSurface) {
          ls.transformOrigin = '50% ' + ((1 - (srcCount - n * drain) * sUnit) * 100).toFixed(2) + '%';
          ls.transform = 'rotate(' + (-sgn * deg).toFixed(2) + 'deg)';
        }
        const dN = n * drain, fN = n * fill;
        layers.forEach((l, i) => { l.style.transform = 'scaleY(' + clamp(1 - (dN - i), 0, 1).toFixed(3) + ')'; });
        ghosts.forEach((g, i) => { g.style.transform = 'scaleY(' + clamp(fN - i, 0, 1).toFixed(3) + ')'; });

        if (!fired && t >= f0) { fired = true; if (o.onFlow) try { o.onFlow(); } catch (_) {} }

        const lip = lipAt(deg, tx, ty);
        S.x0 = lip[0]; S.y0 = lip[1]; S.y1 = hitY(fill);
        S.sH = clamp((t - f0) / (Tf * 1000), 0, 1); S.sT = clamp((t - f1) / (Tf * 1000), 0, 1);
        const live = S.sT < 1 && S.sH > 0 && S.sH > S.sT;
        const rate = rateAt((t - f0 - Tf * 1000) / (f1 - f0));

        if (mode === 'svg') {
          if (live) {
            const g = ribbon(S, t, false);
            sPath.setAttribute('d', 'M' + pts(g.L) + 'L' + pts(g.R.slice().reverse()) + 'Z');
            sHl.setAttribute('d', 'M' + pts(g.H));
          } else { sPath.setAttribute('d', ''); sHl.setAttribute('d', ''); }
          const impact = S.sH >= 1 && S.sT < 1;
          sFoot.setAttribute('rx', impact ? (W * (.5 + .6 * rate)).toFixed(1) : 0); sFoot.setAttribute('ry', impact ? (1.6 + rate).toFixed(1) : 0);
          sFoot.setAttribute('cx', x1.toFixed(1)); sFoot.setAttribute('cy', S.y1.toFixed(1));
          const rp = ripples(t, fill, impact ? rate : 0);
          [sR1, sR2].forEach((el, j) => {
            const r = rp[j];
            if (!r || (!impact && t < f0 + Tf * 1000)) { el.setAttribute('stroke-opacity', 0); return; }
            el.setAttribute('cx', r[0].toFixed(1)); el.setAttribute('cy', r[1].toFixed(1));
            el.setAttribute('rx', r[2].toFixed(1)); el.setAttribute('ry', r[3].toFixed(1));
            el.setAttribute('stroke-opacity', r[4].toFixed(2)); el.setAttribute('stroke-width', '1.2');
          });
        } else {
          cx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
          const hitAge = t - f0 - Tf * 1000, impact = S.sH >= 1 && S.sT < 1;
          if (mode === 'ribbon' && live) {
            const g = ribbon(S, t, true);
            cx.fillStyle = color; cx.beginPath(); cx.moveTo(g.L[0][0], g.L[0][1]);
            for (let i = 1; i < g.L.length; i++) cx.lineTo(g.L[i][0], g.L[i][1]);
            for (let i = g.R.length - 1; i >= 0; i--) cx.lineTo(g.R[i][0], g.R[i][1]);
            cx.closePath(); cx.fill();
            cx.strokeStyle = 'rgba(255,255,255,.4)'; cx.lineWidth = 1.4; cx.lineCap = 'round';
            cx.beginPath(); cx.moveTo(g.H[0][0], g.H[0][1]); for (let i = 1; i < g.H.length; i++) cx.lineTo(g.H[i][0], g.H[i][1]); cx.stroke();
          }
          if (mode === 'drops') {
            // эмиссия капель с горлышка: по баллистической траектории в точку (x1, y1)
            const emitRate = rateAt((t - f0) / (f1 - f0));
            sparkAcc += emitRate * dt * .28;
            const vx0 = (S.x1 - S.x0) / Tf, vy0 = ((S.y1 - S.y0) - .5 * G * Tf * Tf) / Tf;
            while (sparkAcc >= 1) {
              sparkAcc -= 1; const tau = Math.random() * dt * .001;
              P.push({ x: S.x0 + (Math.random() - .5) * W * .5 + vx0 * tau, y: S.y0 + vy0 * tau + .5 * G * tau * tau,
                       vx: vx0 + (Math.random() - .5) * 26, vy: vy0 + G * tau, r: W * (.32 + Math.random() * .16) * (.5 + .5 * emitRate), age: 0 });
            }
          }
          // физика капель/брызг
          const sec = dt * .001;
          for (let i = P.length - 1; i >= 0; i--) {
            const d = P[i]; d.vy += G * sec; d.x += d.vx * sec; d.y += d.vy * sec; d.age += sec;
            if (d.y >= S.y1) {
              if (Q.length < 60) for (let j = 0; j < 2; j++) Q.push({ x: d.x, y: S.y1, vx: (Math.random() - .5) * 260, vy: -(90 + Math.random() * 280), r: .9 + Math.random() * 1.1, life: .26 });
              P.splice(i, 1); continue;
            }
            const sh = 1 - .3 * Math.min(1, d.age / Tf), rr = d.r * sh;
            cx.strokeStyle = color; cx.lineWidth = rr * 2; cx.lineCap = 'round';
            cx.beginPath(); cx.moveTo(d.x - d.vx * .018, d.y - d.vy * .018); cx.lineTo(d.x, d.y); cx.stroke();
            cx.strokeStyle = 'rgba(255,255,255,.32)'; cx.lineWidth = Math.max(.8, rr * .5);
            cx.beginPath(); cx.moveTo(d.x - rr * .35 - d.vx * .014, d.y - d.vy * .014); cx.lineTo(d.x - rr * .35, d.y); cx.stroke();
          }
          if (mode === 'ribbon' && impact) { // капли короны у ленты
            sparkAcc += rate * dt * .09;
            while (sparkAcc >= 1 && Q.length < 60) { sparkAcc -= 1; Q.push({ x: x1 + (Math.random() - .5) * W, y: S.y1, vx: (Math.random() - .5) * 220, vy: -(80 + Math.random() * 240), r: .9 + Math.random() * 1.1, life: .26 }); }
          }
          for (let i = Q.length - 1; i >= 0; i--) {
            const d = Q[i]; d.vy += G * .8 * sec; d.x += d.vx * sec; d.y += d.vy * sec; d.life -= sec;
            if (d.life <= 0 || d.y > S.y1 + 1 || d.x < liqL || d.x > liqRr) { Q.splice(i, 1); continue; }
            cx.globalAlpha = clamp(d.life / .26, 0, 1); cx.fillStyle = light;
            cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 6.2832); cx.fill();
          }
          cx.globalAlpha = 1;
          if (impact) { // «пятка» струи на поверхности
            cx.fillStyle = color; cx.beginPath(); cx.ellipse(x1, S.y1, W * (.5 + .6 * rate), 1.6 + rate, 0, 0, 6.2832); cx.fill();
          }
          if (hitAge > 0) {
            const rp = ripples(t, fill, impact ? rate : 0);
            cx.lineWidth = 1.2; rp.forEach(r => { cx.strokeStyle = light; cx.globalAlpha = r[4]; cx.beginPath(); cx.ellipse(r[0], r[1], r[2], r[3], 0, 0, 6.2832); cx.stroke(); });
            cx.globalAlpha = 1;
          }
        }

        if (t < tEnd) requestAnimationFrame(frame); else finish();
      }

      function finish() {
        // сначала отдаём управление игре (она обновит состояние), потом снимаем временное — в тот же кадр
        resolve();
        queueMicrotask(() => {
          ghosts.forEach(g => g.remove());
          layers.forEach(l => { l.style.transform = ''; l.style.transformOrigin = ''; });
          ss.transform = keep.t; ss.transition = keep.tr; ss.transformOrigin = keep.o; ss.zIndex = keep.z; ss.willChange = keep.w;
          ls.transform = lkeep.t; ls.transformOrigin = lkeep.o; ls.left = lkeep.l; ls.right = lkeep.r;
          if (mode === 'svg') { svg.style.display = 'none'; sPath.setAttribute('d', ''); sHl.setAttribute('d', ''); }
          else { cx.clearRect(0, 0, cv.clientWidth, cv.clientHeight); cv.style.display = 'none'; }
        });
      }
      requestAnimationFrame(frame);
    });
  }

  window.WaterPour = { pour };
})();
