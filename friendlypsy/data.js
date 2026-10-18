// ЛЁГКОЕ ОБНОВЛЕНИЕ БЕЗ ПРАВКИ КОДА:
// Когда таблица будет опубликована в Google Sheets (Файл → Опубликовать в интернете → CSV),
// вставь ссылку сюда — сайт начнёт читать реальные данные на лету, без пересборки.
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrwBdogxsPDACvsuRjSEjryuGpuXwFDEv3XyAfcXuWCRIlWak8gjA-LAWt2XaxPFhjf_fAVJLKJk6R/pub?gid=1046970923&single=true&output=csv";

// ГОРОДА СО "СКРЫТЫМ" ПРИСУТСТВИЕМ:
// отдельный лист в той же Google-таблице (например "HiddenCities") с колонками
// "Город" и, опционально, "Текст" (свой текст плашки для конкретного города —
// если оставить пустым, используется текст по умолчанию из catalog.js).
// Файл → Опубликовать в интернете → выбрать этот лист → CSV, вставить ссылку сюда.
const HIDDEN_CITIES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrwBdogxsPDACvsuRjSEjryuGpuXwFDEv3XyAfcXuWCRIlWak8gjA-LAWt2XaxPFhjf_fAVJLKJk6R/pub?gid=1404438531&single=true&output=csv";

// Пока ссылки нет (или если загрузка не удалась) — используется список ниже.
const HIDDEN_CITIES_FALLBACK = [
  { city: "Санкт-Петербург", text: "" },
  { city: "Екатеринбург", text: "" },
];

