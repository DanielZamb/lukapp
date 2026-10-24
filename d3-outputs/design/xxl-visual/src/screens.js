// D3 proposal screens. Content is the real data from D2's S21 FE captures.

// ---------- data ----------

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
// The app's category palette (categories/appearance.ts). Which colour each of
// the user's categories uses is assumed here; the app reads it from style.color.
const look = (hue, gray) => gray ? { light: hsl(215, 12, 38), dark: hsl(215, 12, 68) } : { light: hsl(hue, 62, 34), dark: hsl(hue, 72, 68) };
const CATEGORIES = {
  Arriendo: ["🏠", look(270)], "Bebidas del Gym": ["🥤", look(180)], "Cami 🤍": ["💛", look(345)], Cofee: ["☕️", look(30)],
  Comida: ["🍔", look(15)], Creditos: ["💳️", look(0, 1)], Dermatologia: ["🧘", look(300)], Energizantes: ["🪫", look(60)],
  Entretenimiento: ["🎬", look(285)], Familia: ["👪️", look(195)], Farrotas: ["🎊", look(330)], Gasolina: ["⛽️", look(0, 1)],
  Grace: ["🫀", look(0)], Gusticos: ["⚜️", look(45)], Impuestos: ["🏛️", look(0, 1)], Mercado: ["🛒", look(150)],
  "One off purchases": ["🖍️", look(255)], Operaciones: ["⚙️", look(0, 1)], Parking: ["🅿️", look(225)], "Personal Care": ["💆", look(315)],
  Ps5: ["🎮️", look(240)], Ropa: ["👔", look(210)], Salud: ["🏥", look(165)], Scooter: ["🛴", look(120)], Servicios: ["💡", look(45)],
  Snacks: ["🧋", look(30)], Subscripciones: ["📅", look(0, 1)], "Subscripciones GYM": ["💪", look(105)], "Subscripciones IA": ["🤖", look(195)],
  "Suplementos Gym": ["🥫", look(135)], Tenis: ["🎾", look(75)], Transporte: ["🚌", look(210)], Viaje: ["✈️", look(180)],
  Rendimientos: ["💸", look(150)],
  "Nu cajita": ["💟", look(300)],
};

