// D4 flow steps: every screen D3 didn't cover.
// Round 2, from the user's comments on the flows page:
// - Short status facts use the `status` style (capped at 1.3) on one line;
//   the full text stays in the row's screen-reader label.
// - A tinted card only where the user enters or decides a number (Post,
//   "Stay under", Move money). Elsewhere space sets the hierarchy.
// - Options are full width, one per row. Context goes in the camera island
//   or the docked pill, not in a pill at the top of the page.

const cop = (minor) => `COP ${grouped(minor)}`;
const usd = (minor) => `$${grouped(minor)}`;
const chevron = () => icon("chevron-forward", 20, "muted");
const tick = (size = 22) => `<svg class="tick" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const sheetHead = (title, eyebrow) => `<header class="sheet-head"><div class="head-copy">${eyebrow ? t("eyebrow", eyebrow, "muted") : ""}${t("section", title, "", 'role="heading"')}</div><button class="round" data-tap aria-label="Close">${icon("close", 22)}</button></header>`;
// A one-line status fact. `state` = [word, tone, icon] leads it in colour, with an icon.
const statusText = (text, state) => state ? `${state[0]}${text ? ` · ${text}` : ""}` : text;
// In rows it's clamped to one line (the row's label holds the full text);
// standing alone (clamp: false) it wraps.
const status = (text, { state = null, cls = "muted", clamp = true } = {}) => {
  const lead = state ? `<b class="${state[1]}">${state[2] ? icon(state[2], 18) : ""}${esc(state[0])}</b>${text ? " · " : ""}` : "";
  const attrs = clamp ? `data-clamp data-full="${esc(statusText(text, state))}"` : "";
  return `<span data-v="status" class="t ${clamp ? "one-line" : ""} ${cls}" ${attrs}>${lead}${esc(text)}</span>`;
};
// Row: label line (tile + label + chevron), money on its own line, then one status line.
const row = ({ lead = "", label, money = "", moneyCls = "", extra = "", line = "", aria, tap = true }) =>
  `<${tap ? "button" : "div"} class="row" data-item ${tap ? "data-tap" : ""} aria-label="${esc(aria)}"><span class="row-copy">${titleLine(lead, label, tap ? chevron() : "")}${money ? t("money", money, moneyCls) : ""}${extra}${line}</span></${tap ? "button" : "div"}>`;
const fact = (lead, label, value, { variant = "rowTitle", cls = "" } = {}) => `<div class="row" data-item>${lead}<span class="row-copy">${t("status", label, "muted")}${t(variant, value, cls)}</span></div>`;
const plainRow = (lead, title, text) => `<div class="row plain">${lead}<span class="row-copy">${t("rowTitle", title)}${text ? t("meta", text, "muted") : ""}</span></div>`;
const field = (label, value, { helper = "" } = {}) => `<div class="field">${t("label", label, "muted")}<span class="input" data-tap="input">${t("body", value)}</span>${helper ? t("meta", helper, "muted") : ""}</div>`;
const choice = (label, detail, on, { lead = "", kind = "radio", detailVariant = "status" } = {}) => `<button class="choice ${on ? "on" : ""}" data-item data-tap role="${kind}" aria-checked="${on}" aria-label="${esc(detail ? `${label}, ${detail}` : label)}">${lead}<span class="row-copy">${t("rowTitle", label)}${detail ? (detailVariant === "status" ? status(detail) : t(detailVariant, detail, "muted")) : ""}</span><span class="${kind === "radio" ? "radio" : "check"}" aria-hidden="true">${kind === "checkbox" && on ? tick(20) : ""}</span></button>`;
const options = (items) => `<div class="options" role="radiogroup">${items.map(([label, on, lead = ""]) => `<button class="option ${on ? "on" : ""}" data-tap="secondary" role="radio" aria-checked="${!!on}">${lead}${t("action", label)}${on ? tick() : ""}</button>`).join("")}</div>`;
const chips = (items) => `<div class="chips" role="radiogroup">${items.map(([label, on, wide]) => `<button class="chip ${on ? "on" : ""} ${wide ? "wide" : ""}" data-tap role="radio" aria-checked="${!!on}">${t("action", label)}</button>`).join("")}</div>`;
const jar = (fill, colors, { over = false, lg = false } = {}) => `<span class="jar ${over ? "over" : ""} ${lg ? "lg" : ""}" style="--w:${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%${colors ? `;--cl:${colors.light};--cd:${colors.dark}` : ""}" aria-hidden="true"><i></i></span>`;
const section = (title, body, meta = "") => `<section class="stack"><div class="day-head">${t("section", title, "", 'role="heading"')}${meta ? t("status", meta, "muted") : ""}</div>${body}</section>`;
const heroBlock = (label, amount, { tone = "", extra = "", line = "", floor = "" } = {}) => `<section class="hero-block">${t("label", label, "muted")}${moneyHero("COP", amount, { tone, floor })}${extra}${line}</section>`;
const leadIcon = (name, cls) => `<span class="lead-icon ${cls}" aria-hidden="true">${icon(name, 28)}</span>`;
const island = (emoji, text, label) => `<button class="island" aria-label="${esc(label)}"><span class="em">${emoji}</span><span class="cam" aria-hidden="true"></span><b>${esc(text)}</b></button>`;
const dock = (emoji, text, label) => `<button class="dock" aria-label="${esc(label)}"><span class="em">${emoji}</span><b>${esc(text)}</b>${icon("chevron-forward", 20)}</button>`;
const colorsOf = (name) => (CATEGORIES[name] || ["✨", look(270)])[1];
const emojiOf = (name) => (CATEGORIES[name] || ["✨"])[0];
const placeTile = (emoji, size = "sm") => `<span class="tile ${size}" style="--cl:#6d28d9;--cd:#c4b5fd" aria-hidden="true">${t(size === "sm" ? "emojiSm" : size === "lg" ? "emojiLg" : "emoji", emoji)}</span>`;
const appTile = (letter, hue) => `<span class="tile sm" style="--cl:${look(hue).light};--cd:${look(hue).dark}" aria-hidden="true">${t("rowTitle", letter)}</span>`;
const back = () => `<button class="round" data-tap aria-label="Back">${icon("chevron-back", 24)}</button>`;

// ---------- example data, built from the captured movements ----------

const SPENT = Object.fromEntries(JUNE);
// Example June limits (no limits exist in the captured workspace).
const LIMITS = [["Comida", 60000000], ["Bebidas del Gym", 20000000], ["Cofee", 25000000], ["Cami 🤍", 50000000]]
  .map(([name, limit]) => ({ name, limit, spent: SPENT[name] || 0, left: limit - (SPENT[name] || 0) }))
  .sort((a, b) => a.left / a.limit - b.left / b.limit);
// Example notification candidates, shaped like bank push notifications.
const READY_STATE = ["Ready", "pos", "checkmark"];
const PICK_STATE = ["Pick a category", "warn", "alert-circle"];
const CANDIDATES = {
  now: [
    { label: "Comida", minor: -4590000, text: "RAPPI*RESTAURANTES", state: READY_STATE },
    { label: null, minor: 25000000, text: "Transferencia de MIGUEL A", state: PICK_STATE },
  ],
  wait: [
    { label: "Cofee", minor: -2170000, text: "STARBUCKS CHICO", state: READY_STATE },
    { label: "Transporte", minor: -1840000, text: "UBER *TRIP", state: READY_STATE },
    { label: "Bebidas del Gym", minor: -1550000, text: "TIENDA D1 PLAZA IMPERIAL", state: READY_STATE },
  ],
};
const READY = [...CANDIDATES.now, ...CANDIDATES.wait].filter((c) => c.state === READY_STATE);
const READY_TOTAL = READY.reduce((sum, c) => sum - c.minor, 0);
// Example recovery plan: the largest June expense.
const RECOVERY = { category: "Grace", title: "Citas 20 mayo y 26 de mayo", principal: 44000000, months: 4, recovered: 11000000, destination: "Davivienda FIC" };
const recoveryEach = (months) => Math.floor(RECOVERY.principal / months);
const progress = RECOVERY.recovered / RECOVERY.principal;
// The places: four named in the captures; balances are examples that sum to the real total.
const PLACES = [
  ["💟", "Nu cajita", "Savings", 4182640306], ["🏦", "Davivienda FIC", "Savings", 1287500000],
  ["👛", "Cash wallet", "Wallet", 18350000], ["💳", "BDB credit card", "Credit card", -15250500],
];
const GREEN = { light: "#047857", dark: "#34d399" };

const STEPS = {};

// ---------- Drafts and notification intake ----------

const candidateRow = (c) => {
  const label = c.label || (c.minor > 0 ? "Money in" : "Needs review");
  const lead = c.label ? emojiTile(c.label, "sm") : iconTile(c.minor > 0 ? "arrow-down" : "alert-circle", c.minor > 0 ? "pos" : "warn", "sm");
  return row({ lead, label, money: signed(c.minor), moneyCls: tone(c.minor), line: status(c.text, { state: c.state }), aria: `Review ${label}, ${signed(c.minor)}, ${statusText(c.text, c.state)}` });
};
const candidatesHead = () => `<header class="head">${back()}<div class="head-copy">${t("eyebrow", "NOTIFICATION INTAKE", "muted")}${t("screen", "Candidates", "", 'role="heading"')}</div></header>`;
STEPS.candidates = () => ({
  body: `<div class="page">${candidatesHead()}
    ${heroBlock(`${READY.length} ready to add`, grouped(READY_TOTAL), { line: status("From notifications on this phone", { clamp: false }) })}
    <button class="warn-link" data-tap aria-label="Read before using intake: a shortcut, not a statement">${icon("warning-outline", 24)}${t("rowTitle", "A shortcut, not a statement")}${chevron()}</button>
    <div class="seg" role="tablist"><button class="seg-item on" data-tap role="tab">${t("action", "Now")}<span class="badge">${t("label", "2")}</span></button><button class="seg-item" data-tap role="tab">${t("action", "Later")}<span class="badge">${t("label", "3")}</span></button></div>
    ${section("Needs you now", pair(CANDIDATES.now.map(candidateRow)))}
    <div class="card" data-group>
      ${row({ lead: iconTile("pulse-outline", "neutral", "sm"), label: "Notification intake", line: status("not reading any app", { state: ["Connected", "pos", "checkmark"] }), aria: "Notification intake, Connected · not reading any app" })}
      ${row({ lead: iconTile("eye-off-outline", "neutral", "sm"), label: "Discarded", line: status("2 notifications, no text kept"), aria: "Discarded, 2 notifications, no text kept" })}
    </div>
    <button class="btn ghost" data-tap>${t("action", "Preview Month Close")}</button></div>`,
  footer: primary(`Confirm ${READY.length} ready`, "checkmark"),
});
STEPS.candidatesEmpty = () => ({
  body: `<div class="page">${candidatesHead()}
    <section class="hero-block"><span class="state pos">${icon("checkmark-circle", 24)}${t("rowTitle", "Review complete", "pos")}</span>${t("screen", "Nothing waiting")}${t("body", "October is ready to close. Candidates never block Month Close.", "muted")}</section>
    <div class="card" data-group>${row({ lead: iconTile("pulse-outline", "neutral", "sm"), label: "Notification intake", line: status("not reading any app", { state: ["Connected", "pos", "checkmark"] }), aria: "Notification intake, Connected · not reading any app" })}</div></div>`,
  footer: primary("Continue to Month Close", "arrow-forward"),
});
STEPS.reconciliation = () => ({
  body: `<div class="page">${header("Before you use intake", "READ ONCE")}
    <section class="hero-block">${leadIcon("warning-outline", "warn")}${t("section", "A shortcut, not a statement")}${t("body", "Notifications can miss, delay or repeat activity.", "muted")}</section>
    ${section("What can go wrong", pair([
      fact(iconTile("notifications-off-outline", "neutral"), "A missing notification", "Leaves activity out"),
      fact(iconTile("refresh-outline", "neutral"), "A repeated one", "Shows up twice"),
      fact(iconTile("receipt-outline", "neutral"), "What settles it", "Your account history"),
    ]))}</div>`,
  footer: primary("I understand", "checkmark"),
});
STEPS.discarded = () => ({
  body: `<div class="page">${header("Discarded", "NOT SAVED AS CANDIDATES")}
    ${t("body", "No text is kept. These go away after 15 days.", "muted")}
    ${section("October 22", pair([
      row({ lead: iconTile("eye-off-outline", "neutral", "sm"), label: "Not a purchase", line: status("A promotion from your bank"), aria: "Not a purchase, A promotion from your bank", tap: false }),
      row({ lead: iconTile("eye-off-outline", "neutral", "sm"), label: "No amount found", line: status("From Nu"), aria: "No amount found, From Nu", tap: false }),
    ]))}</div>`,
  footer: primary("OK, clear them", "checkmark"),
});
STEPS.added = () => ({
  body: `<div class="page center"><span class="moment-icon pos" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "4 records added", "", 'role="heading"')}${t("body", "Each one was checked and posted. The notification text was deleted from this phone.", "muted")}</div>`,
  footer: primary("Back to Candidates", "arrow-forward"),
});
STEPS.intakeMonthClose = () => ({
  body: `<div class="page">${header("Complete October", "BEFORE YOU CONTINUE")}
    <section class="hero-block">${t("label", "Still on this phone", "muted")}${t("screen", "3 candidates")}${t("body", "They don't block Month Close.", "muted")}</section></div>`,
  footer: primary("Review candidates", "arrow-forward") + secondary("Continue anyway"),
});

// ---------- Notification intake (Android), from the updated APK ----------

STEPS.intakeDisclosure = () => ({
  body: `<div class="page">${header("Before you turn it on", "NOTIFICATION INTAKE")}
    <div class="stack loose">
      ${plainRow(iconTile("apps-outline", "accent"), "Only apps you choose", "Lukapp reads nothing else.")}
      ${plainRow(iconTile("lock-closed-outline", "accent"), "Stays on this phone", "Encrypted. Suggestions expire after 15 days.")}
      ${plainRow(iconTile("warning-outline", "warn"), "Can miss or delay alerts", "Every candidate needs your review.")}
    </div>
    <section class="stack">${t("label", "BETA BUILD", "muted")}${t("body", "This beta also keeps the original notification text, encrypted, for 24 hours. It's never uploaded.", "muted")}</section>
    <button class="btn ghost" data-tap>${t("action", "Read the full disclosure")}</button>
    <div class="card" data-group>${choice("I've read this", "Turning it on is the next step", true, { kind: "checkbox" })}</div></div>`,
  footer: primary("Continue", "arrow-forward"),
});
const phoneStatus = (connected) => pair([
  row({ lead: iconTile("notifications-outline", "pos", "sm"), label: "Notification access", line: status("", { state: ["Granted", "pos", "checkmark"] }), aria: "Notification access, Granted", tap: false }),
  row({ lead: iconTile("pulse-outline", "pos", "sm"), label: "Listener", line: status(connected, { state: ["Connected", "pos", "checkmark"] }), aria: `Listener, ${statusText(connected, ["Connected"])}`, tap: false }),
]);
STEPS.intakeHub = () => ({
  body: `<div class="page">${header("Notification intake", "PURCHASE ALERTS")}
    <div class="error-line" role="alert">${icon("alert-circle", 22)}${t("body", "The last change didn't finish. Refresh and try again.")}</div>
    <section class="hero-block">${leadIcon("notifications-off-outline", "warn")}${t("section", "Not reading any app yet")}${status("Access and listener are ready", { clamp: false })}</section>
    ${section("Apps you read from", `${t("body", "No apps yet. Choose the bank apps that send your purchase alerts.", "muted")}`, "220 apps on this phone")}
    ${section("This phone", `${phoneStatus("no alert yet")}${status("Checked today, 3:47 p.m.", { clamp: false })}
      ${secondary("Refresh status", "refresh-outline")}${secondary("Android notification settings", "notifications-outline")}`)}
    <div class="card" data-group>
      ${row({ lead: iconTile("document-text-outline", "neutral", "sm"), label: "Candidate inbox", line: status("0 waiting"), aria: "Candidate inbox, 0 waiting" })}
      ${row({ lead: iconTile("pulse-outline", "neutral", "sm"), label: "Beta diagnostics", line: status("0 records · 0 errors · healthy"), aria: "Beta diagnostics, 0 records · 0 errors · healthy" })}
    </div>
    ${t("status", "Personal · COP · Bogotá", "muted")}
    <button class="btn secondary danger" data-tap="secondary">${icon("trash-outline", 22)}${t("action", "Turn off and wipe")}</button></div>`,
  footer: primary("Add an app", "add"),
});
STEPS.intakeAddApp = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Add an app", "220 ON THIS PHONE")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search apps", "muted")}</label>
    ${section("Likely bank apps", pair([
      choice("Nu", "Banking", true, { lead: appTile("N", 270) }),
      choice("Bancolombia", "Banking", false, { lead: appTile("B", 45) }),
      choice("Davivienda", "Banking", false, { lead: appTile("D", 0) }),
      choice("Banco de Bogotá", "Banking", false, { lead: appTile("B", 210) }),
    ]))}</div>`,
  footer: primary("Next", "arrow-forward"),
});
STEPS.intakePlace = () => ({
  body: `<div class="page">${header("Where do Nu alerts go?", "ADD AN APP")}
    ${status("Personal · COP · Bogotá", { clamp: false })}
    ${pair(PLACES.map(([emoji, name, kind], i) => choice(name, kind, i === 0, { lead: placeTile(emoji) })))}
    ${t("meta", "You can change this later. Other workspaces keep their own place for Nu.", "muted")}</div>`,
  footer: primary("Start reading Nu", "checkmark"),
});
STEPS.intakeReading = () => ({
  body: `<div class="page">${header("Notification intake", "PURCHASE ALERTS")}
    <section class="hero-block">${leadIcon("pulse-outline", "pos-icon")}${t("section", "Reading 1 app")}${status("last alert 3:52 p.m.", { state: ["Working", "pos", "checkmark"] , clamp: false })}</section>
    ${section("Apps you read from", `<div class="card" data-group>${row({ lead: appTile("N", 270), label: "Nu", line: status("To Nu cajita · 2 alerts today"), aria: "Nu, To Nu cajita · 2 alerts today" })}</div>${secondary("Add another app", "add")}`)}
    ${section("This phone", phoneStatus("last alert 3:52 p.m."))}
    <button class="btn secondary danger" data-tap="secondary">${icon("trash-outline", 22)}${t("action", "Turn off and wipe")}</button></div>`,
  footer: primary("Open candidate inbox · 2", "arrow-forward"),
});
STEPS.intakeWipe = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Turn off and wipe?", "NOTIFICATION INTAKE")}
    <div class="stack loose">
      ${plainRow(iconTile("notifications-off-outline", "danger"), "Stops reading every app", "")}
      ${plainRow(iconTile("trash-outline", "danger"), "Deletes what's on this phone", "Candidates and app-to-place choices.")}
      ${plainRow(iconTile("receipt-outline", "neutral"), "Posted entries stay", "")}
    </div></div>`,
  footer: secondary("Turn off and wipe", "trash-outline", "danger") + secondary("Keep it on"),
});

// ---------- Alerts ----------

const limitRow = (j, kind) => row({
  lead: emojiTile(j.name, "sm"), label: j.name,
  money: j.left < 0 ? `${usd(-j.left)} over` : `${usd(j.left)} left`, moneyCls: j.left < 0 ? "danger" : "",
  extra: jar(j.left < 0 ? 1 : j.left / j.limit, colorsOf(j.name), { over: j.left < 0 }),
  line: status(`${usd(j.spent)} of ${usd(j.limit)}`),
  aria: `${j.name}, ${j.left < 0 ? `${usd(-j.left)} over` : `${usd(j.left)} left`}, ${usd(j.spent)} of ${usd(j.limit)}${kind ? `, ${kind}` : ""}`,
});
STEPS.alerts = () => ({
  body: `<div class="page">${header("Alerts", "WHAT NEEDS ATTENTION")}
    ${section("Over the limit", pair(LIMITS.filter((j) => j.left < 0).map((j) => limitRow(j, "over"))), "Act now")}
    ${section("Close to the limit", pair(LIMITS.filter((j) => j.left >= 0 && j.spent / j.limit >= 0.8).map((j) => limitRow(j, "close"))), "80% or more used")}</div>`,
});
STEPS.alertsEmpty = () => ({
  body: `<div class="page">${header("Alerts", "WHAT NEEDS ATTENTION")}
    <section class="hero-block"><span class="state pos">${icon("checkmark-circle", 24)}${t("rowTitle", "All clear", "pos")}</span>${t("section", "Nothing crossed a line")}${t("body", "Your limits are still holding.", "muted")}</section></div>`,
});

// ---------- Plans ----------

STEPS.plans = () => ({
  body: `<div class="page">${header("Plans", "LOOKING AHEAD")}
    <div class="card" data-group>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("flag-outline")}${chevron()}</span>${t("rowTitle", "October budget")}${status("This month's limits", { clamp: false })}</button>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("trending-up-outline", "pos")}${chevron()}</span>${t("rowTitle", "Savings recovery")}${status("Grace · 25% back", { clamp: false })}</button>
    </div></div>`,
});

// ---------- Budgets ----------

STEPS.budget = () => ({
  body: `<div class="page">${header("Budgets", "JUNE")}
    ${section("Limits", pair(LIMITS.map((j) => limitRow(j))), `${LIMITS.length} categories · repeat each month`)}</div>`,
  footer: primary(`Open ${LIMITS.find((j) => j.left < 0).name}`, "arrow-forward") + secondary("Set another limit", "add"),
});
STEPS.budgetEmpty = () => ({
  body: `<div class="page">${header("Budgets", "OCTOBER")}
    <section class="hero-block">${leadIcon("flag-outline", "neutral")}${t("section", "No limits yet")}${t("body", "A limit tells you when a category runs low. It never blocks posting.", "muted")}</section></div>`,
  footer: primary("Set an October limit", "flag-outline"),
});
STEPS.budgetChoose = () => ({
  body: `<div class="page">${header("Choose a category", "BUDGET")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search categories", "muted")}</label>
    ${section("Most spent in June", pair(JUNE.slice(0, 6).map(([name, minor]) => choice(name, `${usd(minor)} in June`, false, { lead: emojiTile(name, "sm") }))))}</div>`,
});
// The month's spending lives in the island, not in a pill above the amount.
const COMPOSE_LIMIT = 80000000;
const composeBody = () => `<div class="page">${header("Limit for Comida", "BUDGET")}
  <section class="amount focused">${t("label", "Stay under", "muted")}${moneyHero("COP", grouped(COMPOSE_LIMIT), { caret: true })}
    ${jar((COMPOSE_LIMIT - SPENT.Comida) / COMPOSE_LIMIT, colorsOf("Comida"), { lg: true })}${status(`${usd(COMPOSE_LIMIT - SPENT.Comida)} still in the jar`, { clamp: false })}</section>
  ${section("Suggested", options([["$600.000"], ["$800.000", true], ["$1.000.000"]]), "Around June's spending")}</div>`;
STEPS.budgetCompose = () => ({
  island: island("🍔", `${usd(SPENT.Comida)} in June`, `Comida, ${usd(SPENT.Comida)} out in June`),
  body: composeBody(),
  footer: primary("Save this limit", "checkmark"),
});
STEPS.budgetComposeDock = () => ({
  scrollTo: ".options",
  overlay: dock("🍔", `${usd(SPENT.Comida)} out in June`, `Comida, ${usd(SPENT.Comida)} out in June`),
  body: composeBody(),
  footer: primary("Save this limit", "checkmark"),
});
STEPS.budgetEdit = () => {
  const j = LIMITS.find((x) => x.name === "Comida");
  return {
    body: `<div class="page">${header("Comida", "JUNE LIMIT")}
      ${heroBlock("Over the limit", grouped(-j.left), { tone: "danger", extra: jar(1, colorsOf("Comida"), { over: true, lg: true }), line: status(`${usd(j.spent)} spent of ${usd(j.limit)}`, { clamp: false }) })}
      ${section("New limit", options([["$600.000"], ["$720.000", true], ["$900.000"]]), "Applies to June and after")}</div>`,
    footer: primary("Save June", "checkmark") + secondary("Close", "close"),
  };
};
STEPS.budgetCross = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Budget would cross", "ALMUERZO EN GOONG")}
    ${titleLine(emojiTile("Comida", "sm"), "Comida")}${t("screen", `${compact(-LIMITS.find((j) => j.name === "Comida").left)} over`, "danger")}
    ${t("body", "Posting still works. A budget never blocks.", "muted")}</div>`,
  footer: primary("Post anyway", "checkmark") + secondary("Reconsider"),
});
STEPS.limitOn = () => ({
  body: `<div class="page center">
    <span class="moment-icon" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "Limit is on", "", 'role="heading"')}
    <div class="stack center-stack">${t("emojiLg", "🍔", "moment-emoji")}${t("section", "Comida")}${t("money", "$800.000 a month")}</div>
    ${t("body", "Alerts will watch this line.", "muted")}</div>`,
  footer: primary("Back to the month", "arrow-forward"),
});

