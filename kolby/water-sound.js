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
  const pool = []; let idx = 0, ready = false;
  function initWaterSound() {
    if (ready) return Promise.resolve(); ready = true;
    return Promise.all([11, 29, 47].map((sd, i) => makeWaterWav(sd, .46 + i * .04))).then(uris => {
      uris.forEach(u => { if (u) { const a = new Audio(u); a.preload = 'auto'; pool.push(a); } });
    });
  }
  function playWater(vol) {
    if (!pool.length) return;
    const a = pool[idx++ % pool.length];
    try { a.currentTime = 0; a.volume = vol == null ? .7 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }

  window.makeWaterWav = makeWaterWav; window.initWaterSound = initWaterSound; window.playWater = playWater;
  window.waterSoundCount = () => pool.length;
})();