// The 53 movements loaded in D2's History capture, newest first.
const M = (date, title, category, minor, extra = {}) => ({ date, title, category, minor, place: "Nu cajita", ...extra });
const T = (date, title, from, to, minor, side) => ({ date, title, minor, transfer: { from, to }, place: side });
const MOVEMENTS = [
  M("June 11", "Carro hasta mi casa desde plaza imperial", "Transporte", -3205000),
  M("June 11", "Preentreno y awita para entrenar en plaza imperial", "Bebidas del Gym", -1550000),
  M("June 11", "Moto de cami hasta su casa", "Cami 🤍", -1220000),
  M("June 11", "Moto hasta la casa de cami", "Cami 🤍", -1280000),
  M("June 11", "Almuerzo en Goong koreano muy bueno", "Comida", -18447000),
  M("June 11", "Open AI", "Subscripciones", -7134220),
  M("June 11", "Cold brew cerca a la oficina de Chico", "Cofee", -2400000),
  M("June 10", "White Moca Grande Strabucks", "Cofee", -2170000),
  M("June 10", "Pago celuco normal", "Servicios", -6728400),
  M("June 10", "Gatorades y gatorlits", "Bebidas del Gym", -2900000),
  M("June 10", "Cold brew + jugo naranja starbucks", "Cofee", -2800000),
  M("June 10", "Carro hasta conecta", "Transporte", -1410000),
  M("June 9", "flat white se me hace en starbucks", "Cofee", -1892500),
  M("June 9", "Gatorades y gatorlits en dollarcity", "Bebidas del Gym", -1600000),
  M("June 9", "Cold brew con jugo de naranja", "Cofee", -2800000),
  M("June 9", "Curso de tenis junio-julio, basico", "Tenis", -29150000),
  M("June 9", "Guaya que me toco comprar al lado de compensar porque no lleve mi guaya, alli tambien venden raquetas", "One off purchases", -2000000),
  M("June 8", "Alitas de KFC por Rappi", "Comida", -6570000),
  M("June 7", "boletas y combo del cine para ver Michael con Cami", "Cami 🤍", -10020000),
  M("June 7", "Comida con migue en kchopes", "Comida", -16590000),
  M("June 6", "Bebidas del gym compradas por rappi turbo", "Bebidas del Gym", -6520000),
  M("June 5", "Cena en amarti para celebrar el grado de cami", "Cami 🤍", -19426300),
  M("June 5", "Moto hasta el trabajo de cami para celebrar su grado en usaquen cerca", "Transporte", -590000),
  M("June 5", "Cancha del sabado 6 junio que no asisti, me la debe Miguelon", "Tenis", -6420000),
  M("June 5", "powerade en la mquina de la oficina de chico", "Bebidas del Gym", -370000),
  M("June 5", "jugo del valle de la maquina de la oficina de chico", "Snacks", -270000),
  M("June 5", "Cold brew doble y cafe geisha de especialidad", "Cofee", -7900000),
  M("June 5", "Carro a globant chico oficina", "Transporte", -2290000),
  M("June 3", "frisby tenders pollo", "Comida", -7265000),
  M("June 3", "Disney+ para ver el mundial y la premier league", "Subscripciones", -5490000),
  M("June 2", "gatorades por calambre muscular", "Bebidas del Gym", -4830000),
  M("June 2", "Pago de Psicologa de Pancho", "Familia", -17000000),
  M("June 2", "Pollo frisby tenders", "Comida", -6615000),
  M("June 1", "Pollo Frisby para compartir con la familia", "Comida", -11735500),
  M("June 1", "Hielo y jugo de naranja", "Mercado", -3588000),
  M("June 1", "Google Workspace Sennkai labs email", "Subscripciones", -5840000),
  M("June 1", "Citas 20 mayo y 26 de mayo", "Grace", -44000000),
  T("June 1", "Pago TDC banco de bogota", "Nu cajita", "BDB credit card", -15250500, "Nu cajita"),
  T("June 1", "Pago TDC banco de bogota", "Nu cajita", "BDB credit card", 15250500, "BDB credit card"),
  T("June 1", "Transferencia a la cuenta de dav por la cuota de manejo", "Nu cajita", "Davivienda FIC", -10000000, "Nu cajita"),
  T("June 1", "Transferencia a la cuenta de dav por la cuota de manejo", "Nu cajita", "Davivienda FIC", 10000000, "Davivienda FIC"),
  M("May 31", "Rendimientos Nu de Mayo", "Rendimientos", 40909663),
  M("May 31", "mosnters y par gatorlits", "Bebidas del Gym", -6630000),
  M("May 31", "palilos y pitillos de acero", "One off purchases", -3580000),
  M("May 31", "paleta de mierda de kaleka", "Snacks", -1990000),
  M("May 30", "Cafe para cami, isa, migue y yop", "Familia", -6190000),
  M("May 30", "Cafe bourbon en libertario por bolsa", "Cofee", -6500000),
  M("May 30", "Parking en zonas autopago de bogota", "Parking", -3000000),
  M("May 30", "mercado para cocinarle de cumple y grado a cami", "Cami 🤍", -43348700),
  T("May 29", "Retiro en cajero", "Nu cajita", "Cash wallet", -5000000, "Nu cajita"),
  T("May 29", "Retiro en cajero", "Nu cajita", "Cash wallet", 5000000, "Cash wallet"),
  M("May 29", "Propina al barbero", "Personal Care", -1200000),
  M("May 29", "Barbero", "Personal Care", -8000000),
];

// Money formatting as the app prints it (es-CO grouping, "−" minus).
function grouped(minor, decimals = "auto") {
  const abs = Math.abs(minor);
  const units = Math.floor(abs / 100), cents = abs % 100;
  const body = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents || decimals === "always" ? `${body},${String(cents).padStart(2, "0")}` : body;
}
const signed = (minor, plus = true) => `${minor < 0 ? "−" : plus && minor > 0 ? "+" : ""}$${grouped(minor)}`;
function compact(minor) {
  const units = Math.abs(minor) / 100;
  const [scale, suffix] = units >= 1e6 ? [1e6, "M"] : units >= 1e3 ? [1e3, "K"] : [1, ""];
  const value = units / scale;
  return `${minor < 0 ? "−" : ""}$${scale === 1 ? value : value.toFixed(value >= 10 || value % 1 === 0 ? 0 : 1)}${suffix}`;
}