// ---------- Savings recovery ----------

STEPS.recoveryList = () => ({
  body: `<div class="page">${header("Savings recovery", "PLANS")}
    ${section("Active", `<div class="card" data-group>${row({ lead: emojiTile(RECOVERY.category, "sm"), label: RECOVERY.category, money: `${usd(RECOVERY.recovered)} back`, moneyCls: "pos", extra: jar(progress, GREEN), line: status(`${Math.round(progress * 100)}% of ${usd(RECOVERY.principal)}`), aria: `${RECOVERY.category}, ${usd(RECOVERY.recovered)} back, ${Math.round(progress * 100)}% of ${usd(RECOVERY.principal)}` })}</div>`)}</div>`,
  footer: secondary("Find another expense", "search-outline"),
});
STEPS.recoveryPick = () => {
  const picks = MOVEMENTS.filter((m) => m.date.startsWith("June") && !m.transfer && m.minor < 0).sort((a, b) => a.minor - b.minor).slice(0, 4);
  return {
    body: `<div class="page">${header("Expenses to recover", "JUNE CLOSE")}
      ${t("body", "The expense stays posted. You save it back over time.", "muted")}
      ${pair(picks.map((m) => row({ lead: emojiTile(m.category, "sm"), label: m.category, money: signed(m.minor), line: status(`${m.date} · ${m.title}`), aria: `${m.category}, ${signed(m.minor)}, ${m.date} · ${m.title}` })))}</div>`,
  };
};
const destinationChoices = () => pair([choice("Davivienda FIC", "Savings", true, { lead: placeTile("🏦") }), choice("Nu cajita", "Savings", false, { lead: placeTile("💟") })]);
STEPS.recoveryDraft = () => ({
  body: `<div class="page">${header("Plan the recovery", "GRACE · DRAFT")}
    ${heroBlock("Amount to save back", grouped(RECOVERY.principal), { line: status(RECOVERY.title, { clamp: false }) })}
    ${section("Months", pair([4, 6, 8, 12].map((n) => choice(`${n} months`, `${usd(recoveryEach(n))} each`, n === 4))))}
    ${field("Each month, in COP", grouped(recoveryEach(4)), { helper: `Between ${usd(recoveryEach(4))} and ${usd(RECOVERY.principal)}.` })}
    ${section("Save it into", destinationChoices())}
    ${t("meta", "Activating fixes this schedule. Changing it later replaces the plan.", "muted")}</div>`,
  footer: primary("Activate plan", "checkmark"),
});
STEPS.recoveryPlan = () => ({
  body: `<div class="page">${header("Savings recovery", "GRACE · PLAN")}
    ${heroBlock("Saved back so far", grouped(RECOVERY.recovered), { tone: "pos", extra: jar(progress, GREEN, { lg: true }), line: status(`${Math.round(progress * 100)}% · ${usd(RECOVERY.principal - RECOVERY.recovered)} to go`, { clamp: false }) })}
    ${pair([
      fact(iconTile("time-outline", "warn"), "Due this month", usd(recoveryEach(4)), { variant: "money", cls: "warn" }),
      fact(placeTile("🏦", ""), "Saving into", RECOVERY.destination),
      fact(iconTile("calendar-outline", "neutral"), "Original plan", "4 months"),
    ])}
    ${t("meta", "Recovery is a saving plan. It doesn't undo the expense.", "muted")}</div>`,
  footer: primary("Move money for October", "swap-horizontal") + secondary("Find another expense", "search-outline"),
});
STEPS.recoveryMove = () => ({
  body: `<div class="page">${header("Move money", "RECOVERY")}
    <section class="amount focused">${t("label", "Amount", "muted")}${moneyHero("COP", grouped(recoveryEach(4)), { caret: true })}</section>
    ${section("From", pair([choice("Nu cajita", "Savings", true, { lead: placeTile("💟") }), choice("Cash wallet", "Wallet", false, { lead: placeTile("👛") })]))}
    ${pair([fact(iconTile("arrow-down-circle-outline", "pos"), "To", RECOVERY.destination), fact(iconTile("trending-up-outline", "pos"), "Counts toward", "Grace plan")])}
    ${t("meta", "Progress changes only after this transfer posts.", "muted")}</div>`,
  footer: primary("Post transfer", "checkmark"),
});
STEPS.recoveryMoved = () => ({
  body: `<div class="page center"><span class="moment-icon pos" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "Moved", "", 'role="heading"')}${moneyHero("COP", grouped(recoveryEach(4)), { tone: "pos" })}${t("body", "Grace plan · 50% back", "muted")}</div>`,
  footer: primary("View plan", "arrow-forward") + secondary("Back home"),
});

