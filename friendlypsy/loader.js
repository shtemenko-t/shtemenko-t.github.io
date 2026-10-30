// Приводит одну строку CSV (из Google Sheet) к тому же формату, что и FALLBACK_DATA.
// Ожидаемые заголовки колонок — как в файле psihologi_tablitsa.xlsx.
function rowFromCsv(row) {
  const list = (v) => (v || "").split(",").map(s => s.trim()).filter(Boolean);
  const num = (v) => (v === "" || v === undefined ? null : Number(v));
  return {
    id: row["id_slug"],
    name: row["Имя"],
    role: row["Роль"],
    // Фото в таблице ссылаются на старый адрес на Netlify (без VPN не открывается) —
    // такие ссылки превращаем в путь к фото на этом же сайте
    photo: row["Фото"] && row["Фото"].startsWith("http")
      ? row["Фото"].replace(/^https?:\/\/friendlypsy\.netlify\.app\//, "")
      : null,
    city: row["Город"] && row["Город"].trim() ? row["Город"].trim() : null,
    formats: list(row["Формат терапии"]),
    sessions: list(row["Формат сессии"]),
    age: row["Возраст"] || null,
    prices: {
      offline_ind: num(row["Цена: очно+инд"]),
      offline_pair: num(row["Цена: очно+пара"]),
      online_ind: num(row["Цена: онлайн+инд"]),
      online_pair: num(row["Цена: онлайн+пара"]),
    },
    priceText: row["Стоимость (текст)"] || "",
    approach: list(row["Подход"]),
    topics: list(row["Частые темы"]),
    exclusions: list(row["Не работает с"]),
    about: row["Текст о себе"] || "",
    status: row["Статус"] || "активен",
  };
}

// ---------- кэш данных в браузере ----------
// Таблица Google отвечает 1–3 секунды (через VPN дольше). Поэтому последние
// загруженные данные сохраняются в браузере посетителя: при повторном заходе
// карточки показываются сразу, а свежая таблица подтягивается в фоне и, если
// в ней что-то поменялось, страница тихо перерисовывается.
const CACHE_PREFIX = "friendlypsy:";

function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); } catch (e) { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch (e) {}
}

// Отдаёт данные сразу — из кэша, а при первом заходе из data.js — и параллельно
// обновляет их из сети. Раньше при первом заходе страница до 5 секунд ждала
// Google и стояла без карточек — люди думали, что сайт не открывается.
// onUpdate вызывается, только если свежие данные отличаются от показанных.
async function cachedLoad(key, fetchFresh, fallback, onUpdate) {
  const cached = cacheGet(key);
  const shown = cached && cached.length ? cached : fallback;
  fetchFresh().then(fresh => {
    if (!fresh) return;
    cacheSet(key, fresh);
    if (onUpdate && JSON.stringify(fresh) !== JSON.stringify(shown)) onUpdate(fresh);
  });
  return shown;
}

// Таблица Google без VPN может отвечать очень долго. Ждём не дольше 5 секунд,
// потом показываем резервные данные из data.js / кэш браузера
async function fetchWithTimeout(url, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function fetchSheetRows() {
  if (!SHEET_CSV_URL) return null;
  try {
    const res = await fetchWithTimeout(SHEET_CSV_URL);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data
      // строка-подсказка под заголовками (курсивом, для человека) — не настоящая
      // запись психолога, отсекаем по формату id_slug: латиница/цифры/дефис
      .filter(row => /^[a-z0-9-]+$/.test((row["id_slug"] || "").trim()))
      .map(rowFromCsv)
      .filter(r => r.status !== "скрыт");
    return rows.length ? rows : null;
  } catch (e) {
    console.warn("Не удалось загрузить Google Sheet, использую резервные данные", e);
    return null;
  }
}

async function fetchHiddenCities() {
  if (!HIDDEN_CITIES_CSV_URL) return null;
  try {
    const res = await fetchWithTimeout(HIDDEN_CITIES_CSV_URL);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data
      .filter(row => (row["Город"] || "").trim())
      .map(row => ({ city: row["Город"].trim(), text: (row["Текст"] || "").trim() }));
    return rows.length ? rows : null;
  } catch (e) {
    console.warn("Не удалось загрузить список скрытых городов, использую резервные данные", e);
    return null;
  }
}

function loadData(onUpdate) {
  return cachedLoad("psy", fetchSheetRows, FALLBACK_DATA, onUpdate);
}

function loadHiddenCities(onUpdate) {
  return cachedLoad("hidden", fetchHiddenCities, HIDDEN_CITIES_FALLBACK, onUpdate);
}

// ---------- сжатые фото ----------
// Оригиналы фото весят мегабайты, поэтому рядом лежат сжатые копии в photos/opt/:
//   имя.webp    — для страницы психолога (~900 px)
//   имя-sm.webp — для кружка в каталоге (160 px)
// В таблице по-прежнему указывается ссылка на оригинал (…/photos/имя.png) —
// сайт сам подставляет сжатую копию. Если сжатой копии нет (новый психолог,
// фото ещё не сжали), браузер просто загрузит оригинал.
function photoImg(src, cls, alt, position, size) {
  const m = src.match(/^(.*\/)?photos\/([^/?#]+)\.(png|jpe?g|webp)$/i);
  const optimized = m ? `${m[1] || ""}photos/opt/${m[2]}${size === "sm" ? "-sm" : ""}.webp` : src;
  const fallback = optimized !== src
    ? ` onerror="this.onerror=null;this.src='${src}'"`
    : "";
  return `<img class="${cls}" src="${optimized}"${fallback} alt="${alt}" decoding="async" style="object-position:${position}">`;
}

function minPrice(p) {
  const vals = [p.offline_ind, p.offline_pair, p.online_ind, p.online_pair].filter(v => v !== null && v !== undefined);
  return vals.length ? Math.min(...vals) : null;
}

const telegramIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.5 3.5L2.5 11l6 2.3M21.5 3.5L18 20.5l-9.2-7.2M21.5 3.5L8.8 13.3M8.8 13.3v6.1l3.2-3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Ручная подстройка кадрирования фото под квадрат: у части фото волосы/макушка
// начинаются близко к верхнему краю кадра, и центрированный кроп их подрезает.
// Задаётся на глаз, по каждому фото отдельно — не связано с данными из таблицы.
const PHOTO_POSITIONS = {
  eseniya: "center 12%",
  maria: "center top",
};
function photoPosition(id) {
  return PHOTO_POSITIONS[id] || "center";
}
