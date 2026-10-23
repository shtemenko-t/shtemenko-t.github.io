// Делает фото для сайта, обе карточки психолога и обновляет резервные данные сайта.
//
//   node make.mjs --row row.json --photo фото.jpg [--qr qr-психолога.png] [--position "center 20%"] [--out папка] [--no-site]
//
// row.json — строка из Google Таблицы психологов: ключи = заголовки колонок
// (id_slug, Имя, Роль, Город, Формат терапии, Формат сессии, Возраст, Цена: …, Стоимость (текст),
//  Подход, Частые темы, Не работает с, Текст о себе, Статус).
// --qr — QR-код на Telegram самого психолога (картинка как есть). Без него делается только инфо-карточка.
// Без --no-site фото кладётся в friendlypsy/photos (+ сжатые копии в photos/opt),
// а запись психолога вставляется/обновляется в FALLBACK_DATA в friendlypsy/data.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const SITE = path.join(REPO, "friendlypsy");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) { const k = a.slice(2); const v = process.argv[i + 1]; if (!v || v.startsWith("--")) args[k] = true; else { args[k] = v; i++; } }
}
if (!args.row || !args.photo) { console.error("Нужны --row и --photo"); process.exit(1); }

const row = JSON.parse(fs.readFileSync(args.row, "utf8"));
const g = (k) => (row[k] ?? "").toString().trim();
const list = (k) => g(k).split(",").map(s => s.trim()).filter(Boolean);
const num = (k) => (g(k) === "" ? null : Number(g(k)));
const slug = g("id_slug");
if (!/^[a-z0-9-]+$/.test(slug)) { console.error("id_slug должен быть латиницей, цифрами и дефисами: " + slug); process.exit(1); }

const out = path.resolve(args.out || path.join(HERE, "out", slug));
fs.mkdirSync(out, { recursive: true });

// ---------- фото ----------
const ext = path.extname(args.photo).toLowerCase() === ".png" ? "png" : "jpg";
const photoName = `${slug}.${ext}`;
const photoTmp = path.join(out, photoName);
execFileSync("python3", ["-I", path.join(HERE, "photo.py"), args.photo, photoTmp, path.join(out, "opt")], { stdio: "inherit" });

// ---------- данные для карточки ----------
const formats = list("Формат терапии").map(s => s.toLowerCase());
const sessions = list("Формат сессии").map(s => s.toLowerCase());
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const formatLine = formats.includes("пары")
  ? (formats.includes("индивидуально") ? "Индивидуально и пары" : "Пары")
  : "Только индивидуально";
let sessionLine = sessions.length === 2 ? "Онлайн и очно" : cap(sessions[0] || "онлайн");
if (g("Город") && sessions.includes("очно")) sessionLine += " · " + g("Город");
const age = g("Возраст");
const meta = [formatLine, sessionLine + (age && age !== "без ограничений" ? " · " + age : "")];

const qr = args.qr ? path.resolve(args.qr) : null;

const psy = {
  name: g("Имя"), role: g("Роль"),
  photo: pathToFileURL(photoTmp).href, position: args.position || "center",
  meta, approach: list("Подход"), topics: list("Частые темы"), exclusions: list("Не работает с"),
  price: g("Стоимость (текст)"), qr: qr ? pathToFileURL(qr).href : null,
};

// ---------- карточки ----------
const pw = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"));
const browser = await pw.chromium.launch();
const report = {};
for (const mode of qr ? ["info", "qr"] : ["info"]) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
  await page.addInitScript((p) => { window.PSY = p; }, { ...psy, mode });
  await page.goto(pathToFileURL(path.join(HERE, "card.html")).href);
  await page.waitForFunction(() => window.FIT, null, { timeout: 15000 });
  report[mode] = await page.evaluate(() => window.FIT);
  const file = path.join(out, `${slug}-${mode === "info" ? "info" : "qr"}.png`);
  await page.screenshot({ path: file });
  report[mode].file = file;
}
await browser.close();
if (!qr) report.qr = "нет QR психолога — сделана только инфо-карточка";

// ---------- сайт ----------
if (!args["no-site"]) {
  fs.copyFileSync(photoTmp, path.join(SITE, "photos", photoName));
  for (const f of fs.readdirSync(path.join(out, "opt"))) fs.copyFileSync(path.join(out, "opt", f), path.join(SITE, "photos", "opt", f));

  const entry = {
    id: slug, name: g("Имя"), role: g("Роль"), photo: `photos/${photoName}`,
    city: g("Город") || null,
    formats: list("Формат терапии").map(cap), sessions: list("Формат сессии").map(cap), age: age || null,
    prices: { offline_ind: num("Цена: очно+инд"), offline_pair: num("Цена: очно+пара"), online_ind: num("Цена: онлайн+инд"), online_pair: num("Цена: онлайн+пара") },
    priceText: g("Стоимость (текст)"), approach: list("Подход"), topics: list("Частые темы"), exclusions: list("Не работает с"),
    about: g("Текст о себе"),
  };
  const dataFile = path.join(SITE, "data.js");
  let src = fs.readFileSync(dataFile, "utf8");
  const start = src.indexOf("const FALLBACK_DATA = [");
  const end = src.indexOf("\n];", start);
  const arr = eval(src.slice(start + "const FALLBACK_DATA = ".length, end + 3));
  const i = arr.findIndex(p => p.id === slug);
  if (i >= 0) arr[i] = { ...arr[i], ...entry }; else arr.push(entry);
  const body = "const FALLBACK_DATA = [\n" + arr.map(p => "  " + JSON.stringify(p, null, 2).replace(/\n/g, "\n  ")).join(",\n") + "\n];";
  src = src.slice(0, start) + body + src.slice(end + 3);
  fs.writeFileSync(dataFile, src);
  report.site = { photo: `friendlypsy/photos/${photoName}`, fallback: i >= 0 ? "обновлён" : "добавлен" };
  report.sheetPhoto = `https://shtemenko-t.github.io/friendlypsy/photos/${photoName}`;
}
console.log(JSON.stringify(report, null, 2));
