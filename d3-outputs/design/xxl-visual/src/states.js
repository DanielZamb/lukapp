// D5: the remaining sheets and states, in the D4 design system.
// Loaded after flows.js, whose helpers (row, status, options, choice,
// heroBlock, sheetHead, …) and example data it reuses.

const disabled = (html) => html.replace('data-tap="primary"', 'data-tap="primary" aria-disabled="true"');
// A notice: a short title in colour, then the explanation in smaller, uncapped text.
const notice = (tone, iconName, title, detail = "") => `<div class="notice ${tone}" role="${tone === "danger" ? "alert" : "status"}"><span class="notice-title">${icon(iconName, 22)}${t("rowTitle", title)}</span>${detail ? t("meta", detail, "muted") : ""}</div>`;
const errorLine = (title, detail) => notice("danger", "alert-circle", title, detail);
const warnLine = (title, detail) => notice("warn", "warning-outline", title, detail);
const skeleton = (w, h = 18) => `<span class="skeleton" style="width:${w};height:${h}px" aria-hidden="true"></span>`;
const centered = (iconHtml, title, body, extra = "") => `<div class="page center">${iconHtml}${t("screen", title, "", 'role="heading"')}${body ? t("body", body, "muted") : ""}${extra}</div>`;
const lockup = () => `<span class="lockup only-light" aria-label="Lukapp">${window.ASSETS.brand.lockup}</span><span class="lockup only-dark" aria-label="Lukapp">${window.ASSETS.brand.lockupInv}</span>`;

const STATES = {};

// ---------- Home ----------

STATES.homeActions = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("What do you want to do?", "COP 56.526.163,06")}
    <div class="card" data-group>
      ${row({ lead: iconTile("create-outline", "accent", "sm"), label: "Post money", line: status("Money in or out"), aria: "Post money, Money in or out" })}
      ${row({ lead: iconTile("wallet-outline", "accent", "sm"), label: "Create a place", line: status("Another pocket for money"), aria: "Create a place, Another pocket for money" })}
    </div></div>`,
});
// Over a limit: behind the bell (user decision). The bell gets an amber dot and opens Alerts (D4).
STATES.homeAlert = () => {
  const view = SCREENS.home();
  const bell = `<button class="round on-band has-alert" data-tap aria-label="Alerts, 1 needs attention">${icon("notifications-outline", 24)}<span class="alert-dot" aria-hidden="true"></span></button>`;
  return { ...view, body: view.body.replace(/<button class="round on-band" data-tap aria-label="Alerts, nothing needs attention">.*?<\/button>/, bell) };
};
STATES.homeLoading = () => ({
  top: "band",
  body: `<section class="band"><div class="band-mark" data-bleed aria-hidden="true">${window.ASSETS.brand.symbol}</div>
      <div class="band-head"><div class="brand">${lockup()}${t("eyebrow", "THIS MONTH", "muted")}</div></div>
      <div class="hero-button" role="status" aria-label="Getting your lucas">${t("meta", "What you have now", "muted")}${skeleton("40%", 22)}${skeleton("88%", 48)}${t("status", "Getting your lucas…", "muted")}</div></section>
    <div class="page">${skeleton("100%", 150)}${skeleton("100%", 120)}</div>`,
  footer: primary("Post money", "add"),
});

// ---------- Post ----------

STATES.placePicker = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Place", "POST MONEY")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search places", "muted")}</label>
    ${pair(PLACES.map(([emoji, name, kind], i) => choice(name, kind, i === 0, { lead: placeTile(emoji) })))}
    ${secondary("Add a place", "add")}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.datePicker = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Date occurred", "POST MONEY")}
    ${options([["Today · October 24", true], ["Yesterday · October 23"], ["Pick a date", false, iconTile("calendar-outline", "neutral", "sm")]])}
    ${t("status", "Pick a date opens your phone's calendar.", "muted")}</div>`,
  footer: primary("Done", "checkmark"),
});
const postFormBody = ({ eyebrow, title, description, extra = "", top = "" }) => `<div class="page">${header(title, eyebrow)}${top}
  <section class="amount">${moneyHero("COP", "−32.050")}<span class="amount-tone">${icon("arrow-up", 20)}${t("meta", "Money out", "muted")}</span></section>
  ${chips([["Normal", true], ["Transfer"], ["Initial balance", false, true]])}
  <div class="field">${t("label", "Description", "muted")}<span class="input" data-tap="input">${description ? t("body", description) : t("body", "What was it", "muted")}</span>${extra}</div>
  ${section("Entry details", pair([
    row({ lead: placeTile("💟"), label: "Place", line: status("Nu cajita"), aria: "Place, Nu cajita" }),
    row({ lead: emojiTile("Transporte", "sm"), label: "Category", line: status("Transporte"), aria: "Category, Transporte" }),
    row({ lead: iconTile("calendar-outline", "neutral", "sm"), label: "Date", line: status("Today · October 24"), aria: "Date, Today · October 24" }),
  ]))}</div>`;