// ---------- Month close ----------

const checklist = () => [
  row({ lead: iconTile("document-text-outline", "pos", "sm"), label: "Drafts", line: status("none waiting", { state: ["Done", "pos", "checkmark"] }), aria: "Drafts, Done · none waiting" }),
  row({ lead: iconTile("pulse-outline", "warn", "sm"), label: "Candidates", line: status("3 still on this phone", { state: ["Warns", "warn", "warning-outline"] }), aria: "Candidates, Warns · 3 still on this phone" }),
  row({ lead: iconTile("wallet-outline", "pos", "sm"), label: "Balances", line: status("6 places", { state: ["Reviewed", "pos", "checkmark"] }), aria: "Balances, Reviewed · 6 places" }),
  row({ lead: iconTile("trending-up-outline", "accent", "sm"), label: "Recovery", money: `${usd(recoveryEach(4))} due`, moneyCls: "warn", line: status("Grace plan"), aria: `Recovery, ${usd(recoveryEach(4))} due, Grace plan` }),
];
STEPS.closeReview = () => ({
  body: `<div class="page">${header("Complete June", "3 STILL NEED REVIEW")}
    ${heroBlock("June spending", grouped(JUNE_OUT), { line: status("Locking doesn't move money", { clamp: false }) })}
    ${section("Before you lock", pair(checklist()))}</div>`,
  footer: primary("Complete and lock June", "lock-closed-outline"),
});
STEPS.closeConfirm = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Lock June?", "LAST CHECK")}
    <div class="stack loose">
      ${plainRow(iconTile("lock-closed-outline", "accent"), "June can't change after this", "")}
      ${plainRow(iconTile("wallet-outline", "neutral"), "Money and balances stay", "")}
      ${plainRow(iconTile("pulse-outline", "warn"), "3 candidates stay for later", "")}
    </div></div>`,
  footer: primary("Complete and lock June", "lock-closed-outline") + secondary("Keep reviewing"),
});
STEPS.closeDone = () => ({
  body: `<div class="page center"><span class="moment-icon" aria-hidden="true">${icon("lock-closed", 32)}</span>${t("screen", "June is complete", "", 'role="heading"')}${t("body", "The month is locked. Balances didn't change.", "muted")}</div>`,
  footer: primary("View June overview", "pie-chart-outline") + secondary("Back home"),
});

// ---------- Places ----------

STEPS.places = () => ({
  top: "band",
  body: `<section class="band"><div class="band-mark" data-bleed aria-hidden="true">${window.ASSETS.brand.symbol}</div>
      <header class="head"><button class="round on-band" data-tap aria-label="Back">${icon("chevron-back", 24)}</button><div class="head-copy">${t("eyebrow", "YOUR PLACES", "muted")}${t("screen", "Places", "", 'role="heading"')}</div></header>
      <div class="hero-button">${t("meta", "What you have now", "muted")}${moneyHero("COP", "56.526.163,06", { floor: "home" })}</div></section>
    <div class="page">${section("Across 6 places", pair(PLACES.map(([emoji, name, kind, minor]) => row({ lead: placeTile(emoji), label: name, money: `${minor < 0 ? "−" : ""}$${grouped(minor)}`, moneyCls: minor < 0 ? "danger" : "", line: status(minor < 0 ? `${kind} · you owe this` : kind), aria: `${name}, ${cop(minor)}, ${minor < 0 ? `${kind} · you owe this` : kind}` }))))}
      <button class="btn ghost" data-tap>${t("action", "View all 6 places")}</button></div>`,
  footer: primary("Add another place", "add"),
});
STEPS.placeDetail = () => ({
  body: `<div class="page">${header("Nu cajita", "PLACE")}
    ${heroBlock("Current balance", grouped(PLACES[0][3]), { line: `<button class="look-top" data-tap aria-label="Change look">${placeTile("💟", "")}${t("rowTitle", "Change look", "accent")}</button>` })}
    ${pair([fact(iconTile("wallet-outline", "neutral"), "Type", "Savings"), fact(iconTile("globe-outline", "neutral"), "Currency", "COP"), fact(iconTile("calendar-outline", "neutral"), "Tracking from", "May 29, 2026")])}
    ${section("Recent", pair(MOVEMENTS.slice(0, 2).map((m) => row({ lead: emojiTile(m.category, "sm"), label: m.category, money: signed(m.minor), line: status(m.title), aria: `${m.category}, ${signed(m.minor)}, ${m.title}` }))))}</div>`,
  footer: primary("See in tx history", "receipt-outline"),
});
STEPS.placeAdd = () => ({
  body: `<div class="page">${header("Add a place", "ANOTHER PLACE")}
    ${field("Name you recognize", "Bancolombia")}
    ${section("Type", options([["Checking", true, placeTile("💰")], ["Savings", false, placeTile("🏦")], ["Wallet", false, placeTile("👛")], ["Credit card", false, placeTile("💳")], ["Loan", false, placeTile("🏠")]]))}
    <div class="field">${t("label", "Look", "muted")}<button class="option" data-tap="secondary">${placeTile("💰")}${t("action", "Money bag")}${t("status", "Change", "accent")}</button></div>
    ${field("Balance today, in COP", "1.250.000")}</div>`,
  footer: primary("Add this place", "checkmark"),
});
STEPS.emojiSheet = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Pick a look", "NU CAJITA")}
    <div class="emoji-grid" role="radiogroup">${["💟", "💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗", "🎓"].map((e, i) => `<button class="emoji-btn ${i === 0 ? "on" : ""}" data-tap aria-label="Emoji ${e}" role="radio">${t("emoji", e)}</button>`).join("")}</div>
    <button class="btn secondary" data-tap="secondary">${icon("happy-outline", 22)}${t("action", "Any emoji")}</button></div>`,
  footer: primary("Use this look", "checkmark"),
});
STEPS.secondPlace = () => ({
  body: `<div class="page center"><span class="moment-icon" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "A second place", "", 'role="heading"')}
    <div class="stack center-stack">${t("emojiLg", "🏦", "moment-emoji")}${t("section", "Davivienda FIC")}</div>
    ${t("body", "Moving money between places is on, and any category can take a limit.", "muted")}</div>`,
  footer: primary("Back to the month", "arrow-forward"),
});

