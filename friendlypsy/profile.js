const TELEGRAM_USERNAME = "Shtemenko_t"; // проверить, что это актуальный username для контакта

function priceRow(label, offline, online) {
  if (offline === null && online === null) return "";
  const parts = [];
  if (online !== null) parts.push(`${online.toLocaleString("ru-RU")} ₽ онлайн`);
  if (offline !== null) parts.push(`${offline.toLocaleString("ru-RU")} ₽ очно`);
  return `<tr><td>${label}</td><td>${parts.join(" / ")}</td></tr>`;
}

function pillsBlock(label, items, cls) {
  if (!items.length) return "";
  return `
    <div class="section">
      <p class="section-label">${label}</p>
      <div class="pills">${items.map(i => `<span class="pill ${cls}">${i}</span>`).join("")}</div>
    </div>
  `;
}

async function initProfile() {
  const data = await loadData(renderProfile);
  renderProfile(data);
}

function renderProfile(data) {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const p = data.find(d => d.id === id);
  const root = document.getElementById("root");

  if (!p) {
    root.innerHTML = `<p class="not-found">Психолог не найден. <a href="index.html">Вернуться в каталог</a></p>`;
    return;
  }

  const photo = p.photo
    ? photoImg(p.photo, "profile-photo", p.name, photoPosition(p.id))
    : `<div class="profile-photo"></div>`;

  const metaText = p.city
    ? `${p.city} · ${p.sessions.join(" и ").toLowerCase()}${p.age ? " · " + p.age : ""}`
    : `Онлайн${p.age ? " · " + p.age : ""}`;

  const priceRows = [
    priceRow(`Индивидуально`, p.prices.offline_ind, p.prices.online_ind),
    priceRow(`Пары`, p.prices.offline_pair, p.prices.online_pair),
  ].join("");

  const aboutBlock = p.about
    ? `<div class="section"><p class="section-label">О себе</p><p class="about-text">${p.about}</p></div>`
    : "";

  const telegramText = encodeURIComponent(`Здравствуйте! Хочу получить контакт психолога ${p.name}. Мой запрос: `);
  const tgLink = `https://t.me/${TELEGRAM_USERNAME}?text=${telegramText}`;

  root.innerHTML = `
    <a class="back-link" href="index.html">← Все психологи</a>
    <div class="profile-card">
      <div class="profile-head">
        ${photo}
        <div>
          <p class="profile-name">${p.name}</p>
          <p class="profile-role">${p.role} · ${p.formats.join(", ").toLowerCase()}</p>
          <p class="profile-meta">${metaText}</p>
        </div>
      </div>

      ${pillsBlock("Подход", p.approach, "gray")}
      ${pillsBlock("Частые запросы", p.topics, "green")}
      ${pillsBlock("Не работает с", p.exclusions, "red")}

      ${priceRows ? `<div class="section"><table class="price-table">${priceRows}</table></div>` : ""}

      ${aboutBlock}

      <div class="section" style="border-bottom:none;">
        <p class="contact-hint">Опишите в двух словах запрос — пришлю контакт психолога</p>
        <a class="contact-btn" href="${tgLink}">
          ${telegramIcon}
          Написать запрос и получить контакт психолога
        </a>
      </div>
    </div>
  `;
}

initProfile();