STATES.batchEditor = () => ({
  body: postFormBody({ eyebrow: "BATCH · 3 DRAFTS", title: "Add to batch", description: "Carro hasta mi casa desde plaza imperial" }),
  footer: primary("Add to batch", "add"),
});
STATES.postBlocked = () => ({
  body: postFormBody({ eyebrow: "NEW ENTRY", title: "Post money", description: "", extra: "" }),
  footer: warnLine("Add a description to post") + disabled(primary("Post", "checkmark")),
});
STATES.postRetry = () => ({
  body: postFormBody({ eyebrow: "NEW ENTRY", title: "Post money", description: "Carro hasta mi casa desde plaza imperial", top: errorLine("Couldn't post yet", "It's saved for retry. These answers stay fixed until it posts.") }),
  footer: primary("Retry posting", "refresh-outline"),
});
STATES.candidateGone = () => ({
  body: centered(`<span class="moment-icon soft" aria-hidden="true">${icon("eye-off-outline", 34)}</span>`, "This candidate is gone", "It's no longer on this phone. Candidates expire after 15 days."),
  footer: primary("Open Drafts", "arrow-forward"),
});

// ---------- Categories while posting ----------

STATES.pickerLimit = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Category", "UP TO THREE")}
    ${warnLine("Three is the most", "Remove one, or make one that covers them.")}
    ${pair(["Comida", "Cofee", "Snacks", "Bebidas del Gym"].map((name, i) => choice(name, i === 0 ? "Primary" : "", i < 3, { lead: emojiTile(name, "sm"), kind: "checkbox" })))}
    ${secondary("Make one that covers them", "layers-outline")}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.primary = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Which one is primary?", "CATEGORY")}
    ${t("body", "Each one still counts the full amount.", "muted")}
    ${pair(["Comida", "Cofee"].map((name, i) => choice(name, "", i === 0, { lead: emojiTile(name, "sm") })))}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.encompassing = () => ({
  island: island("🍽️", "Salidas", "Preview, Salidas"),
  body: `<div class="page">${header("One that covers them", "CATEGORY")}
    ${field("Name", "Salidas")}
    ${t("status", "Replaces Comida, Cofee and Snacks on this entry.", "muted", 'role="note"')}
    ${section("Emoji", `<div class="emoji-grid">${["🍽️", "🍔", "☕️", "🧋", "🎉", "🛍️", "✨", "🌮"].map((e, i) => `<button class="emoji-btn ${i === 0 ? "on" : ""}" data-tap aria-label="Emoji ${e}">${t("emoji", e)}</button>`).join("")}</div>`)}</div>`,
  footer: primary("Create and use it", "checkmark"),
});
STATES.categoryCreate = () => ({
  island: island("🎾", "Tenis", "Preview, Tenis"),
  body: `<div class="page">${header("Add category", "YOUR OWN")}
    ${field("Name", "Tenis")}
    ${section("What happens to the money?", options([["I spend it", true], ["I receive it"], ["It is still mine"], ["I pay a debt"]]), "Suggested from the name. You can change it.")}
    ${section("Emoji", `<div class="emoji-grid">${["🎾", "🛒", "🚌", "🏠", "💊", "🎮", "🛍️", "✨"].map((e, i) => `<button class="emoji-btn ${i === 0 ? "on" : ""}" data-tap aria-label="Emoji ${e}">${t("emoji", e)}</button>`).join("")}</div>`)}</div>`,
  footer: primary("Add category", "add"),
});
STATES.categoryDelete = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Delete Comida?", "CATEGORY")}
    <div class="stack loose">
      ${plainRow(iconTile("eye-off-outline", "danger"), "It won't show when you pick", "")}
      ${plainRow(iconTile("receipt-outline", "neutral"), "Your entries keep it", "Amounts stay in your history.")}
    </div></div>`,
  footer: secondary("Delete category", "trash-outline", "danger") + secondary("Keep category"),
});

// ---------- Setup ----------

STATES.currencies = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Currency", "SETUP")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search by code or name", "muted")}</label>
    ${pair([choice("COP", "Colombian peso", true), choice("USD", "US dollar", false), choice("EUR", "Euro", false), choice("MXN", "Mexican peso", false)])}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.timeZone = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Time zone", "SETUP")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "Search time zones", "muted")}</label>
    ${pair([choice("Bogotá", "GMT−5 · America/Bogota", true), choice("Mexico City", "GMT−6", false), choice("New York", "GMT−4", false), choice("Madrid", "GMT+2", false)])}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.setupRestyle = () => ({
  sheet: true,
  island: island("☕️", "Cofee", "Preview, Cofee"),
  body: `<div class="page">${sheetHead("Cofee", "EDIT IN SETUP")}
    ${field("Name", "Cofee")}
    ${section("Emoji", `<div class="emoji-grid">${["☕️", "🍵", "🥤", "🧋", "🍰", "🥐", "✨", "🫖"].map((e, i) => `<button class="emoji-btn ${i === 0 ? "on" : ""}" data-tap aria-label="Emoji ${e}">${t("emoji", e)}</button>`).join("")}</div>`)}</div>`,
  footer: primary("Done", "checkmark"),
});
STATES.setupSaved = () => ({
  body: `<div class="page">${header("Basic setup is saved", "SETUP", false)}
    ${t("body", "Now add the place you chose, or add it later.", "muted")}
    <div class="card" data-group>${row({ lead: placeTile("🏦"), label: "Davivienda FIC", line: status("Savings · not added yet"), aria: "Davivienda FIC, Savings · not added yet", tap: false })}</div>
    ${t("meta", "Don't count its balance in what you have now.", "muted")}</div>`,
  footer: primary("Add Davivienda FIC", "add") + secondary("Add it later"),
});
STATES.setupError = () => ({
  body: `<div class="page">${errorLine("Setup couldn't be confirmed", "Retry with the same answers.")}
    <header class="sheet-head"><div class="head-copy">${t("eyebrow", "SETUP · ONE SHEET", "muted")}${t("screen", "Where does your money go?", "", 'role="heading"')}</div></header>
    ${t("meta", "Your answers stay fixed until setup is confirmed.", "muted")}
    ${section("Your categories", pair(["Comida", "Transporte"].map((name) => choice(name, "", true, { lead: emojiTile(name, "sm"), kind: "checkbox" }))))}
    ${field("What you have now, in COP", "56.526.163")}</div>`,
  footer: primary("Retry setup", "refresh-outline") + secondary("Cancel setup"),
});

// ---------- This phone (Clerk draws sign-in itself) ----------

STATES.confirming = () => ({
  body: centered(`<div class="signin-brand">${lockup()}</div><span class="splash-ring dark-ring" role="progressbar" aria-label="Confirming device access"></span>`, "Checking this phone", "Confirming device access…"),
});
STATES.biometrics = () => ({
  body: centered(`<span class="moment-icon" aria-hidden="true">${icon("finger-print", 36)}</span>`, "Lukapp is locked", "Use your fingerprint or face. A PIN can't open Lukapp."),
  footer: primary("Unlock Lukapp", "finger-print") + secondary("Sign in instead"),
});
STATES.reauth = () => ({
  body: centered(`<span class="moment-icon" aria-hidden="true">${icon("person-outline", 36)}</span>`, "Sign in again", "Then set up your fingerprint or face to open Lukapp."),
  footer: primary("Sign in again", "arrow-forward"),
});
STATES.accessMoved = () => ({
  body: centered(`<span class="moment-icon soft" aria-hidden="true">${icon("phone-portrait-outline", 36)}</span>`, "Access moved to Ernesto's S21", "Removing Lukapp data from this phone and signing out…", `<span class="splash-ring dark-ring" role="progressbar" aria-label="Removing local data"></span>`),
});
STATES.cleanupFailed = () => ({
  body: centered(`<span class="moment-icon bad" aria-hidden="true">${icon("alert-circle", 44)}</span>`, "Cleanup didn't finish", "Your information stays locked on this phone."),
  footer: primary("Retry cleanup", "refresh-outline"),
});
STATES.protectionUnavailable = () => ({
  body: centered(`<span class="moment-icon soft" aria-hidden="true">${icon("shield-checkmark-outline", 36)}</span>`, "Phone protection unavailable", "Your information stays locked. Check this phone's security and storage, then close and reopen Lukapp."),
});
STATES.unsupported = () => ({
  body: centered(`<span class="moment-icon soft" aria-hidden="true">${icon("phone-portrait-outline", 36)}</span>`, "This build can't register phones", "Install the Lukapp app from the store to use it on this phone."),
  footer: secondary("Sign out", "log-out-outline"),
});

// ---------- States in screens already drawn ----------

STATES.overviewBars = () => {
  const max = JUNE[0][1];
  const bar = ([name, minor]) => row({ lead: emojiTile(name, "sm"), label: name, money: usd(minor), extra: jar(minor / max, colorsOf(name)), line: status(`${Math.round(minor / JUNE_OUT * 100)}% of June`), aria: `${name}, ${usd(minor)}, ${Math.round(minor / JUNE_OUT * 100)}% of June`, tap: false });
  return {
    body: `<div class="page">${header("Overview", "JUNE")}
      <div class="seg" role="radiogroup"><button class="seg-item" data-tap>${icon("list-outline", 20)}${t("action", "List")}</button><button class="seg-item on" data-tap>${icon("bar-chart-outline", 20)}${t("action", "Bars")}</button></div>
      ${section("Where it went", pair(JUNE.slice(0, 4).map(bar)), "Longest bar is the most spent")}
      <button class="btn ghost" data-tap>${t("action", "View all 33 categories")}</button></div>`,
  };
};
STATES.historyNoMatch = () => ({
  body: `<div class="page">${header("Tx history", "ACROSS ALL PLACES")}
    <label class="search" data-tap="input">${icon("search-outline", 22, "muted")}${t("body", "starbucks")}</label>
    ${pair([row({ lead: iconTile("calendar-outline", "accent", "sm"), label: "Dates", line: status("October"), aria: "Dates, October" })])}
    <section class="hero-block">${leadIcon("search-outline", "neutral")}${t("section", "Nothing matches")}${t("body", "Search covers the 53 loaded movements.", "muted")}${secondary("Load more", "refresh-outline")}</section></div>`,
  footer: primary("Clear filters", "close"),
});
STATES.historyEmpty = () => ({
  body: `<div class="page">${header("Tx history", "ACROSS ALL PLACES")}
    <section class="hero-block">${leadIcon("receipt-outline", "neutral")}${t("section", "Nothing posted yet")}${t("body", "Everything you post shows up here, newest first.", "muted")}</section></div>`,
  footer: primary("Post money", "add"),
});
STATES.historyMore = () => ({
  scrollTo: ".more-end",
  body: `<div class="page">${header("Tx history", "ACROSS ALL PLACES")}
    <section class="day"><div class="day-head"><span class="day-line">${t("section", "May 29", "", 'role="heading"')}${t("money", "−$92K", "muted")}</span></div>
      ${pair(MOVEMENTS.slice(-2).map((m) => row({ lead: emojiTile(m.category, "sm"), label: m.category, money: signed(m.minor), line: status(m.title), aria: `${m.category}, ${signed(m.minor)}, ${m.title}` })))}</section>
    <section class="stack more-end">${t("status", "53 loaded · there's more", "muted")}${secondary("Load more", "refresh-outline")}</section></div>`,
});
STATES.entryReversed = () => ({
  body: `<div class="page">
    <section class="summary">
      <span class="direction">${iconTile("arrow-up", "neutral")}${t("label", "MONEY OUT", "muted")}</span>
      ${t("name", "Barbero", "", 'role="heading"')}
      ${moneyHero("COP", "−80.000")}
      <span class="state">${icon("arrow-undo-outline", 22, "muted")}${t("rowTitle", "Reversed on May 29", "muted")}</span>
    </section>
    ${section("About this entry", pair([
      fact(iconTile("calendar-outline", "neutral"), "When", "May 29"),
      fact(emojiTile("Personal Care"), "Category", "Personal Care"),
    ]))}</div>`,
  footer: secondary("View reversal", "arrow-forward") + secondary("Close details", "close"),
});
STATES.recoverySuspended = () => ({
  body: `<div class="page">${header("Savings recovery", "GRACE · PLAN")}
    ${warnLine("Plan suspended", "The original expense was reversed.")}
    ${heroBlock("Saved back so far", grouped(RECOVERY.recovered), { tone: "pos", extra: jar(progress, GREEN, { lg: true }), line: status("That money stays in your accounts.", { clamp: false }) })}</div>`,
  footer: secondary("Pick another", "search-outline"),
});
STATES.recoveryNoSavings = () => ({
  body: `<div class="page">${header("Plan the recovery", "GRACE · DRAFT")}
    ${heroBlock("Amount to save back", grouped(RECOVERY.principal), { line: status(RECOVERY.title, { clamp: false }) })}
    ${section("Save it into", `${warnLine("No savings place yet", "Add one to save the money back into.")}${secondary("Add a savings place", "add")}`)}</div>`,
  footer: disabled(primary("Activate plan", "checkmark")),
});
STATES.closeMismatch = () => ({
  body: centered(`<span class="moment-icon soft" aria-hidden="true">${icon("calendar-outline", 36)}</span>`, "Months don't match yet", "This phone and your workspace disagree on the current month. Refresh in a moment."),
  footer: primary("Refresh", "refresh-outline"),
});
STATES.closeFailed = () => ({
  sheet: true,
  body: `<div class="page">${sheetHead("Lock June?", "LAST CHECK")}
    ${errorLine("Couldn't confirm the close", "Retrying locks the same month safely.")}</div>`,
  footer: primary("Retry close", "refresh-outline") + secondary("Keep reviewing"),
});