// ---------- Settings and categories ----------

STEPS.settings = () => ({
  body: `<div class="page">${header("Ernesto", "USER & WORKSPACE")}
    ${section("Appearance", `<div class="seg" role="radiogroup"><button class="seg-item on" data-tap>${icon("sunny-outline", 20)}${t("action", "Light")}</button><button class="seg-item" data-tap>${icon("moon-outline", 20)}${t("action", "Dark")}</button></div>`)}
    <div class="card" data-group>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("home-outline")}${chevron()}</span>${t("rowTitle", "My finances")}${status("Personal · COP · 6 places", { clamp: false })}</button>
      <button class="dest" data-item data-tap><span class="dest-top">${iconTile("pricetag-outline")}${chevron()}</span>${t("rowTitle", "Categories")}${status("33 categories", { clamp: false })}</button>
    </div>
    <button class="btn secondary danger" data-tap="secondary">${icon("log-out-outline", 22)}${t("action", "Sign out")}</button>
    <div class="settings-brand"><span class="lockup only-light" aria-label="Lukapp">${window.ASSETS.brand.lockup}</span><span class="lockup only-dark" aria-label="Lukapp">${window.ASSETS.brand.lockupInv}</span></div></div>`,
});
const CATEGORY_NAMES = Object.keys(CATEGORIES).filter((name) => !["Rendimientos", "Nu cajita"].includes(name));
const navRow = (lead, label) => row({ lead, label, aria: label });
STEPS.categories = () => ({
  body: `<div class="page">${header("Categories", "MAKE THEM YOURS")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search", "muted")}</label>
    ${section("Money out", pair(CATEGORY_NAMES.slice(0, 6).map((name) => navRow(emojiTile(name, "sm"), name))), "32 categories")}
    ${section("Money in", pair([navRow(emojiTile("Rendimientos", "sm"), "Rendimientos")]), "1 category")}</div>`,
  footer: primary("Add category", "add"),
});
// The live look preview lives in the island while the form scrolls.
STEPS.categoryEdit = () => {
  const swatches = [15, 30, 150, 210, 270, 345, 45, -1];
  return {
    island: island("🍔", "Comida", "Preview, Comida"),
    body: `<div class="page">${header("Comida", "EDIT CATEGORY")}
      ${field("Category name", "Comida")}
      ${section("Emoji", `<div class="emoji-grid">${["🍔", "🛒", "🚌", "🏠", "💊", "🎮", "🛍️", "✨"].map((e, i) => `<button class="emoji-btn ${i === 0 ? "on" : ""}" data-tap aria-label="Emoji ${e}">${t("emoji", e)}</button>`).join("")}</div>`)}
      ${section("Colour", `<div class="swatches">${swatches.map((hue, i) => { const c = hue < 0 ? look(0, 1) : look(hue); return `<button class="swatch ${i === 0 ? "on" : ""}" data-tap aria-label="Colour ${i + 1}" style="--cl:${c.light};--cd:${c.dark}">${i === 0 ? tick(24) : ""}</button>`; }).join("")}</div>`, "28 colours")}
      ${section("What happens to the money?", pair([choice("Money out", "It's spent", true), choice("It is still mine", "Saved or owed", false)]))}
      <button class="btn secondary danger" data-tap="secondary">${icon("trash-outline", 22)}${t("action", "Delete category")}</button></div>`,
    footer: primary("Save changes", "checkmark"),
  };
};
STEPS.categoryPicker = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Category", "UP TO THREE")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search", "muted")}</label>
    ${pair(["Transporte", "Comida", "Cofee", "Bebidas del Gym"].map((name, i) => choice(name, i === 0 ? "Primary" : "", i < 2, { lead: emojiTile(name, "sm"), kind: "checkbox" })))}
    <button class="btn secondary" data-tap="secondary">${icon("add", 22)}${t("action", "Add your own")}</button></div>`,
  footer: primary("Done", "checkmark"),
});

// ---------- Setup and first run (setup approved as is) ----------

// Proposal only: the chosen splash lives in design/connecting/. This keeps its
// halo, stroked wordmark and status copy, and scales the promise for XXXL.
STEPS.splash = () => ({
  top: "splash-top",
  body: `<div class="splash"><span class="splash-mark" aria-hidden="true"><span class="halo"></span>${window.ASSETS.brand.symbol}</span>
    <span class="splash-word" aria-label="Lukapp">${window.ASSETS.brand.wordmark}</span>${t("section", "Las lucas tienen un para qué.")}
    ${t("status", "Unlocking Lukapp…", "soft-status", 'role="status"')}${t("meta", "Tus lucas. Tu manera de vivir.")}</div>`,
});
STEPS.setup = () => ({
  body: `<div class="page"><header class="sheet-head"><div class="head-copy">${t("eyebrow", "SETUP · ONE SHEET", "muted")}${t("screen", "Where does your money go?", "", 'role="heading"')}</div><button class="round" data-tap aria-label="Cancel setup">${icon("close", 22)}</button></header>
    ${section("Your categories", pair(["Comida", "Transporte", "Cofee", "Mercado", "Servicios", "Familia"].map((name, i) => choice(name, "", i < 4, { lead: emojiTile(name, "sm"), kind: "checkbox" }))), "Tap to pick. Hold one to edit.")}
    ${field("What you have now, in COP", "56.526.163")}
    ${section("Currency", chips([["COP", true], ["USD"], ["More", false, true]]))}
    ${section("Purchase alerts", pair([choice("Use them", "Alerts become drafts you confirm", true, { detailVariant: "meta" }), choice("Not now", "You add drafts yourself", false, { detailVariant: "meta" })]))}</div>`,
  footer: primary("Start tracking", "arrow-forward"),
});
STEPS.setupDone = () => ({
  body: `<div class="page center"><span class="moment-icon" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "You're set", "", 'role="heading"')}${t("body", "Purchase alerts can become drafts.", "muted")}</div>`,
  footer: primary("Go to home", "arrow-forward"),
});

// ---------- Access and devices (lock screen approved as is) ----------

STEPS.locked = () => ({
  body: `<div class="page center"><span class="lockup only-light" aria-label="Lukapp">${window.ASSETS.brand.lockup}</span><span class="lockup only-dark" aria-label="Lukapp">${window.ASSETS.brand.lockupInv}</span>
    <span class="moment-icon" aria-hidden="true">${icon("lock-closed", 32)}</span>${t("screen", "Lukapp is locked", "", 'role="heading"')}${t("body", "Use your fingerprint or screen lock.", "muted")}</div>`,
  footer: primary("Unlock Lukapp", "finger-print") + secondary("Sign in instead"),
});
STEPS.nameDevice = () => ({
  body: `<div class="page">${header("Name this device", "YOUR DEVICES", false)}
    ${field("Device name", "My Android phone", { helper: "You'll see this name if you use Lukapp on another phone." })}</div>`,
  footer: primary("Register device", "checkmark") + secondary("Sign out", "log-out-outline"),
});
STEPS.otherDevice = () => ({
  body: `<div class="page">${header("Another phone uses Lukapp", "YOUR DEVICES", false)}
    ${pair([fact(iconTile("phone-portrait-outline", "neutral"), "In use now", "Ernesto's S21"), fact(iconTile("phone-portrait-outline", "accent"), "This phone", "My Android phone")])}
    ${t("body", "Lukapp runs on one phone at a time. Moving access signs the other phone out.", "muted")}</div>`,
  footer: primary("Use this phone instead", "swap-horizontal") + secondary("Keep using Ernesto's S21"),
});
STEPS.accessError = () => ({
  body: `<div class="page center"><span class="moment-icon bad" aria-hidden="true">${icon("alert-circle", 44)}</span>${t("screen", "This phone lost access", "", 'role="heading"')}
    ${t("body", "Its access was turned off. Your data is safe.", "muted")}
    <div class="stack loose left">
      ${plainRow(`<span class="step-dot" aria-hidden="true">${t("rowTitle", "1")}</span>`, "Sign out", "")}
      ${plainRow(`<span class="step-dot" aria-hidden="true">${t("rowTitle", "2")}</span>`, "Sign in again", "This phone registers again.")}
    </div></div>`,
  footer: primary("Sign out", "log-out-outline") + secondary("Check again", "refresh-outline"),
});

// ---------- History: sort and filter, one filter at a time (chosen) ----------

const SORTS = [["Date · newest first", true], ["Amount"], ["Place"], ["Category"]];
const DATES = [["All time", true], ["Last 7 days"], ["October"], ["September"], ["Pick dates"]];
const filterRow = (lead, label, value) => row({ lead, label, line: status(value), aria: `${label}, ${value}` });
STEPS.filterB = () => ({
  body: `<div class="page">${header("Tx history", "ACROSS ALL PLACES")}
    ${section("Showing", `${pair([
      filterRow(iconTile("swap-vertical", "accent", "sm"), "Sort", "Newest first"),
      filterRow(iconTile("wallet-outline", "neutral", "sm"), "Places", "All 6 places"),
      filterRow(iconTile("pricetag-outline", "neutral", "sm"), "Categories", "All 33"),
      filterRow(iconTile("calendar-outline", "neutral", "sm"), "Dates", "All time"),
    ])}`, "53 movements")}</div>`,
});
STEPS.filterBDates = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Dates", "FILTER TX HISTORY")}${options(DATES)}</div>`,
  footer: primary("Show 53 movements", "checkmark"),
});
STEPS.filterBSort = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Sort", "TX HISTORY")}${options(SORTS)}${t("status", "Tap the chosen one to flip the order.", "muted")}</div>`,
  footer: primary("Show 53 movements", "checkmark"),
});

