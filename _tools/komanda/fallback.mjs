// Пересобирает резервные данные сайта команды (FALLBACK_DATA в friendlypsy/data.js) целиком по Google Таблице.
// Сайт показывает их, когда таблица без VPN не отвечает 5 секунд.
//
//   node fallback.mjs rows.json
//
// rows.json — массив строк листа «Психологи»: ключи = заголовки колонок. Строки со Статусом «скрыт» пропускаются.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../../friendlypsy");
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const entries = rows
  .filter(r => /^[a-z0-9-]+$/.test((r["id_slug"] || "").trim()))
  .filter(r => (r["Статус"] || "активен").trim().toLowerCase() !== "скрыт")
  .map(r => {
    const g = (k) => (r[k] ?? "").toString().trim();
    const list = (k) => g(k).split(",").map(s => s.trim()).filter(Boolean);
    const num = (k) => (g(k) === "" ? null : Number(g(k)));
    const photo = g("Фото").replace(/^https?:\/\/[^/]+\/(friendlypsy\/)?/, "") || null;
    return {
      id: g("id_slug"), name: g("Имя"), role: g("Роль"), photo,
      city: g("Город") || null,
      formats: list("Формат терапии").map(cap), sessions: list("Формат сессии").map(cap), age: g("Возраст") || null,
      prices: { offline_ind: num("Цена: очно+инд"), offline_pair: num("Цена: очно+пара"), online_ind: num("Цена: онлайн+инд"), online_pair: num("Цена: онлайн+пара") },
      priceText: g("Стоимость (текст)"), approach: list("Подход"), topics: list("Частые темы"), exclusions: list("Не работает с"),
      about: g("Текст о себе"),
    };
  });

const missing = entries.filter(e => e.photo && !fs.existsSync(path.join(SITE, e.photo))).map(e => `${e.id}: ${e.photo}`);
const dataFile = path.join(SITE, "data.js");
let src = fs.readFileSync(dataFile, "utf8");
const start = src.indexOf("const FALLBACK_DATA = [");
const end = src.indexOf("\n];", start);
const body = "const FALLBACK_DATA = [\n" + entries.map(p => "  " + JSON.stringify(p, null, 2).replace(/\n/g, "\n  ")).join(",\n") + "\n];";
fs.writeFileSync(dataFile, src.slice(0, start) + body + src.slice(end + 3));
console.log(JSON.stringify({ записей: entries.length, ids: entries.map(e => e.id), нетФото: missing }, null, 2));
