(() => {
  'use strict';

  // ---------- Хранилище ----------
  const KEY = 'sovet3-v1';
  const blank = () => ({ start: null, done: {}, ev: {}, train: {}, read: {}, preview: null, introSeen: false, names: {}, crest: null, host: false, unlock: false });
  let st = blank();
  try { st = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // ---------- Даты ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const realToday = () => iso(new Date());
  const today = () => (st.preview && st.start) ? addDays(st.start, st.preview.idx) : realToday();
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const human = s => { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  // защита от опечатки в годе: старт не раньше 60 дней назад и не позже 180 дней вперёд
  const startOk = s => { const n = diff(realToday(), s); return n >= -60 && n <= 180; };
  // дата старта из ссылки ведущей: ?start=2026-11-02
  try {
    const p = new URLSearchParams(location.search).get('start');
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p) && !st.start && startOk(p)) { st.start = p; save(); }
  } catch (e) {}
  // режим ведущей: ?host=1 в ссылке (или 5 нажатий на заголовок «Настройки»)
  try { if (new URLSearchParams(location.search).get('host') === '1' && !st.host) { st.host = true; save(); } } catch (e) {}
  const badStartMsg = s => 'Проверь дату: ' + human(s) + ' ' + s.slice(0, 4) + ' года. Похоже на опечатку в годе — сезон должен стартовать в ближайшие месяцы';

  // Положение в сезоне
  function pos() {
    if (!st.start) return { phase: 0, idx: -1 };
    const idx = diff(st.start, today());
    if (idx < 0) return { phase: 0, idx };
    if (idx >= 28) return { phase: 5, idx };
    return { phase: Math.floor(idx / 7) + 1, idx, week: Math.floor(idx / 7) + 1, day: idx % 7 + 1 };
  }
  const dateOf = (w, d) => addDays(st.start, (w - 1) * 7 + (d - 1));
  const tid = (w, d) => w + '-' + d;

  // ---------- Подсчёты ----------
  function gems() {
    const g = { c: 0, j: 0, k: 0 };
    WEEKS.forEach(W => W.days.forEach((D, i) => { if (st.done[tid(W.n, i + 1)]) g[D.g]++; }));
    Object.values(st.ev).forEach(e => { if (e && e.done) g.c++; });
    g.c += Object.keys(st.train).filter(k => st.train[k]).length;
    g.c += Object.keys(st.read).filter(k => st.read[k]).length;
    return g;
  }

  // Серия: дни 2–6 каждой недели, отмеченные в свой день. Раз в неделю пропуск прощается
  function streak() {
    if (!st.start) return 0;
    const t = today();
    let s = 0;
    for (let w = 1; w <= 4; w++) {
      let freeze = 1;
      for (let d = 2; d <= 6; d++) {
        const date = dateOf(w, d);
        if (date > t) return s;
        const r = st.done[tid(w, d)];
        const ontime = r && r.at === date;
        if (ontime) s++;
        else if (date === t) return s; // сегодня ещё можно успеть
        else if (freeze > 0) freeze--;
        else s = 0;
      }
    }
    return s;
  }

  // ---------- Утилиты ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GEM_COL = { c: ['#9fc0ff', '#4a7bff', '#1f3fa8'], j: ['#ffe39a', '#f2b632', '#a8700f'], k: ['#9ff0cf', '#2fbf86', '#147553'] };
  const gemSvg = (k, extra = '') => {
    const [a, b, c] = GEM_COL[k];
    return `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true"><path d="M7 3h10l5 6-10 12L2 9z" fill="${b}"/><path d="M2 9h20L12 21z" fill="${c}"/><path d="M7 3l2 6h6l2-6z" fill="${a}"/><path d="M7 3h10l5 6-10 12L2 9z" fill="none" stroke="#f0d78c" stroke-width=".8"/><path d="M2 9h20M9 9l3 12 3-12M7 3l2 6M17 3l-2 6" stroke="#f0d78c" stroke-width=".5" fill="none" opacity=".7"/></svg>`;
  };
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>',
    sword: '<svg viewBox="0 0 24 24" fill="none" stroke="#9fc0ff" stroke-width="1.6" stroke-linecap="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="#9fc0ff" stroke-width="1.6" stroke-linejoin="round"><path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z"/></svg>',
    star: '<svg viewBox="0 0 48 48" fill="none" stroke="#d8b45a" stroke-width="1.5"><circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="14" opacity=".6"/><path d="M24 8l3.5 11.5L39 24l-11.5 3.5L24 39l-3.5-11.5L9 24l11.5-4.5z" fill="rgba(216,180,90,.25)"/></svg>'
  };
  function toast(k, title, sub) {
    const t = $('#toast');
    t.innerHTML = gemSvg(k) + `<div><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2600);
  }
  const heroState = (id, phase) => HERO_STATE[id][phase];
  const heroImg = (id, s) => `img/${id}-${s}.webp`;
  // имя героя: своё, если участница его дала, иначе роль
  const heroLabel = (H, s) => (st.names && st.names[H.id]) || H.names[s - 1];
  const plateCls = t => t.length > 16 ? ' xs' : t.length > 12 ? ' sm' : '';

  // ---------- Герб ----------
  const CREST_COLORS = [
    { n: 'Сапфир', f: '#2f56c9', d: '#1a3184' },
    { n: 'Аметист', f: '#6a46c4', d: '#3e2585' },
    { n: 'Гранат', f: '#a3304a', d: '#651a2c' },
    { n: 'Изумруд', f: '#1f8f66', d: '#0f5a3f' },
    { n: 'Янтарь', f: '#c98a1c', d: '#7f530a' },
    { n: 'Бирюза', f: '#1e8a9a', d: '#0f5560' }
  ];
  const G = 'fill="#f0d78c"';
  const CREST_SYMBOLS = [
    { n: 'Звезда', s: `<path ${G} d="M12 2l2.6 6.9L22 9.3l-5.8 4.6 2 7.1L12 17l-6.2 4 2-7.1L2 9.3l7.4-.4z"/>` },
    { n: 'Луна', s: `<path ${G} d="M15 2.5a9.5 9.5 0 1 0 6.5 16.4A8 8 0 0 1 15 2.5z"/>` },
    { n: 'Солнце', s: `<circle cx="12" cy="12" r="4.6" ${G}/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M4.6 19.4l2.8-2.8M16.6 7.4l2.8-2.8" stroke="#f0d78c" stroke-width="2" stroke-linecap="round"/>` },
    { n: 'Ключ', s: `<circle cx="8" cy="8" r="5" fill="none" stroke="#f0d78c" stroke-width="2.6"/><path d="M11.5 11.5L21 21M17 17l2.6-2.6M19.5 19.5l2-2" stroke="#f0d78c" stroke-width="2.6" stroke-linecap="round"/>` },
    { n: 'Роза', s: `<g ${G}><circle cx="12" cy="5.5" r="4"/><circle cx="18.2" cy="10" r="4"/><circle cx="15.8" cy="17.3" r="4"/><circle cx="8.2" cy="17.3" r="4"/><circle cx="5.8" cy="10" r="4"/></g><circle cx="12" cy="12" r="3" fill="#a8700f"/>` },
    { n: 'Пламя', s: `<path ${G} d="M12 1.5c1.2 4.5 7 6.5 7 13a7 7 0 0 1-14 0c0-3.4 2.2-5.6 3.4-7.8.2 2.3 1.3 3.6 2.4 3.6 0-3.3-.2-5.6 1.2-8.8z"/>` }
  ];
  function crestSvg(c, size) {
    const w = size || 40;
    if (!c) return `<svg viewBox="0 0 24 26" width="${w}" height="${w * 26 / 24}" aria-hidden="true"><path d="M12 1.5l9.5 3.4v6.6c0 6.2-4 10.6-9.5 13-5.5-2.4-9.5-6.8-9.5-13V4.9z" fill="none" stroke="#d8b45a" stroke-width="1.2" stroke-dasharray="2.2 1.8"/><path d="M12 9v7M8.5 12.5h7" stroke="#f0d78c" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    const col = CREST_COLORS[c.col] || CREST_COLORS[0], sym = CREST_SYMBOLS[c.sym] || CREST_SYMBOLS[0];
    return `<svg viewBox="0 0 24 26" width="${w}" height="${w * 26 / 24}" aria-hidden="true">
      <defs><linearGradient id="cg${c.col}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col.f}"/><stop offset="1" stop-color="${col.d}"/></linearGradient></defs>
      <path d="M12 1.5l9.5 3.4v6.6c0 6.2-4 10.6-9.5 13-5.5-2.4-9.5-6.8-9.5-13V4.9z" fill="url(#cg${c.col})" stroke="#d8b45a" stroke-width="1.2"/>
      <path d="M12 3.3l7.8 2.8v5.4c0 5.1-3.3 8.8-7.8 10.8" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".6"/>
      <g transform="translate(6.6 6.4) scale(.45)">${sym.s}</g></svg>`;
  }

  // ---------- Навигация ----------
  let tab = 'map';
  let selDay = null; // выбранный день на экране квеста {w,d}
  function go(t) {
    tab = t;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + t));
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    render();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

  function render() {
    const P = pos();
    // точка на «Квесте», если сегодняшний не сделан
    const qi = document.querySelector('.q-ico');
    qi.classList.toggle('dot', !!(P.week && !st.done[tid(P.week, P.day)]));
    ({ map: renderMap, quest: renderQuest, squad: renderSquad, chron: renderChron })[tab](P);
  }

  const unlocked = () => !!(st.host && st.unlock && st.start);
  const previewBar = () => {
    const parts = [];
    if (st.preview) parts.push('предпросмотр: ' + st.preview.label);
    if (unlocked()) parts.push('все задания открыты');
    if (!parts.length) return '';
    const t = parts.join(', ');
    return `<div class="preview"><span>Режим ведущей: ${esc(t)}. Отметки сохраняются как настоящие</span><button data-act="preview-off">Выйти</button></div>`;
  };

  function gemRow() {
    const g = gems();
    const s = streak();
    return `<div class="gems">
      <span class="gem" title="Сапфиры — Ясность">${gemSvg('c')}${g.c}</span>
      <span class="gem" title="Цитрины — Радость">${gemSvg('j')}${g.j}</span>
      <span class="gem" title="Изумруды — Забота">${gemSvg('k')}${g.k}</span>
      ${st.start ? `<span class="streak">Серия ${s}</span>` : ''}
    </div>`;
  }

  function eyebrow(P) {
    if (P.phase === 0) return st.start ? 'Сезон начнётся ' + human(st.start) : 'Сезон ещё не начался';
    if (P.phase === 5) return 'Сезон пройден';
    return 'Неделя ' + P.week + ' · день ' + P.day;
  }

  // ---------- Замок ----------
  const ZONES = [
    { id: 'child', l: 7, t: 8, w: 18, h: 34 },
    { id: 'adult', l: 11, t: 39, w: 46, h: 23 },
    { id: 'overseer', l: 66, t: 34, w: 26, h: 44 },
    { id: 'parent', l: 4, t: 64, w: 60, h: 30 }
  ];
  function renderMap(P) {
    const m = MAP_STATE[P.phase];
    const title = P.phase === 0 ? 'Захваченный замок' : P.phase === 5 ? 'Совет снова у власти' : WEEKS[P.week - 1].title;
    let cta = '';
    if (P.week) {
      const D = WEEKS[P.week - 1].days[P.day - 1];
      const done = st.done[tid(P.week, P.day)];
      cta = `<div class="card glow">
        <div class="eyebrow">Квест дня${D.meet ? ' · встреча в Zoom' : ''}</div>
        <div class="task" style="font-size:18px;margin-bottom:12px">${esc(D.t)}</div>
        ${done ? `<div class="done-line">${ICON.check}Выполнен. Камень уже в сокровищнице</div>` : `<button class="btn" data-act="tab" data-v="quest">Открыть квест</button>`}
      </div>`;
    } else if (P.phase === 0) {
      cta = `<div class="card"><div class="eyebrow">Пролог</div><p>Власть в замке захватил Надзиратель. Взрослый спит в библиотеке, Ребёнок заперт в башне, а Заботливый Родитель давно забыт и стал призраком. За четыре недели мы вернём Совет к управлению</p>
      ${st.start ? `<p class="muted small" style="margin-top:10px">Первая глава откроется ${esc(human(st.start))}. Пока можно познакомиться с отрядом, дать героям имена и выбрать герб замка</p>` : ''}
      <button class="btn wide ghost" data-act="tab" data-v="squad">Познакомиться с отрядом</button>
      ${st.crest ? '' : '<button class="btn wide ghost" data-act="crest">Выбрать герб замка</button>'}</div>`;
    } else {
      cta = `<div class="card glow"><div class="eyebrow">Финал</div><p>Замок встречает рассвет. Надзиратель стал Хранителем, Взрослый ведёт Совет, Ребёнок свободен, а сад Заботливого Родителя цветёт</p><button class="btn wide ghost" data-act="tab" data-v="chron">Открыть хронику сезона</button></div>`;
    }
    $('#s-map').innerHTML = previewBar() + `
      <div class="top"><button class="crest-btn${st.crest ? '' : ' empty'}" data-act="crest" aria-label="${st.crest ? 'Герб замка' : 'Выбрать герб замка'}">${crestSvg(st.crest, 40)}</button>
      <div style="flex:1;min-width:0"><div class="eyebrow">${esc(eyebrow(P))}</div><h1>${esc(title)}</h1>${st.crest && st.crest.name ? `<div class="castle-name">${esc(st.crest.name)}</div>` : ''}</div>
      <button class="icon-btn" data-act="settings" aria-label="Настройки">${ICON.gear}</button></div>
      ${gemRow()}
      <div class="frame"><div class="in"><div class="map">
        <img src="img/map-${m}.webp" alt="Карта замка: ${esc(MAP_LINES[m])}">
        ${ZONES.map(z => {
          const H = HEROES.find(h => h.id === z.id);
          return `<button class="hot" style="left:${z.l}%;top:${z.t}%;width:${z.w}%;height:${z.h}%" data-act="hero" data-v="${z.id}" aria-label="${esc(H.zone)}: ${esc(H.names[heroState(z.id, P.phase) - 1])}"><span class="tag">${esc(H.zone)}</span></button>`;
        }).join('')}
      </div></div></div>
      <p class="map-cap">${esc(MAP_LINES[m])}</p>
      ${cta}`;
  }

  // ---------- Квест ----------
  function renderQuest(P) {
    const el = $('#s-quest');
    const U = unlocked();
    if (!P.week && P.phase === 0 && !U) {
      el.innerHTML = previewBar() + `<div class="top"><div><div class="eyebrow">${esc(eyebrow(P))}</div><h1>Квесты</h1></div></div>
        <div class="card"><p>Каждый день недели открывается новый квест на 5–10 минут. В первый день недели встречаемся в Zoom и открываем главу</p>
        ${st.start ? `<p class="muted small" style="margin-top:10px">До старта ${diff(today(), st.start)} ${plural(diff(today(), st.start), 'день', 'дня', 'дней')}</p>` : `<button class="btn wide" data-act="settings">Указать дату старта</button>`}</div>`;
      return;
    }
    // какую неделю показываем
    const curW = U ? 4 : (P.week || 4);
    if (!selDay || selDay.w > curW) selDay = P.week ? { w: P.week, d: P.day } : U && P.phase === 0 ? { w: 1, d: 1 } : { w: 4, d: 7 };
    const W = WEEKS[selDay.w - 1];
    const maxDayIdx = U ? 27 : P.week ? P.idx : 27;

    const weekTabs = WEEKS.filter(x => x.n <= curW).map(x =>
      `<button class="check wk ${x.n === selDay.w ? 'on' : ''}" data-act="week" data-v="${x.n}">Неделя ${x.n}</button>`).join(' ');

    const days = W.days.map((D, i) => {
      const d = i + 1, idx = (W.n - 1) * 7 + i, lock = idx > maxDayIdx;
      const cls = ['day', st.done[tid(W.n, d)] ? 'done' : '', (P.week === W.n && P.day === d) ? 'today' : '', (selDay.d === d) ? 'sel' : '', lock ? 'lock' : '', D.meet ? 'z' : ''].join(' ');
      return `<button class="${cls}" data-act="day" data-v="${d}" ${lock ? 'disabled' : ''} aria-label="День ${d}">${d}</button>`;
    }).join('');
    const lbl = W.days.map((D, i) => `<span>${esc(WD[parse(dateOf(W.n, i + 1)).getDay()])}</span>`).join('');

    const D = W.days[selDay.d - 1];
    const id = tid(W.n, selDay.d);
    const rec = st.done[id];
    const date = dateOf(W.n, selDay.d);
    const isToday = date === today();
    const late = date < today() && !rec;

    const taskCard = `<div class="card glow">
      <div>${D.meet ? '<span class="chip zoom">Встреча в Zoom</span>' : ''}${D.sum ? '<span class="chip">Итог недели · бонус</span>' : ''}<span class="chip">${gemSvg(D.g, 'width="14" height="14"')} ${esc(GEMS[D.g].name)}</span></div>
      <div class="eyebrow">${isToday ? 'Сегодня' : esc(human(date))} · день ${selDay.d}</div>
      ${D.meet ? '<p class="muted small" style="margin-bottom:6px">Домашнее задание после встречи</p>' : ''}
      <div class="task">${esc(D.t)}</div>
      ${W.n === 1 && selDay.d === 1 ? `<p class="muted small" style="margin:-6px 0 12px">Можно дать героям свои имена: <button class="link" data-act="tab" data-v="squad">открыть отряд</button></p>` : ''}
      ${rec && !editing[id] ? `
        ${rec.text ? `<div class="answer">${esc(rec.text)}</div>` : ''}
        <div class="done-line">${ICON.check}Выполнен${rec.at !== date ? ' позже, без серии' : ''}</div>
        <button class="link" style="margin-top:12px" data-act="edit" data-v="${id}">Изменить запись</button>`
      : `
        <textarea id="ans" placeholder="${esc(D.write)}" aria-label="Запись">${esc(rec ? rec.text : '')}</textarea>
        <p class="muted small" style="margin-top:6px">Запись видишь только ты. Можно оставить пустой, если квест про действие</p>
        ${late && !D.sum && selDay.d >= 2 ? '<p class="muted small" style="margin-top:4px">Этот день уже прошёл: квест можно выполнить, камень будет, но серию он не продлит</p>' : ''}
        <button class="btn wide" data-act="done" data-v="${id}">${rec ? 'Сохранить' : 'Выполнено'}</button>`}
    </div>`;

    // карта события: день 4 и позже
    let ev = '';
    const evDate = dateOf(W.n, 4);
    if (evDate <= today() || U) {
      const e = st.ev[W.n];
      if (!e) {
        ev = `<div class="evcard"><div class="flip"><button class="face front" data-act="draw" data-v="${W.n}">${ICON.star}<b style="font:600 17px/1.2 var(--display)">Карта события</b><span class="muted small">Нажми, чтобы вытянуть</span></button></div></div>`;
      } else {
        ev = `<div class="evcard open"><div class="flip"><div class="face front"></div><div class="face back card">
          <div class="eyebrow">Карта события · недели ${W.n}</div>
          <div class="task">${esc(EVENTS[e.card])}</div>
          ${e.done && !editing['ev' + W.n] ? `${e.text ? `<div class="answer">${esc(e.text)}</div>` : ''}<div class="done-line">${ICON.check}Разобрано. Самые интересные карты обсудим на встрече</div><button class="link" style="margin-top:12px" data-act="edit" data-v="ev${W.n}">Изменить запись</button>`
          : `<p class="muted small" style="margin-bottom:10px">Кто в тебе включился бы первым? Как ответил бы Взрослый?</p>
            <textarea id="evans" placeholder="Первым включился бы… Взрослый ответил бы…">${esc(e.text || '')}</textarea>
            <button class="btn wide" data-act="evdone" data-v="${W.n}">Готово</button>`}
        </div></div></div>`;
      }
    }

    // бонусы
    const trainOn = !!st.train[date];
    const readOn = !!st.read[W.n];
    const bonus = `<div class="card">
      <div class="eyebrow">Бонусы недели</div>
      <div class="bonus"><div class="b-ico">${ICON.sword}</div><div class="b-body"><h3>Тренировка</h3>
        <p class="muted small">Тренажёр эго-состояний: ${W.n === 3 ? 'особенно уровень 2, Контролирующий и Заботливый Родитель' : W.n === 1 ? 'уровень 1, три состояния' : 'любой открытый уровень'}. Сапфир за каждый день с тренировкой</p>
        <div class="b-act"><a class="link" href="${TRAINER_URL}" target="_blank" rel="noopener">Открыть тренажёр</a>
        <button class="check ${trainOn ? 'on' : ''}" data-act="train" data-v="${date}">${trainOn ? ICON.check.replace('<svg', '<svg width="14" height="14"') + ' Тренировалась' : 'Отметить'}</button></div></div></div>
      <div class="bonus"><div class="b-ico">${ICON.book}</div><div class="b-body"><h3>Книга правил</h3>
        <p class="muted small">Гайд «Родитель, Взрослый, Ребёнок». ${esc(W.book)}</p>
        <div class="b-act"><button class="check ${readOn ? 'on' : ''}" data-act="read" data-v="${W.n}">${readOn ? ICON.check.replace('<svg', '<svg width="14" height="14"') + ' Прочитала' : 'Отметить'}</button></div></div></div>
    </div>`;

    el.innerHTML = previewBar() + `
      <div class="top"><div><div class="eyebrow">Неделя ${W.n} · ${esc(W.reward)}</div><h1>${esc(W.title)}</h1></div></div>
      ${curW > 1 ? `<div style="display:flex;gap:8px;flex-wrap:nowrap;margin-bottom:12px">${weekTabs}</div>` : ''}
      <details class="card" style="padding:14px 18px"><summary class="link" style="list-style:none;cursor:pointer">О чём эта глава</summary><p style="margin-top:10px">${esc(W.intro)}</p></details>
      <div class="days">${days}</div><div class="day-lbl">${lbl}</div>
      ${taskCard}${ev}${bonus}`;
  }
  const editing = {};
  function plural(n, a, b, c) { n = Math.abs(n) % 100; const m = n % 10; if (n > 10 && n < 20) return c; if (m > 1 && m < 5) return b; if (m === 1) return a; return c; }

  // ---------- Отряд ----------
  function renderSquad(P) {
    $('#s-squad').innerHTML = previewBar() + `
      <div class="top"><div><div class="eyebrow">${esc(eyebrow(P))}</div><h1>Отряд</h1></div></div>
      <p class="muted" style="margin-bottom:16px">Облик персонажей меняется по главам сезона. Нажми на карту, чтобы рассмотреть героя и дать ему своё имя</p>
      <div class="squad">${HEROES.map(H => {
        const s = heroState(H.id, P.phase), L = heroLabel(H, s), own = !!st.names[H.id];
        return `<button class="hero" data-act="hero" data-v="${H.id}">
          <div class="portrait"><img src="${heroImg(H.id, s)}" alt="${esc(H.names[s - 1])}" loading="lazy"><div class="plate${plateCls(L)}">${esc(L)}</div></div>
          ${own ? `<div class="h-role">${esc(H.names[s - 1])}</div>` : ''}<div class="h-line">${esc(H.lines[s - 1])}</div></button>`;
      }).join('')}</div>`;
  }
  function nextChange(id, phase) {
    const arr = HERO_STATE[id], cur = arr[phase];
    for (let p = phase + 1; p < arr.length; p++) if (arr[p] !== cur) return p === 5 ? 'в финале сезона' : 'на неделе ' + p;
    return null;
  }
  function openHero(id) {
    const P = pos(), H = HEROES.find(h => h.id === id), s = heroState(id, P.phase), nx = nextChange(id, P.phase);
    const g = H.gem ? gems()[H.gem] : null;
    const L = heroLabel(H, s), own = st.names[id] || '';
    modal(`<div class="big-portrait"><div class="frame"><div class="in"><div class="portrait" style="border-radius:0"><img src="${heroImg(id, s)}" alt="${esc(H.names[s - 1])}"><div class="plate${plateCls(L)}">${esc(L)}</div></div></div></div></div>
      <div class="eyebrow">${esc(H.zone)}${own ? ' · ' + esc(H.names[s - 1]) : ''}</div><h2 style="margin:4px 0 8px">${esc(L)}</h2>
      <p>${esc(H.lines[s - 1])}</p>
      <div class="card" style="margin:16px 0 0;padding:14px 16px">
        <div class="field" style="margin:0"><label for="h-name">Своё имя для героя</label><input id="h-name" maxlength="24" autocomplete="off" value="${esc(own)}" placeholder="${esc(H.nameHint)}"></div>
        <p class="muted small" style="margin-top:8px">${esc(H.nameWhy)}. Имя появится на табличке портрета</p>
        <div style="display:flex;gap:14px;align-items:center;margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="hero-name" data-v="${id}">Сохранить имя</button>${own ? `<button class="link" data-act="hero-name-clear" data-v="${id}">Убрать имя</button>` : ''}</div>
      </div>
      ${g !== null ? `<p class="gem" style="margin-top:12px">${gemSvg(H.gem)} ${esc(GEMS[H.gem].scale)}: ${g}</p>` : ''}
      ${nx ? `<p class="muted small" style="margin-top:12px">Облик изменится ${esc(nx)}</p>` : `<p class="muted small" style="margin-top:12px">Это финальный облик сезона</p>`}`);
  }

  // ---------- Хроника ----------
  function renderChron(P) {
    const curW = unlocked() ? 4 : P.week || (P.phase === 5 ? 4 : 0);
    let html = '';
    WEEKS.filter(W => W.n <= curW).forEach(W => {
      const items = W.days.map((D, i) => ({ D, r: st.done[tid(W.n, i + 1)] })).filter(x => x.r);
      const e = st.ev[W.n];
      html += `<div class="card chron"><div class="eyebrow">Неделя ${W.n} · ${esc(W.title)}</div><h3>${esc(W.reward)}</h3>
        ${items.length || (e && e.done) ? items.map(x => `<div class="entry"><div class="q">${esc(x.D.t)}</div>${x.r.text ? `<div class="answer">${esc(x.r.text)}</div>` : '<div class="muted small">Выполнено</div>'}</div>`).join('') +
        (e && e.done ? `<div class="entry"><div class="q">Карта события: ${esc(EVENTS[e.card])}</div>${e.text ? `<div class="answer">${esc(e.text)}</div>` : ''}</div>` : '')
        : '<p class="muted small" style="margin-top:8px">Здесь появятся твои записи этой главы</p>'}</div>`;
    });
    const g = gems();
    $('#s-chron').innerHTML = previewBar() + `
      <div class="top"><div><div class="eyebrow">Только для тебя</div><h1>Хроника</h1></div></div>
      <div class="card"><div class="eyebrow">Сокровищница</div>
        ${['c', 'j', 'k'].map(k => `<p class="gem" style="margin:8px 0">${gemSvg(k)} ${g[k]} · ${esc(GEMS[k].scale)} <span class="muted small" style="font-weight:500">(${esc(GEMS[k].who)})</span></p>`).join('')}
        <p class="muted small" style="margin-top:8px">Лучшая серия сейчас: ${streak()}. Итог недели и выходной серию не рвут</p></div>
      ${html || '<p class="empty">Хроника начнётся с первой главой сезона</p>'}`;
  }

  // ---------- Модалки ----------
  function modal(inner) {
    $('#modal-box').innerHTML = `<button class="icon-btn close" data-act="close" aria-label="Закрыть">${ICON.close}</button>` + inner;
    $('#modal').classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('#modal').classList.remove('on'); document.body.style.overflow = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  function openSettings() {
    const opts = ['<option value="">Как в жизни (сегодня)</option>', '<option value="-1">Пролог, до старта</option>'];
    for (let w = 1; w <= 4; w++) for (let d = 1; d <= 7; d++) opts.push(`<option value="${(w - 1) * 7 + d - 1}">Неделя ${w}, день ${d}</option>`);
    opts.push('<option value="28">Финал, после сезона</option>');
    const cur = st.preview ? String(st.preview.idx) : '';
    modal(`<h2 style="margin-bottom:6px;user-select:none;-webkit-user-select:none" data-act="host-tap">Настройки</h2>
      <div class="field"><label for="f-start">Дата старта сезона (первая встреча в Zoom)</label><input type="date" id="f-start" value="${esc(st.start || '')}"></div>
      <button class="btn wide" data-act="save-start">Сохранить дату</button>
      <hr class="sep">
      <h3>Резервная копия</h3>
      <p class="muted small" style="margin:6px 0 10px">Записи хранятся только на этом телефоне. Сохрани файл, если меняешь телефон или чистишь браузер</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" data-act="export">Сохранить файл</button>
      <label class="btn ghost" style="cursor:pointer">Загрузить файл<input type="file" accept="application/json,.json" id="f-import" hidden></label></div>
      ${st.host ? `<hr class="sep">
      <h3>Режим ведущей</h3>
      <p class="muted small" style="margin:6px 0 10px">Участницы этого блока не видят. Отметки, сделанные здесь, сохраняются как настоящие: перед сезоном можно стереть всё кнопкой внизу</p>
      <button class="check ${st.unlock ? 'on' : ''}" data-act="unlock" style="margin-bottom:6px">${st.unlock ? ICON.check.replace('<svg', '<svg width="14" height="14"') + ' Все задания открыты' : 'Открыть все задания'}</button>
      <div class="field"><label for="f-prev">Замок и квесты на любой день сезона</label><select id="f-prev">${opts.join('')}</select></div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn ghost" data-act="overview">Все задания списком</button><button class="link" data-act="host-off">Выключить режим</button></div>` : ''}
      <hr class="sep">
      <p class="muted small">«Совет трёх» — игровой сезон по эго-состояниям. Автор и ведущая — психолог <a href="https://shtemenko-t.github.io/" target="_blank" rel="noopener">Таисия Штеменко</a></p>
      <button class="link" style="margin-top:16px;color:#e7a3a3" data-act="reset">Стереть все записи на этом телефоне</button>`);
    if ($('#f-prev')) { $('#f-prev').value = cur;
    $('#f-prev').addEventListener('change', e => {
      const v = e.target.value;
      if (!st.start && v !== '') { alert('Сначала укажи дату старта'); e.target.value = ''; return; }
      if (v === '') st.preview = null;
      else st.preview = { idx: Number(v), label: e.target.selectedOptions[0].textContent.toLowerCase() };
      selDay = null; save(); closeModal(); render();
    }); }
    $('#f-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { const d = JSON.parse(rd.result); if (!d || typeof d.done !== 'object') throw 0; st = Object.assign(blank(), d); save(); closeModal(); render(); toast('c', 'Копия загружена', 'Все записи на месте'); }
        catch (err) { alert('Не получилось прочитать файл. Это точно копия «Совета трёх»?'); }
      };
      rd.readAsText(f);
    });
  }

  // ---------- Герб: выбор ----------
  let crestDraft = null;
  function openCrest() {
    if (!crestDraft) crestDraft = Object.assign({ col: 0, sym: 0, name: '' }, st.crest || {});
    const c = crestDraft;
    modal(`<div class="eyebrow">Твой замок</div><h2 style="margin:4px 0 14px">Герб замка</h2>
      <div class="crest-big">${crestSvg(c, 96)}</div>
      <div class="field"><label for="c-name">Название замка, по желанию</label><input id="c-name" maxlength="28" autocomplete="off" value="${esc(c.name || '')}" placeholder="Например, Замок Северного ветра"></div>
      <div class="field"><label>Цвет щита</label><div class="swatches">${CREST_COLORS.map((x, i) => `<button class="sw${i === c.col ? ' on' : ''}" style="background:linear-gradient(145deg,${x.f},${x.d})" data-act="crest-col" data-v="${i}" aria-label="${x.n}" aria-pressed="${i === c.col}"></button>`).join('')}</div>
        <p class="muted small" style="margin-top:6px">${esc(CREST_COLORS[c.col].n)}</p></div>
      <div class="field"><label>Символ</label><div class="symbols">${CREST_SYMBOLS.map((x, i) => `<button class="sy${i === c.sym ? ' on' : ''}" data-act="crest-sym" data-v="${i}" aria-pressed="${i === c.sym}"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${x.s}</svg><span>${x.n}</span></button>`).join('')}</div></div>
      <button class="btn wide" data-act="crest-save">Поднять герб</button>`);
  }

  // ---------- Обзор сезона для ведущей ----------
  function openOverview() {
    const gm = k => GEMS[k].name.toLowerCase();
    modal(`<div class="eyebrow">Режим ведущей</div><h2 style="margin:4px 0 14px">Все задания сезона</h2>
      ${WEEKS.map(W => `<div class="card ov"><div class="eyebrow">Неделя ${W.n} · награда: ${esc(W.reward)}</div><h3>${esc(W.title)}</h3>
        <p class="muted small" style="margin:6px 0 10px">${esc(W.intro)}</p>
        <ol>${W.days.map(D => `<li>${esc(D.t)}<span class="muted small"> — ${gm(D.g)}${D.meet ? ', встреча в Zoom' : ''}${D.sum ? ', итог недели' : ''}${D.event ? ', открывается карта события' : ''}</span></li>`).join('')}</ol>
        <p class="muted small" style="margin-top:10px">Книга правил: ${esc(W.book)}</p></div>`).join('')}
      <div class="card ov"><div class="eyebrow">Карты событий</div><p class="muted small" style="margin:6px 0 8px">Одна на неделю, с 4-го дня, без повторов</p><ol>${EVENTS.map(e => `<li>${esc(e)}</li>`).join('')}</ol></div>
      <div class="card ov"><div class="eyebrow">Отряд по главам</div>${HEROES.map(H => `<h3 style="margin-top:10px">${esc(H.zone)}</h3><ol>${H.names.map((n, i) => `<li><b>${esc(n)}</b>: ${esc(H.lines[i])}<span class="muted small"> — ${esc(stateWhen(H.id, i + 1))}</span></li>`).join('')}</ol>`).join('')}</div>
      <div class="card ov"><div class="eyebrow">Награды</div><p class="muted small" style="margin-top:6px">Квест дня — камень своего цвета: сапфир (Взрослый), цитрин (Ребёнок), изумруд (Заботливый Родитель). Карта события, тренировка в тренажёре и глава книги правил — по сапфиру. Серия считает дни 2–6, отмеченные в свой день, один пропуск в неделю прощается</p></div>`);
  }
  function stateWhen(id, s) {
    const arr = HERO_STATE[id], p = arr.indexOf(s);
    return p === 0 ? 'с пролога' : p === 5 ? 'в финале' : 'с недели ' + p;
  }

  // ---------- Онбординг ----------
  function showIntro() {
    const el = $('#intro');
    el.hidden = false;
    el.innerHTML = `<div class="bgimg" style="background-image:url(img/map-0.webp)"></div><div class="content">
      <div class="eyebrow">Игровой сезон · 4 недели</div>
      <h1>Совет трёх</h1>
      <p>Внутри тебя есть замок, которым должен управлять Совет трёх: Родитель, Взрослый и Ребёнок</p>
      <p>Но власть захватил Надзиратель. Взрослый уснул в библиотеке, Ребёнок заперт в башне, а Заботливый Родитель давно забыт и превратился в призрака</p>
      <p>За четыре недели мы вернём Совет к управлению. Каждый день — короткий квест, раз в неделю — встреча в Zoom</p>
      <div class="card" style="margin-top:20px">
        <div class="field" style="margin-top:0"><label for="i-start">Дата старта твоего сезона</label><input type="date" id="i-start" value="${esc(st.start || '')}"></div>
        <p class="muted small">Её пришлёт ведущая вместе со ссылкой. Если пока не знаешь, можно указать позже в настройках</p>
        <button class="btn wide" data-act="enter">Войти в замок</button>
      </div></div>`;
  }

  const hostTaps = {};
  // ---------- События ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, v = b.dataset.v;
    switch (act) {
      case 'tab': go(v); break;
      case 'settings': openSettings(); break;
      case 'close': closeModal(); break;
      case 'hero': openHero(v); break;
      case 'week': selDay = { w: Number(v), d: 1 }; { const P = pos(); if (P.week === Number(v)) selDay.d = P.day; else selDay.d = 7; } render(); break;
      case 'day': selDay = { w: selDay.w, d: Number(v) }; render(); break;
      case 'edit': editing[v] = true; render(); break;
      case 'done': {
        const [w, d] = v.split('-').map(Number);
        const D = WEEKS[w - 1].days[d - 1];
        const ta = $('#ans');
        const was = st.done[v];
        st.done[v] = { at: was ? was.at : today(), text: ta ? ta.value.trim() : '' };
        delete editing[v]; save();
        if (!was) {
          const who = { c: 'Взрослый сделал запись в хронике', j: 'Ребёнок положил радость в сундук', k: 'Заботливый Родитель стал чуть плотнее' }[D.g];
          toast(D.g, '+1 ' + GEMS[D.g].name.toLowerCase(), who);
        }
        render(); break;
      }
      case 'draw': {
        const used = Object.values(st.ev).map(x => x.card);
        const free = EVENTS.map((_, i) => i).filter(i => !used.includes(i));
        const pool = free.length ? free : EVENTS.map((_, i) => i);
        st.ev[v] = { card: pool[Math.floor(Math.random() * pool.length)], done: false, text: '' };
        save(); render(); break;
      }
      case 'evdone': {
        const e2 = st.ev[v], was = e2.done;
        e2.text = ($('#evans') || {}).value ? $('#evans').value.trim() : '';
        e2.done = true; delete editing['ev' + v]; save();
        if (!was) toast('c', '+1 сапфир', 'Карта события разобрана');
        render(); break;
      }
      case 'train': st.train[v] = !st.train[v]; save(); if (st.train[v]) toast('c', '+1 сапфир', 'Тренировка засчитана'); render(); break;
      case 'read': st.read[v] = !st.read[v]; save(); if (st.read[v]) toast('c', '+1 сапфир', 'Глава книги правил прочитана'); render(); break;
      case 'save-start': {
        const val = $('#f-start').value;
        if (val && !startOk(val)) { alert(badStartMsg(val)); break; }
        st.start = val || null; selDay = null; save(); closeModal(); render();
        if (val) toast('k', 'Дата сохранена', 'Сезон стартует ' + human(val));
        break;
      }
      case 'export': {
        const blob = new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sovet-troyh-' + realToday() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        break;
      }
      case 'reset':
        if (confirm('Стереть все записи и камни на этом телефоне? Это не отменить')) { const s0 = st.start, h0 = st.host; st = blank(); st.start = s0; st.host = h0; st.introSeen = true; save(); closeModal(); selDay = null; render(); }
        break;
      case 'preview-off': st.preview = null; st.unlock = false; selDay = null; save(); render(); break;
      case 'hero-name': case 'hero-name-clear': {
        const val = act === 'hero-name' ? ($('#h-name').value || '').trim().slice(0, 24) : '';
        if (val) st.names[v] = val; else delete st.names[v];
        save(); render(); openHero(v);
        if (val) toast('k', 'Имя дано', 'Теперь это ' + val);
        break;
      }
      case 'crest': crestDraft = null; openCrest(); break;
      case 'crest-col': case 'crest-sym': {
        crestDraft.name = ($('#c-name') || {}).value || '';
        crestDraft[act === 'crest-col' ? 'col' : 'sym'] = Number(v);
        const y = $('#modal').scrollTop; openCrest(); $('#modal').scrollTop = y; break;
      }
      case 'crest-save': {
        crestDraft.name = (($('#c-name') || {}).value || '').trim().slice(0, 28);
        st.crest = crestDraft; crestDraft = null; save(); closeModal(); render();
        toast('j', 'Герб поднят', st.crest.name || 'Над замком твоё знамя');
        break;
      }
      case 'host-tap': {
        clearTimeout(hostTaps.h); hostTaps.n = (hostTaps.n || 0) + 1;
        hostTaps.h = setTimeout(() => { hostTaps.n = 0; }, 1500);
        if (hostTaps.n >= 5) { hostTaps.n = 0; st.host = !st.host; if (!st.host) { st.unlock = false; st.preview = null; } save(); openSettings(); render(); toast('c', st.host ? 'Режим ведущей включён' : 'Режим ведущей выключен', st.host ? 'Блок появился внизу настроек' : 'Приложение как у участницы'); }
        break;
      }
      case 'unlock': {
        if (!st.start) { alert('Сначала укажи дату старта'); break; }
        st.unlock = !st.unlock; selDay = null; save(); openSettings(); render(); break;
      }
      case 'host-off': st.host = false; st.unlock = false; st.preview = null; selDay = null; save(); closeModal(); render(); break;
      case 'overview': openOverview(); break;
      case 'enter': {
        const val = $('#i-start').value;
        if (val && !startOk(val)) { alert(badStartMsg(val)); break; }
        if (val) st.start = val;
        st.introSeen = true; save();
        $('#intro').hidden = true; $('#intro').innerHTML = '';
        go('map'); break;
      }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ---------- Старт ----------
  if (!st.introSeen) showIntro();
  go('map');

  // при возвращении в приложение — пересчитать день
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