// ---------- Other pieces of the D3 screens ----------

STEPS.reverse = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Reverse Barbero?", "ENTRY DETAILS")}
    ${t("body", "Lukapp adds an opposite entry. Nothing is deleted.", "muted")}
    <div class="stack loose">
      ${row({ lead: emojiTile("Personal Care", "sm"), label: "Barbero stays", money: "−$80.000", line: status("May 29 · posted"), aria: "Barbero stays, −$80.000, May 29 · posted", tap: false })}
      ${row({ lead: iconTile("arrow-undo-outline", "pos", "sm"), label: "A reversal is added", money: "+$80.000", moneyCls: "pos", line: status("May 29, or the first open day"), aria: "A reversal is added, +$80.000, May 29, or the first open day", tap: false })}
    </div>
    <section class="hero-block">${t("label", "Net effect", "muted")}${t("screen", "$0")}</section></div>`,
  footer: secondary("Reverse entry", "arrow-undo-outline", "danger") + secondary("Keep entry"),
});
STEPS.transfer = () => ({
  body: `<div class="page">${header("Post money", "NEW ENTRY")}
    ${segmented("one")}
    <section class="amount">${moneyHero("COP", "152.505")}<span class="amount-tone">${icon("swap-horizontal", 20)}${t("meta", "Moves between places", "muted")}</span></section>
    ${chips([["Normal"], ["Transfer", true], ["Initial balance", false, true]])}
    ${section("Between", pair([row({ lead: placeTile("💟"), label: "From", line: status("Nu cajita"), aria: "From, Nu cajita" }), row({ lead: placeTile("💳"), label: "To", line: status("BDB credit card"), aria: "To, BDB credit card" })]))}
    <button class="btn secondary" data-tap="secondary">${icon("swap-vertical", 22)}${t("action", "Swap From and To")}</button>
    ${t("meta", "Paying a card or loan? Choose it in To. Transfers don't need a category.", "muted")}</div>`,
  footer: primary("Confirm From and To", "checkmark"),
});
STEPS.posted = () => ({
  body: `<div class="page center"><span class="moment-icon pos" aria-hidden="true">${icon("checkmark", 34)}</span>${t("screen", "Posted", "", 'role="heading"')}${moneyHero("COP", "−32.050")}
    <div class="stack center-stack">${titleLine(emojiTile("Transporte", "sm"), "Transporte")}${t("body", "Carro hasta mi casa desde plaza imperial", "muted")}</div></div>`,
  footer: primary("Done", "checkmark") + secondary("Post another", "add"),
});
