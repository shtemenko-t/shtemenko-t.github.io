/* ============================================================
   ЗВУК ВОДЫ: OfflineAudioContext -> WAV data URI (22050 Гц, моно, 16 бит)
   makeWaterWav(seed, dur) -> Promise<string|null>
   ============================================================ */
(() => {
  'use strict';
  const SR = 22050;

  function rng(seed) {                       // mulberry32: одинаковый seed -> одинаковый звук
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // розовый шум (фильтр Пола Келлета): мягкий спад -3 дБ/окт — основа «шума воды», без шипения белого
  function pinkBuffer(ctx, len, rand) {
    const buf = ctx.createBuffer(1, len, SR), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rand() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .96900 * b2 + w * .1538520;
      b3 = .86650 * b3 + w * .3104856; b4 = .55000 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    }
    return buf;
  }

  function wavURI(f32) {                      // Float32 -> 16 бит PCM WAV -> data URI
    const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const S = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    S(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); S(8, 'WAVE'); S(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    S(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
    const u = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function makeWaterWav(seed, dur) {
    dur = dur || .5; seed = seed || 1;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve(null);
    const len = Math.round(SR * dur), rand = rng(seed);
    let ctx;
    try { ctx = new OAC(1, len, SR); } catch (e) { return Promise.resolve(null); }

    /* ---- огибающая расхода воды: подъём 50 мс -> плато с «дыханием» -> спад 150 мс ---- */
    const flow = ctx.createGain();
    flow.gain.setValueAtTime(0, 0);
    flow.gain.linearRampToValueAtTime(1, .05);
    flow.gain.setValueAtTime(1, .05);
    for (let t = .05; t < dur - .17; t += .045) flow.gain.linearRampToValueAtTime(.78 + rand() * .22, t + .045);  // неровность потока
    flow.gain.linearRampToValueAtTime(.55, dur - .15);
    flow.gain.linearRampToValueAtTime(0, dur - .005);

    /* ---- master: срез выше 3.6 кГц (никакого «звона»), мягкий нижний срез 70 Гц ---- */
    const master = ctx.createGain(); master.gain.value = .9;
    const mLP = ctx.createBiquadFilter(); mLP.type = 'lowpass'; mLP.frequency.value = 3600; mLP.Q.value = .5;
    const mHP = ctx.createBiquadFilter(); mHP.type = 'highpass'; mHP.frequency.value = 70; mHP.Q.value = .5;
    flow.connect(mHP); mHP.connect(mLP); mLP.connect(master); master.connect(ctx.destination);

    const noise = ctx.createBufferSource(); noise.buffer = pinkBuffer(ctx, len, rand);

    /* ---- 1. «тело» струи: полоса 380–720 Гц, Q 0.9 (широкая — это шум, а не тон) ---- */
    const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 520; body.Q.value = .9;
    const bodyG = ctx.createGain(); bodyG.gain.value = 1.0;
    // журчание: центр полосы качается 11 и 17 Гц (несоизмеримые частоты -> не слышно периодичности)
    const lfo1 = ctx.createOscillator(); lfo1.frequency.value = 11 + rand() * 2; const l1g = ctx.createGain(); l1g.gain.value = 140;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 17 + rand() * 3; const l2g = ctx.createGain(); l2g.gain.value = 90;
    lfo1.connect(l1g); l1g.connect(body.frequency); lfo2.connect(l2g); l2g.connect(body.frequency);
    // амплитудная пульсация 7 Гц, глубина 25 % — «бульканье» потока
    const am = ctx.createGain(); am.gain.value = .75;
    const lfo3 = ctx.createOscillator(); lfo3.frequency.value = 7 + rand() * 1.5; const l3g = ctx.createGain(); l3g.gain.value = .25;
    lfo3.connect(l3g); l3g.connect(am.gain);
    noise.connect(body); body.connect(am); am.connect(bodyG); bodyG.connect(flow);

    /* ---- 2. «плеск»: полоса 1200 Гц, Q 0.6, тихо; быстрее пульсирует (23 Гц) ---- */
    const splash = ctx.createBiquadFilter(); splash.type = 'bandpass'; splash.frequency.value = 1200; splash.Q.value = .6;
    const spG = ctx.createGain(); spG.gain.value = .28;
    const lfo4 = ctx.createOscillator(); lfo4.frequency.value = 23 + rand() * 4; const l4g = ctx.createGain(); l4g.gain.value = .18;
    lfo4.connect(l4g); l4g.connect(spG.gain);
    noise.connect(splash); splash.connect(spG); spG.connect(flow);

    /* ---- 3. «низ» — глухой объём воды в колбе: lowpass 260 Гц ---- */
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 260; low.Q.value = .7;
    const lowG = ctx.createGain(); lowG.gain.value = .9;
    noise.connect(low); low.connect(lowG); lowG.connect(flow);

    /* ---- 4. пузырьки: синус 300–1100 Гц с ростом частоты на 40–70 % за 40–80 мс, экспоненциальный спад ---- */
    const nB = 11 + Math.floor(rand() * 4);
    for (let i = 0; i < nB; i++) {
      const t0 = .04 + rand() * (dur - .2), f0 = 300 + rand() * rand() * 800;      // больше низких, мало высоких
      const bl = .04 + rand() * .045, amp = .05 + rand() * .09 * (f0 < 600 ? 1 : .6);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * (1.4 + rand() * .3), t0 + bl);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + .004);
      g.gain.exponentialRampToValueAtTime(.0005, t0 + bl + .02);
      o.connect(g); g.connect(flow); o.start(t0); o.stop(t0 + bl + .03);
    }

    [noise, lfo1, lfo2, lfo3, lfo4].forEach(n => n.start(0));

    /* ---- рендер (Safari: старый webkit-вариант только с колбэком) ---- */
    const render = new Promise((res, rej) => {
      try {
        const p = ctx.startRendering(res);
        if (p && p.then) p.then(res, rej);
      } catch (e) { rej(e); }
    });
    return render.then(buf => {
      const d = new Float32Array(buf.getChannelData(0));
      let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      const k = pk > 0 ? .8 / pk : 1;                       // нормализация до -2 дБFS
      const fi = 110, fo = 330;                              // fade 5 мс / 15 мс против щелчков
      for (let i = 0; i < d.length; i++) {
        let s = d[i] * k; if (i < fi) s *= i / fi; if (i > d.length - fo) s *= (d.length - i) / fo; d[i] = s;
      }
      return wavURI(d);
    }).catch(() => null);
  }

  /* ---- пул из 3 вариантов + проигрывание ---- */
  /* ============================================================
     БУЛЬКАНЬЕ (версия 14), по разбору референса:
     • «буль» — низкий гудящий тон 115–140 Гц с дрожанием ~34 Гц, призвук
       около 800 Гц (узкая полоса шума + тихий синус) и щелчок в начале,
       длина 0.13–0.17 с;
     • под ним — россыпь мелких пузырьков 600–1050 Гц (короткие синусы
       по 6–14 мс с подъёмом частоты) и мягкий шум с центром 800 Гц.
     ============================================================ */
  function makeGlugWav(seed, dur) {
    dur = dur || .6; seed = seed || 1;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve(null);
    const len = Math.round(SR * dur), rand = rng(seed);
    let ctx;
    try { ctx = new OAC(1, len, SR); } catch (e) { return Promise.resolve(null); }

    const master = ctx.createGain(); master.gain.value = .9;
    const mLP = ctx.createBiquadFilter(); mLP.type = 'lowpass'; mLP.frequency.value = 4200; mLP.Q.value = .5;
    const mHP = ctx.createBiquadFilter(); mHP.type = 'highpass'; mHP.frequency.value = 45; mHP.Q.value = .5;
    mHP.connect(mLP); mLP.connect(master); master.connect(ctx.destination);

    /* все усилители стартуют с нуля: иначе до своего момента они пропускают шум */
    const zeroGain = () => { const g = ctx.createGain(); g.gain.value = 0; return g; };
    const noise = ctx.createBufferSource(); noise.buffer = pinkBuffer(ctx, len, rand);
    const sources = [noise];

    function env(g, t, a, peak, hold, tail) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.linearRampToValueAtTime(peak * .8, t + hold);
      g.gain.exponentialRampToValueAtTime(.0008, t + hold + tail);
    }

    function bul(t, f0, L, amp) {
      // щелчок
      const ck = ctx.createBiquadFilter(); ck.type = 'bandpass'; ck.frequency.value = 1800; ck.Q.value = .7;
      const ckG = zeroGain();
      ckG.gain.setValueAtTime(0, t); ckG.gain.linearRampToValueAtTime(amp * 1.4, t + .002);
      ckG.gain.exponentialRampToValueAtTime(.0008, t + .014);
      noise.connect(ck); ck.connect(ckG); ckG.connect(mHP);
      // низкий гул с дрожанием
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0 * .92, t); o.frequency.linearRampToValueAtTime(f0, t + .03);
      o.frequency.linearRampToValueAtTime(f0 * 1.06, t + L);
      const vib = ctx.createOscillator(); vib.frequency.value = 32 + rand() * 6;
      const vibG = zeroGain(); vibG.gain.value = f0 * .07;
      vib.connect(vibG); vibG.connect(o.frequency);
      const g = zeroGain(); env(g, t, .012, amp, L * .7, L * .3 + .04);
      o.connect(g); g.connect(mHP);
      o.start(t); o.stop(t + L + .06); vib.start(t); vib.stop(t + L + .06);
      sources.push(o, vib);
      // призвук около 800 Гц
      const fr = 770 + rand() * 70;
      const o2 = ctx.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(fr, t); o2.frequency.linearRampToValueAtTime(fr * 1.03, t + L);
      const g2 = zeroGain(); env(g2, t, .015, amp * .16, L * .7, L * .3 + .03);
      o2.connect(g2); g2.connect(mHP); o2.start(t); o2.stop(t + L + .05); sources.push(o2);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 7;
      const gn = zeroGain(); env(gn, t, .01, amp * 1.6, L * .7, L * .3 + .03);
      noise.connect(bp); bp.connect(gn); gn.connect(mHP);
    }

    function trickle(t0, t1, density, amp) {
      const T = t1 - t0, n = Math.round(T * density);
      for (let i = 0; i < n; i++) {
        const t = t0 + T * rand(), u = (t - t0) / T;
        const w = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), .7);
        const f = 800 + (rand() + rand() - 1) * 260;
        const d = .006 + rand() * .008;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.15 + rand() * .2), t + d);
        const g = zeroGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * w * (.35 + .65 * rand()), t + .001);
        g.gain.exponentialRampToValueAtTime(.0008, t + d);
        o.connect(g); g.connect(mHP); o.start(t); o.stop(t + d + .005); sources.push(o);
      }
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 820; bp.Q.value = 1.3;
      const g = zeroGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp * 1.1, t0 + .07);
      g.gain.linearRampToValueAtTime(amp * .8, t1 - .12); g.gain.linearRampToValueAtTime(0, t1);
      noise.connect(bp); bp.connect(g); g.connect(mHP);
    }

    bul(.01, 118 + rand() * 18, .16, .85);
    trickle(.09, dur - .02, 170, .32);
    if (dur > .58) bul(dur * .52, 126 + rand() * 18, .13, .5);

    noise.start(0);
    return renderWav(ctx);
  }

  function renderWav(ctx) {
    const render = new Promise((res, rej) => {
      try {
        const p = ctx.startRendering(res);
        if (p && p.then) p.then(res, rej);
      } catch (e) { rej(e); }
    });
    return render.then(buf => {
      const d = new Float32Array(buf.getChannelData(0));
      let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      const k = pk > 0 ? .8 / pk : 1;
      const fi = 110, fo = 330;
      for (let i = 0; i < d.length; i++) {
        let v = d[i] * k; if (i < fi) v *= i / fi; if (i > d.length - fo) v *= (d.length - i) / fo; d[i] = v;
      }
      return wavURI(d);
    }).catch(() => null);
  }

  /* ---- пулы вариантов + проигрывание ---- */
  const pool = []; let idx = 0, ready = false;
  const glugs = [];   // [короткий, средний, длинный] — по числу переливаемых слоёв
  function initWaterSound() {
    if (ready) return Promise.resolve(); ready = true;
    const water = Promise.all([11, 29, 47].map((sd, i) => makeWaterWav(sd, .46 + i * .04))).then(uris => {
      uris.forEach(u => { if (u) { const a = new Audio(u); a.preload = 'auto'; pool.push(a); } });
    });
    const glug = Promise.all([[7, .5], [19, .62], [31, .76]].map(v => makeGlugWav(v[0], v[1]))).then(uris => {
      if (uris.every(Boolean)) uris.forEach(u => { const a = new Audio(u); a.preload = 'auto'; glugs.push([a, new Audio(u)]); });
    });
    return Promise.all([water, glug]);
  }
  function playWater(vol) {
    if (!pool.length) return;
    const a = pool[idx++ % pool.length];
    try { a.currentTime = 0; a.volume = vol == null ? .7 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  let gIdx = 0;
  function playGlug(vol, count) {
    if (!glugs.length) return;
    const pair = glugs[Math.max(0, Math.min(glugs.length - 1, (count || 1) - 1))];
    const a = pair[gIdx++ % 2];
    try { a.currentTime = 0; a.volume = vol == null ? .8 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }

  window.makeWaterWav = makeWaterWav; window.makeGlugWav = makeGlugWav;
  window.initWaterSound = initWaterSound; window.playWater = playWater; window.playGlug = playGlug;
  window.waterSoundCount = () => pool.length;
  window.glugSoundCount = () => glugs.length;
})();
