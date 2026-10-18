let ALL_DATA = [];
let HIDDEN_CITIES = [];

const TELEGRAM_LINK = "https://t.me/Shtemenko_t";

function defaultHiddenCityText(city) {
  return `В ${city} у нас тоже есть психолог для очных встреч — просто она не готова показывать анкету здесь. Напишите в Telegram <a href="${TELEGRAM_LINK}" target="_blank" rel="noopener">@Shtemenko_t</a> с парой слов о запросе, и я подберу подходящего специалиста.`;
}

function hiddenCityHtml(entry) {
  const text = entry.text || defaultHiddenCityText(entry.city);
  return `
    <div class="hidden-city-note">
      <p class="hidden-city-title">Мы работаем и в этом городе</p>
      <p class="hidden-city-text">${text}</p>
    </div>
  `;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}

function fillFilterOptions(data, hiddenCities) {
  // Базовый набор городов уже прописан в HTML на случай, если этот скрипт
  // по какой-то причине не выполнится (например, при просмотре файла без
  // запуска JS). Здесь только докидываем города, которых там ещё нет —
  // пригодится, когда данные начнут приходить из Google Sheets.
  const citySel = document.getElementById("f-city");
  const existing = new Set([...citySel.options].map(o => o.value));
  const allCities = [...data.map(d => d.city), ...hiddenCities.map(h => h.city)];
  // Новые города встают по алфавиту среди остальных, но до пункта "Онлайн".
  uniqueSorted(allCities).forEach(city => {
    if (existing.has(city)) return;
    const opt = document.createElement("option");
    opt.value = city; opt.textContent = city;
    const before = [...citySel.options].find(o =>
      o.value === "online" || (o.value && o.value.localeCompare(city, "ru") > 0));
    citySel.insertBefore(opt, before || null);
    existing.add(city);
  });
  if (data.some(d => !d.city) && !existing.has("online")) {
    const opt = document.createElement("option");
    opt.value = "online"; opt.textContent = "Онлайн";
    citySel.appendChild(opt);
  }
}

function priceChips(p) {
  const row = (label, online, offline) => {
    if (online === null && offline === null) return "";
    const chips = [];
    if (online !== null) chips.push(`${online.toLocaleString("ru-RU")} ₽ онлайн`);
    if (offline !== null) chips.push(`${offline.toLocaleString("ru-RU")} ₽ очно`);
    return `
      <div class="price-row">
        <span class="price-tag">${label}</span>
        ${chips.map(c => `<span class="price-chip">${c}</span>`).join("")}
      </div>
    `;
  };
  return row("Инд.", p.prices.online_ind, p.prices.offline_ind)
       + row("Пары", p.prices.online_pair, p.prices.offline_pair);
}

function cardHtml(p) {
  const photo = p.photo
    ? photoImg(p.photo, "avatar", p.name, photoPosition(p.id), "sm")
    : `<div class="avatar"></div>`;
  const sessionsCityText = p.city
    ? `${p.city} · ${p.sessions.join(" и ").toLowerCase()}`
    : `Онлайн`;
  const ageText = p.age ? ` · ${p.age}` : "";
  return `
    <a class="card" href="profile.html?id=${p.id}">
      <div class="card-head">
        ${photo}
        <div>
          <p class="card-name">${p.name}</p>
          <p class="card-role">${p.role} · ${p.formats.join(", ").toLowerCase()}</p>
        </div>
      </div>
      <p class="card-meta">${sessionsCityText}${ageText}</p>
      <div class="pills">
        ${p.approach.slice(0, 2).map(a => `<span class="pill gray">${a}</span>`).join("")}
      </div>
      <div class="pills">
        ${p.topics.slice(0, 2).map(t => `<span class="pill green">${t}</span>`).join("")}
      </div>
      ${p.priceText ? `<div class="price-block">${priceChips(p)}</div>` : ""}
      <p class="card-more">Подробнее →</p>
    </a>
  `;
}

function applyFilters() {
  const city = document.getElementById("f-city").value;
  const format = document.getElementById("f-format").value;
  const session = document.getElementById("f-session").value;
  const maxPrice = document.getElementById("f-price").value;

  const filtered = ALL_DATA.filter(p => {
    // "Онлайн" в фильтре города не сужает список — онлайн работают все
    if (city && city !== "online" && p.city !== city) return false;
    // Сравнение без учёта регистра: в Google Sheet значения формата/сессии
    // иногда вписывают с маленькой буквы ("онлайн" вместо "Онлайн").
    if (format && !p.formats.some(f => f.toLowerCase() === format.toLowerCase())) return false;
    if (session && !p.sessions.some(s => s.toLowerCase() === session.toLowerCase())) return false;
    if (maxPrice) {
      const price = minPrice(p.prices);
      if (price === null || price > Number(maxPrice)) return false;
    }
    return true;
  });

  updateMobileControls(filtered.length, [city, format, session, maxPrice].filter(Boolean).length);

  const grid = document.getElementById("grid");
  if (filtered.length) {
    grid.innerHTML = filtered.map(cardHtml).join("");
    return;
  }

  const hidden = city && !format && !session
    ? HIDDEN_CITIES.find(h => h.city === city)
    : null;
  grid.innerHTML = hidden
    ? hiddenCityHtml(hidden)
    : `<p class="empty-state">Под эти фильтры пока никого нет — попробуйте изменить условия</p>`;
}

// ---------- мобильная шторка с фильтрами ----------

function pluralPsy(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "психолога";
  return "психологов";
}

function updateMobileControls(found, activeCount) {
  const count = document.getElementById("filters-count");
  const apply = document.getElementById("filters-apply");
  if (count) count.textContent = activeCount ? activeCount : "";
  if (apply) apply.textContent = found
    ? `Показать ${found} ${pluralPsy(found)}`
    : "Показать";
}

function openFilters() { document.body.classList.add("filters-open"); }
function closeFilters() { document.body.classList.remove("filters-open"); }

function initMobileFilters() {
  document.getElementById("filters-open").addEventListener("click", openFilters);
  document.getElementById("filters-close").addEventListener("click", closeFilters);
  document.getElementById("filters-overlay").addEventListener("click", closeFilters);
  document.getElementById("filters-apply").addEventListener("click", () => {
    closeFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeFilters(); });
}

async function initCatalog() {
  initMobileFilters();
  // психологи и «скрытые» города грузятся одновременно, а не по очереди
  const refresh = () => { fillFilterOptions(ALL_DATA, HIDDEN_CITIES); applyFilters(); };
  const [data, hidden] = await Promise.all([
    loadData(fresh => { ALL_DATA = fresh.filter(p => p.status !== "скрыт"); refresh(); }),
    loadHiddenCities(fresh => { HIDDEN_CITIES = fresh; refresh(); }),
  ]);
  ALL_DATA = data.filter(p => p.status !== "скрыт");
  HIDDEN_CITIES = hidden;
  refresh();

  ["f-city", "f-format", "f-session", "f-price"].forEach(id => {
    document.getElementById(id).addEventListener("change", applyFilters);
  });
  // цену пересчитываем сразу по мере ввода, чтобы число на кнопке «Показать» обновлялось
  document.getElementById("f-price").addEventListener("input", applyFilters);

  document.getElementById("reset").addEventListener("click", () => {
    ["f-city", "f-format", "f-session"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("f-price").value = "";
    applyFilters();
  });
}

initCatalog();