// Пока ссылки нет (или если загрузка не удалась) — используются данные ниже.
const FALLBACK_DATA = [
  {
    id: "aleksey", name: "Алексей", role: "Психолог",
    photo: "photos/aleksey.png",
    city: "Москва", formats: ["Индивидуально", "Пары"], sessions: ["Онлайн", "Очно"], age: "18+",
    prices: { offline_ind: 3500, offline_pair: 5000, online_ind: 3000, online_pair: 4500 },
    priceText: "Инд.: 3000 ₽ онлайн / 3500 ₽ очно (60 мин) · Пары: 4500 ₽ онлайн / 5000 ₽ очно (90 мин)",
    approach: ["КПТ"],
    topics: ["Сексуализированное насилие", "ПРЛ", "Депрессивные состояния", "Тревожные расстройства"],
    exclusions: ["Зависимости от ПАВ", "Шизофренические расстройства", "Участники СВО"],
    about: ""
  },
  {
    id: "marina", name: "Марина", role: "Психолог",
    photo: "photos/marina.png",
    city: "Новосибирск", formats: ["Индивидуально", "Пары"], sessions: ["Онлайн", "Очно"], age: "16+",
    prices: { offline_ind: 2000, offline_pair: 4000, online_ind: 2000, online_pair: 3000 },
    priceText: "Инд.: 2000 ₽ онлайн и очно (50 мин) · Пары: 3000 ₽ онлайн / 4000 ₽ очно (90 мин)",
    approach: ["КПТ"],
    topics: ["Тревога", "Навязчивые мысли", "Сепарации", "Созависимость", "Селфхарм", "Самоопределение", "Самооценка", "Отношения"],
    exclusions: [],
    about: "",
    note: "Цена на обновлении — ждём подтверждения от психолога"
  },
  {
    id: "alina", name: "Алина", role: "Психолог",
    photo: "photos/alina.png",
    city: "Новосибирск", formats: ["Индивидуально", "Пары"], sessions: ["Онлайн", "Очно"], age: null,
    prices: { offline_ind: 3500, offline_pair: 3500, online_ind: 3000, online_pair: 3500 },
    priceText: "Инд.: 3000 ₽ онлайн / 3500 ₽ очно · Пары: 3500 ₽ онлайн и очно (90 мин)",
    approach: ["Гештальт"],
    topics: ["Отношения с партнёром", "Отношения с детьми", "Отношения с родителями", "Отношения с собой"],
    exclusions: [],
    about: ""
  },
  {
    id: "lars", name: "Ларс", role: "Клинический психолог, психотерапевт, сексолог",
    photo: "photos/lars.png",
    city: "Новосибирск", formats: ["Индивидуально", "Пары"], sessions: ["Онлайн", "Очно"], age: null,
    prices: { offline_ind: 4500, offline_pair: 6000, online_ind: 4500, online_pair: 6000 },
    priceText: "Инд.: 4500 ₽ онлайн и очно (50 мин) · Пары: 6000 ₽ онлайн и очно (70 мин)",
    approach: ["Интегративный", "Схема-терапия", "КПТ", "АСТ"],
    topics: ["КПТСР и детские травмы", "Фобии и панические атаки", "Созависимость", "Тревожно-депрессивные состояния", "Гендерная идентичность"],
    exclusions: [],
    about: ""
  },
  {
    id: "nadezhda", name: "Надежда", role: "Психолог",
    photo: "photos/nadezhda.png",
    city: "Москва", formats: ["Индивидуально"], sessions: ["Онлайн", "Очно"], age: null,
    prices: { offline_ind: 4500, offline_pair: null, online_ind: 4500, online_pair: null },
    priceText: "4500 ₽ онлайн и очно (50 мин), только индивидуально",
    approach: ["Полимодальный", "Телесная терапия", "Экзистенциальный"],
    topics: ["Тревога", "Сексология", "Отношения"],
    exclusions: ["Зависимости", "РПП"],
    about: ""
  },
  {
    id: "taisiya", name: "Таисия", role: "Психолог",
    photo: "photos/taisiya.png",
    city: null, formats: ["Индивидуально"], sessions: ["Онлайн"], age: "18+",
    prices: { offline_ind: null, offline_pair: null, online_ind: 7000, online_pair: null },
    priceText: "7000 ₽ онлайн (50 мин), только индивидуально",
    approach: ["Интегральный", "КПТ", "Трансактный анализ"],
    topics: ["Отношения", "Тревога", "Проявленность", "Самооценка"],
    exclusions: ["Зависимости", "РПП", "ПРЛ"],
    about: ""
  },
  {
    id: "aleksandra", name: "Александра", role: "Клинический психолог",
    photo: "photos/aleksandra.png",
    city: null, formats: ["Индивидуально", "Пары"], sessions: ["Онлайн", "Очно"], age: null,
    prices: { offline_ind: 5000, offline_pair: 7500, online_ind: 5000, online_pair: 7500 },
    priceText: "Инд.: 5000 ₽ онлайн и очно (50 мин) · Пары: 7500 ₽ онлайн и очно (75 мин)",
    approach: ["Интегральный", "Схема-терапия"],
    topics: ["Отношения с собой", "Личностные расстройства", "Стать счастливым"],
    exclusions: ["Сторонники СВО", "Химические зависимости"],
    about: "",
    note: "Город пока не называет — уточняется"
  },
  {
    id: "eseniya", name: "Есения", role: "Психолог",
    photo: "photos/eseniya.png",
    city: null, formats: ["Индивидуально", "Пары"], sessions: ["Онлайн"], age: null,
    prices: { offline_ind: null, offline_pair: null, online_ind: 3000, online_pair: 5000 },
    priceText: "Инд.: 3000 ₽ онлайн · Пары: 5000 ₽ онлайн · Льготная (для транс людей): 2000 ₽ онлайн, индивидуально",
    approach: ["КПТ", "Телесно-ориентированная терапия"],
    topics: ["Трансгендерные люди", "Отношения", "Внутренняя дискриминация", "Сексуализированное насилие"],
    exclusions: ["Участники СВО"],
    about: ""
  },
  {
    id: "elena-1", name: "Елена", role: "Психолог",
    photo: "photos/elena-1.png",
    city: null, formats: ["Индивидуально", "Пары"], sessions: ["Онлайн"], age: null,
    prices: { offline_ind: null, offline_pair: null, online_ind: 3500, online_pair: 4500 },
    priceText: "Инд.: 3500 ₽ онлайн · Пары: 4500 ₽ онлайн",
    approach: ["КПТ", "АКТ", "Кризисное консультирование"],
    topics: ["Тревога", "Отношения", "Абьюз", "ПТСР", "БАР"],
    exclusions: [],
    about: ""
  },
  {
    id: "elena-2", name: "Елена", role: "Психолог",
    photo: "photos/elena-2.png",
    city: "Челябинск", formats: ["Индивидуально"], sessions: ["Онлайн", "Очно"], age: "14+",
    prices: { offline_ind: 6000, offline_pair: null, online_ind: 5500, online_pair: null },
    priceText: "Инд.: 5500 ₽ онлайн / 6000 ₽ очно; только индивидуально",
    approach: ["EMDR (ДПДГ)", "Гипнотерапия", "ЭОТ", "Семейные расстановки", "КПТ (элементы)"],
    topics: ["Деньги и заработок", "Тревога и страхи", "Самооценка", "Отношения и созависимость"],
    exclusions: ["Химические зависимости", "Экстренная психиатрия", "Суицидальный кризис", "Военнослужащие"],
    about: "",
    note: "Две Елены в команде — стоит уточнить фамилию/отчество для показа на сайте"
  },
];