const OUT = MOVEMENTS.reduce((sum, m) => sum + Math.max(0, -m.minor), 0);
const IN = MOVEMENTS.reduce((sum, m) => sum + Math.max(0, m.minor), 0);
const JUNE = Object.entries(MOVEMENTS.filter((m) => m.date.startsWith("June") && !m.transfer && m.minor < 0)
  .reduce((acc, m) => ({ ...acc, [m.category]: (acc[m.category] || 0) - m.minor }), {}))
  .sort((a, b) => b[1] - a[1]);
const JUNE_OUT = JUNE.reduce((sum, [, v]) => sum + v, 0);
const COMIDA = MOVEMENTS.filter((m) => m.category === "Comida" && m.date.startsWith("June"));

// ---------- building blocks ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const t = (variant, text, cls = "", attrs = "") => `<span data-v="${variant}" class="t ${cls}" ${attrs}>${esc(text)}</span>`;
const icon = (name, size = 22, cls = "") => `<svg class="ic ${cls}" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const emojiTile = (name, size = "") => {
  const [emoji, colors] = CATEGORIES[name] || ["✨", look(270)];
  const variant = size === "lg" ? "emojiLg" : size === "sm" ? "emojiSm" : "emoji";
  return `<span class="tile ${size}" style="--cl:${colors.light};--cd:${colors.dark}" aria-hidden="true">${t(variant, emoji)}</span>`;
};
const iconTile = (name, tone = "accent", size = "") => `<span class="tile icon ${tone} ${size}" aria-hidden="true">${icon(name, size === "sm" ? 18 : 24)}</span>`;
const pair = (items) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += 2) chunks.push(items.slice(i, i + 2));
  return chunks.map((chunk) => `<div class="card" data-group>${chunk.join("")}</div>`).join("");
};
const primary = (label, iconName = "checkmark", attrs = "") => `<button class="btn primary" data-tap="primary" ${attrs}>${t("action", label)}${icon(iconName, 24)}</button>`;
const secondary = (label, iconName, cls = "") => `<button class="btn secondary ${cls}" data-tap="secondary">${iconName ? icon(iconName, 22) : ""}${t("action", label)}</button>`;
const header = (title, eyebrow, back = true) => `<header class="head">${back ? `<button class="round" data-tap aria-label="Back">${icon("chevron-back", 24)}</button>` : ""}<div class="head-copy">${eyebrow ? t("eyebrow", eyebrow, "muted") : ""}${t("screen", title, "", 'role="heading"')}</div></header>`;
const moneyHero = (currency, amount, opts = {}) => `<div class="money-hero ${opts.cls || ""}" aria-label="${esc(`${amount.startsWith("−") ? "−" : ""}${currency} ${amount.replace("−", "")}`)}">
  ${t("label", currency, opts.currencyCls || "accent")}<span class="hero-line"><span class="hero-num ${opts.tone || ""}" data-v="hero" ${opts.floor ? `data-floor="${opts.floor}"` : ""}>${esc(amount)}</span>${opts.caret ? '<span class="caret" aria-hidden="true"></span>' : ""}</span></div>`;
const tone = (minor) => minor > 0 ? "pos" : "";

// Row anatomy at XXXL: a short, stable label first (emoji tile + category),
// the money on its own line, then the free-text description in muted type,
// at most two lines. The full description is in the screen-reader label and
// one tap away in Entry details.
const titleLine = (tile, label, trailing = "") => `<span class="title-line">${tile}${t("rowTitle", label)}${trailing}</span>`;
const desc = (text) => t("meta", text, "muted desc", `data-clamp data-full="${esc(text)}"`);
function movementRow(m, { place = false } = {}) {
  const label = m.transfer ? "Transfer" : m.category;
  const tile = m.transfer ? iconTile("swap-horizontal", m.minor > 0 ? "pos" : "neutral", "sm") : emojiTile(m.category, "sm");
  const text = m.transfer ? `${m.transfer.from} → ${m.transfer.to}` : [place ? m.place : "", m.title].filter(Boolean).join(" · ");
  return `<button class="row" data-item data-tap aria-label="${esc(`${label}, ${signed(m.minor)}, ${text}`)}">
    <span class="row-copy">${titleLine(tile, label)}${t("money", signed(m.minor), tone(m.minor))}${desc(text)}</span></button>`;
}

function flowCard({ label, net, out, inn, note }) {
  const line = (dir, name, minor, cls) => `<div class="flow-line" data-item>${iconTile(dir === "out" ? "arrow-up" : "arrow-down", cls)}<span class="row-copy">${t("meta", name, "muted")}${t("money", minor === 0 ? "$0" : compact(dir === "out" ? -minor : minor).replace("−", dir === "out" ? "−" : "+"), dir === "in" && minor ? "pos" : "")}</span></div>`;
  return `<section class="flow">
    <div class="flow-net">${t("label", label, "muted")}${t("screen", compact(net), net > 0 ? "pos" : "")}</div>
    <div class="flow-lines" data-group>${line("out", "Out", out, "neutral")}${line("in", "In", inn, "pos")}</div></section>`;
}

const segmented = (active, count) => `<div class="seg" role="tablist">
  <button class="seg-item ${active === "one" ? "on" : ""}" data-tap role="tab">${t("action", "One")}</button>
  <button class="seg-item ${active === "batch" ? "on" : ""}" data-tap role="tab">${t("action", "Batch")}${count ? `<span class="badge">${t("label", String(count))}</span>` : ""}</button></div>`;

// ---------- screens ----------

const SCREENS = {};

// Home posting (user decision, round 2): Post money is pinned in an
// ActionBar, always reachable. The balance still opens "What do you want to do?".
SCREENS.home = () => ({
  top: "band",
  footer: primary("Post money", "add"),
  body: `<section class="band">
    <div class="band-mark" data-bleed aria-hidden="true">${window.ASSETS.brand.symbol}</div>
    <div class="band-head">
      <div class="brand"><span class="lockup only-light" aria-label="Lukapp">${window.ASSETS.brand.lockup}</span><span class="lockup only-dark" aria-label="Lukapp">${window.ASSETS.brand.lockupInv}</span>${t("eyebrow", "THIS MONTH", "muted")}</div>
      <button class="round on-band" data-tap aria-label="Alerts, nothing needs attention">${icon("notifications-outline", 24)}</button>
      <button class="round on-band" data-tap aria-label="Open user and workspace">${icon("person-outline", 24)}</button>
    </div>
    <button class="hero-button" data-tap aria-label="What do you want to do?">
      ${t("meta", "What you have now", "muted")}${moneyHero("COP", "56.526.163,06", { floor: "home" })}</button>
    <button class="places" data-tap>${icon("wallet-outline", 22)}${t("rowTitle", "Across 6 places")}${icon("chevron-forward", 20)}</button>
  </section>
  <div class="page">
    <button class="drafts" data-tap aria-label="Drafts, Nothing waiting">
      <span class="drafts-top"><span class="drafts-icon">${icon("document-text-outline", 26)}</span>${icon("chevron-forward", 22)}</span>
      ${t("section", "Drafts")}${t("body", "Nothing waiting", "soft")}</button>
    <div class="card" data-group>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("pie-chart-outline")}${icon("chevron-forward", 20, "muted")}</span>${t("rowTitle", "Overview")}${t("meta", "This month, by category", "muted")}</button>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("layers-outline")}${icon("chevron-forward", 20, "muted")}</span>${t("rowTitle", "Plans")}${t("meta", "October budget and recovery", "muted")}</button>
    </div>
  </div>`,
});

SCREENS.history = () => {
  const days = [...new Set(MOVEMENTS.map((m) => m.date))];
  const sections = days.map((day) => {
    const rows = MOVEMENTS.filter((m) => m.date === day);
    const places = new Set(rows.map((m) => m.place));
    const net = rows.reduce((sum, m) => sum + m.minor, 0);
    const shared = places.size === 1 ? [...places][0] : null;
    // One line: the date and the day's net. The place joins only when the whole day shares it.
    return `<section class="day">
      <div class="day-head"><span class="day-line">${t("section", day, "", 'role="heading"')}${t("money", compact(net), net > 0 ? "pos" : "muted")}</span>${shared ? t("meta", shared, "muted") : ""}</div>
      <div class="day-cards">${pair(rows.map((m) => movementRow(m, { place: !shared })))}</div></section>`;
  }).join("");
  return {
    body: `<div class="page">${header("Tx history", "ACROSS ALL PLACES")}
      ${flowCard({ label: "Net", net: IN - OUT, out: OUT, inn: IN })}
      <div class="controls">
        <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search", "muted")}</label>
        ${pair([["swap-vertical", "Sort", "Newest first", "accent"], ["wallet-outline", "Places", "All 6 places"], ["pricetag-outline", "Categories", "All 33"], ["calendar-outline", "Dates", "All time"]]
          .map(([name, label, value, toneName = "neutral"]) => `<button class="row" data-item data-tap aria-label="${label}, ${value}"><span class="row-copy">${titleLine(iconTile(name, toneName, "sm"), label, icon("chevron-forward", 20, "muted"))}${t("status", value, "muted")}</span></button>`))}
        ${t("meta", "53 of 53 loaded", "muted")}
      </div>
      ${sections}</div>`,
  };
};

SCREENS.post = () => ({
  keyboard: true,
  scrollTo: ".amount",
  body: `<div class="page">${header("Post money", "NEW ENTRY")}
    ${segmented("one")}
    <section class="amount focused">${moneyHero("COP", "−32.050", { caret: true })}
      <span class="amount-tone">${icon("arrow-up", 20)}${t("meta", "Money out", "muted")}</span></section>
    <div class="chips" role="radiogroup" aria-label="Entry type">
      <button class="chip on" data-tap role="radio" aria-checked="true">${t("action", "Normal")}</button>
      <button class="chip" data-tap role="radio">${t("action", "Transfer")}</button>
      <button class="chip wide" data-tap role="radio">${t("action", "Initial balance")}</button></div>
    <div class="field">${t("label", "Description", "muted")}<span class="input" data-tap="input">${t("body", "Carro hasta mi casa desde plaza imperial")}</span></div>
    <section class="stack">${t("section", "Entry details", "", 'role="heading"')}
      ${pair([
        `<button class="row" data-item data-tap>${emojiTile("Nu cajita")}<span class="row-copy">${t("meta", "Place", "muted")}${t("rowTitle", "Nu cajita")}</span>${icon("chevron-forward", 20, "muted")}</button>`,
        `<button class="row" data-item data-tap>${emojiTile("Transporte")}<span class="row-copy">${t("meta", "Category", "muted")}${t("rowTitle", "Transporte")}</span>${icon("chevron-forward", 20, "muted")}</button>`,
        `<button class="row" data-item data-tap>${iconTile("calendar-outline", "neutral")}<span class="row-copy">${t("meta", "Date occurred", "muted")}${t("rowTitle", "October 24, 2026")}</span>${icon("chevron-forward", 20, "muted")}</button>`,
      ])}</section></div>`,
  footer: primary("Post", "checkmark"),
});

const BATCH = [MOVEMENTS[0], MOVEMENTS[1], MOVEMENTS[2]];
SCREENS.batch = () => {
  const net = BATCH.reduce((sum, m) => sum + m.minor, 0);
  const row = (m) => `<div class="row draft" data-item aria-label="${esc(`${m.category}, ${signed(m.minor)}, ${m.title}`)}"><span class="row-copy">${titleLine(emojiTile(m.category, "sm"), m.category)}
      <span class="draft-money">${t("money", signed(m.minor), tone(m.minor))}<button class="round small" data-tap aria-label="Remove ${esc(m.title)}">${icon("close", 20)}</button></span>${desc(m.title)}</span></div>`;
  return {
    body: `<div class="page">${header("Batch", "", true)}
      ${segmented("batch", BATCH.length)}
      <section class="amount">${t("label", "Net of 3 drafts", "muted")}${moneyHero("COP", `−${grouped(net)}`)}
        ${t("meta", "Not posted yet", "muted")}</section>
      <section class="stack"><div class="day-head">${t("section", "In this batch", "", 'role="heading"')}${t("meta", "From Nu cajita", "muted")}</div>${pair(BATCH.map(row))}</section></div>`,
    footer: primary(`Post ${BATCH.length}`, "checkmark") + secondary("Add one", "add"),
  };
};

SCREENS.overview = () => {
  const max = JUNE[0][1];
  const row = ([name, minor]) => `<button class="row" data-item data-tap aria-label="${esc(`${name}, $${grouped(minor)}`)}"><span class="row-copy">${titleLine(emojiTile(name, "sm"), name, icon("chevron-forward", 20, "muted"))}${t("money", `$${grouped(minor)}`)}
    <span class="share" style="--w:${(minor / max * 100).toFixed(1)}%;--cl:${CATEGORIES[name][1].light};--cd:${CATEGORIES[name][1].dark}" aria-hidden="true"><i></i></span></span></button>`;
  return {
    body: `<div class="page">${header("Overview", "JUNE")}
      ${flowCard({ label: "Net", net: -JUNE_OUT, out: JUNE_OUT, inn: 0 })}
      <button class="btn secondary left" data-tap="secondary">${icon("receipt-outline", 22)}${t("action", "Go to tx history")}</button>
      <div class="seg" role="radiogroup"><button class="seg-item on" data-tap>${icon("list-outline", 20)}${t("action", "List")}</button><button class="seg-item" data-tap>${icon("bar-chart-outline", 20)}${t("action", "Bars")}</button></div>
      <section class="stack">${t("section", "Where it went", "", 'role="heading"')}${pair(JUNE.slice(0, 4).map(row))}
      <button class="btn ghost" data-tap>${t("action", "View all 33 categories")}</button></section></div>`,
  };
};

SCREENS.entry = () => ({
  body: `<div class="page">
    <section class="summary">
      <span class="direction">${iconTile("arrow-up", "neutral")}${t("label", "MONEY OUT", "muted")}</span>
      ${t("name", "Barbero", "", 'role="heading"')}
      ${moneyHero("COP", "−80.000")}
      <span class="badge-posted">${icon("checkmark", 18)}${t("label", "Posted")}</span>
    </section>
    <section class="stack">${t("section", "About this entry", "", 'role="heading"')}
      ${pair([
        `<div class="row" data-item>${iconTile("calendar-outline", "neutral")}<span class="row-copy">${t("meta", "When", "muted")}${t("rowTitle", "May 29")}</span></div>`,
        `<div class="row" data-item>${emojiTile("Personal Care")}<span class="row-copy">${t("meta", "Category", "muted")}${t("rowTitle", "Personal Care")}</span></div>`,
        `<div class="row" data-item>${iconTile("wallet-outline", "neutral")}<span class="row-copy">${t("meta", "Place", "muted")}${t("rowTitle", "Nu cajita")}</span></div>`,
      ])}</section></div>`,
  footer: secondary("Reverse entry", "arrow-undo-outline", "danger") + secondary("Close details", "close"),
  pill: { emoji: "💆", text: "−$80.000", label: "Back to summary, Barbero, −80.000 pesos" },
});

SCREENS.category = () => {
  const total = COMIDA.reduce((sum, m) => sum - m.minor, 0);
  // Every row here shares the category, so the date is the short label.
  const row = (m) => `<button class="row" data-item data-tap aria-label="${esc(`${m.date}, ${signed(m.minor)}, ${m.title}`)}"><span class="row-copy">${titleLine("", m.date, icon("chevron-forward", 20, "muted"))}${t("money", signed(m.minor))}${desc(m.title)}</span></button>`;
  const [emoji, colors] = CATEGORIES.Comida;
  return {
    body: `<div class="page">${header("Comida", "JUNE")}
      <section class="look" style="--cl:${colors.light};--cd:${colors.dark}">
        <span class="look-top">${emojiTile("Comida", "lg")}${t("meta", "Out in June", "muted")}</span>
        ${moneyHero("COP", grouped(total), { currencyCls: "muted" })}
        ${t("meta", `${Math.round(total / JUNE_OUT * 100)}% of June's spending`, "muted")}</section>
      <section class="stack">${t("section", "Recent", "", 'role="heading"')}${pair(COMIDA.slice(0, 2).map(row))}
        <button class="btn ghost" data-tap>${t("action", `View all ${COMIDA.length} in History`)}</button></section></div>`,
    footer: primary("Set a limit", "flag-outline") + secondary("Edit category", "create-outline"),
    pill: { emoji, text: `COP ${grouped(total)}`, label: `Back to summary, Comida, ${grouped(total)} pesos out in June` },
  };
};
