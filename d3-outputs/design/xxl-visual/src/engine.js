// D3 engine: Android type model, phone frames, hero fit, scroll measurement, audit.

// Android 14 non-linear font scaling (AOSP FontScaleConverterFactory). Checked
// against D2's captures: a 44 sp hero line box is 52.1 dp at 2.0 (model: 52.0).
const NONLINEAR = {
  "1.3": [[8, 10.4], [10, 13], [12, 15.6], [14, 18.8], [18, 21.6], [20, 23.6], [24, 26.4], [30, 30], [100, 100]],
  "2.0": [[8, 16], [10, 20], [12, 24], [14, 26], [18, 30], [20, 34], [24, 36], [30, 38], [100, 100]],
};

function nonlinear(sp, scale) {
  const table = NONLINEAR[scale];
  const sign = sp < 0 ? -1 : 1;
  const value = Math.abs(sp);
  if (value <= table[0][0]) return sign * value * table[0][1] / table[0][0];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    if (value <= x1) return sign * (y0 + (value - x0) * (y1 - y0) / (x1 - x0));
  }
  return sp;
}

// React Native PixelUtil.toPixelFromSP(value, maxFontSizeMultiplier): a cap
// below the system scale scales linearly by the cap; otherwise Android's curve.
function toDp(sp, scale, cap) {
  return cap && cap < Number(scale) ? sp * cap : nonlinear(sp, scale);
}

// XXXL text variants from apps/mobile/src/ui/typography.ts: weight, size, line, tracking, cap.
const VARIANTS = {
  hero: [600, 44, 44 * 1.04, -0.05 * 44, 1.2],
  screen: [600, 32, 32 * 1.1, -0.045 * 32, 1.25],
  name: [600, 30, 30 * 1.12, -0.04 * 30, 1.25],
  section: [600, 20, 20 * 1.25, -0.025 * 20, 1.35],
  money: [600, 18, 18 * 1.2, -0.035 * 18, 1.5],
  rowTitle: [600, 16, 16 * 1.3, -0.02 * 16, 1.5],
  body: [400, 16, 16 * 1.45, -0.01 * 16, null],
  action: [600, 17, 17 * 1.25, -0.015 * 17, 1.4],
  meta: [400, 14, 14 * 1.4, 0, null],
  label: [500, 12, 12 * 1.35, 0, null],
  // Nav eyebrows above a screen title: capped at 1.3 so they stay clearly
  // smaller than the title (user feedback, D4 round 3).
  eyebrow: [500, 12, 12 * 1.35, 0.04 * 12, 1.3],
  // Status lines (D4 round 2): short facts under a row, capped at 1.3 so they
  // read as they do at 1.3 and stay on one line. Prose keeps body or meta.
  status: [400, 14, 14 * 1.35, 0, 1.3],
  emoji: [400, 22, 26, 0, 1.3],
  emojiSm: [400, 16, 20, 0, 1.3],
  emojiLg: [400, 30, 36, 0, 1.3],
};

function applyType(root, scale) {
  root.querySelectorAll("[data-v]").forEach((el) => {
    const [weight, size, line, tracking, cap] = VARIANTS[el.dataset.v];
    el.style.fontWeight = weight;
    el.style.fontSize = `${toDp(size, scale, cap)}px`;
    el.style.lineHeight = `${toDp(line, scale, cap)}px`;
    el.style.letterSpacing = `${toDp(tracking, scale, cap)}px`;
  });
}

// Today's Home hero: RN Text with ui.hero (no cap), letterSpacing -1.2 and
// adjustsFontSizeToFit in one line over the 288 dp column.
function todayHomeHero(scale) {
  const probe = document.createElement("span");
  probe.textContent = "COP 56.526.163,06";
  const size = nonlinear(44, scale);
  Object.assign(probe.style, { position: "absolute", visibility: "hidden", whiteSpace: "nowrap", fontFamily: "Geist",
    fontWeight: 600, fontSize: `${size}px`, letterSpacing: `${nonlinear(-1.2, scale)}px` });
  document.body.append(probe);
  const fit = Math.min(size, size * 288 / probe.getBoundingClientRect().width);
  probe.remove();
  return fit;
}

// MoneyHero long-value rule: keep the hero size; shrink only if the number
// cannot fit one line, minimally, and never below today's rendered size.
function fitHeroes(root, scale) {
  root.querySelectorAll(".hero-num").forEach((el) => {
    const target = parseFloat(el.style.fontSize);
    const floor = el.dataset.floor === "home" ? todayHomeHero(scale) : 0;
    const available = el.parentElement.clientWidth;
    const width = el.getBoundingClientRect().width;
    let size = width > available ? target * available / width : target;
    size = Math.floor(size * 4) / 4;
    if (size < floor) { size = floor; el.parentElement.classList.add("wrap"); }
    const ratio = size / target;
    el.style.fontSize = `${size}px`;
    el.style.lineHeight = `${parseFloat(el.style.lineHeight) * ratio}px`;
    el.style.letterSpacing = `${parseFloat(el.style.letterSpacing) * ratio}px`;
    el.dataset.size = size.toFixed(1);
    el.dataset.target = target.toFixed(1);
    if (floor) el.dataset.today = floor.toFixed(1);
  });
}

const PHONE = { width: 320, status: 99 / 3.375, nav: 162 / 3.375, height: 2340 / 3.375 };

function chrome(key) { return (window.ASSETS.chrome || {})[key]; }

// A proposal phone: real status bar, scroll area, optional pinned footer,
// optional real keyboard, real nav bar.
function proposalPhone({ screen, scale, mode, view }) {
  const phone = document.createElement("div");
  phone.className = `phone app ${mode}${view.island ? " has-island" : ""}`;
  phone.dataset.screen = screen;
  phone.dataset.scale = scale;
  phone.dataset.variant = "d3";
  const kbDp = view.keyboard ? chrome(`kb-${scale}-dp`) || 266 : 0;
  const status = chrome(`status-${mode}`);
  const nav = chrome(`nav-${mode}`);
  const content = `<div class="scroll" data-scroll>${view.body}</div>${view.footer ? `<div class="footer">${view.footer}</div>` : ""}`;
  // Pickers stay sheets at XXXL (ADR-0090): a dimmed strip of the page, then the sheet.
  const win = view.sheet
    ? `<div class="sheet-dim" aria-hidden="true"></div><div class="sheet" role="dialog"><div class="grabber" aria-hidden="true"></div>${content}</div>`
    : content;
  phone.innerHTML = `
    <div class="status ${view.top || (view.sheet ? "dim" : "")}" style="height:${PHONE.status}px">${status ? `<img alt="" src="${status}">` : ""}</div>
    <div class="win ${view.sheet ? "sheeted" : ""}" style="height:${PHONE.height - PHONE.status - PHONE.nav - kbDp}px">
      ${win}
      ${view.overlay || ""}
    </div>
    ${view.keyboard ? `<div class="kb" style="height:${kbDp}px">${chrome(`kb-${scale}-${mode}`) ? `<img alt="" src="${chrome(`kb-${scale}-${mode}`)}">` : ""}</div>` : ""}
    <div class="nav" style="height:${PHONE.nav}px">${nav ? `<img alt="" src="${nav}">` : ""}</div>
    ${view.island || ""}`;
  return phone;
}

// Today: D2's stitched real-phone capture in its real viewport.
function capturePhone({ screen, scale }) {
  const cap = (window.ASSETS.caps || {})[`${screen}-${scale}`];
  const phone = document.createElement("div");
  phone.className = "phone capture";
  phone.dataset.variant = "today";
  if (!cap) {
    phone.innerHTML = `<div class="missing">Capture ${screen}-${scale} not found. Run build.py with D2's captures.</div>`;
    return phone;
  }
  phone.innerHTML = `
    <img class="strip" alt="" src="${cap.top}" style="height:${cap.topDp}px">
    <div class="scroll" style="height:${cap.viewDp}px"><img alt="Real phone capture, ${screen} at ${scale}" src="${cap.full}"></div>
    <img class="strip" alt="" src="${cap.bottom}" style="height:${cap.bottomDp}px">`;
  return phone;
}

function measure(phone) {
  const scroll = phone.querySelector("[data-scroll]");
  return { content: scroll.scrollHeight, view: scroll.clientHeight, screens: scroll.scrollHeight / scroll.clientHeight };
}

// ---------- audit ----------

function parseColor(value) {
  let m = value.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  m = value.match(/color\(srgb ([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
    return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
  }
  return [0, 0, 0, 0];
}

function over(top, bottom) {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
}

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function backgroundOf(el, root) {
  const layers = [];
  for (let node = el; node && node !== root.parentElement; node = node.parentElement) {
    const bg = parseColor(getComputedStyle(node).backgroundColor);
    if (bg[3] > 0) layers.push(bg);
    if (bg[3] === 1) break;
  }
  return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255, 1]);
}

function auditPhone(phone) {
  const issues = [];
  const where = `${phone.dataset.screen} ${phone.dataset.scale} ${phone.classList.contains("dark") ? "dark" : "light"}`;
  const box = phone.getBoundingClientRect();
  const note = (check, el, detail) => issues.push({ check, where, detail, text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48) });
  phone.querySelectorAll(".win *").forEach((el) => {
    if (el.closest("[data-bleed]") || el.closest("svg")) return;
    const r = el.getBoundingClientRect();
    if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) note("overflow", el, `${Math.round(r.left - box.left)}–${Math.round(r.right - box.left)} dp`);
  });
  // Clipping: text cut by a container that hides overflow, a word wider than
  // its own box, or a hero number wider than its line.
  phone.querySelectorAll("[data-v]").forEach((el) => {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== phone && !a.matches(".scroll"); a = a.parentElement) {
      const style = getComputedStyle(a);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const b = a.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) { note("clipping", el, `cut by .${a.className.split(" ")[0]}`); break; }
    }
    if (getComputedStyle(el).display === "block" && el.scrollWidth > el.clientWidth + 1) note("clipping", el, `${el.scrollWidth} dp wide in ${el.clientWidth}`);
  });
  phone.querySelectorAll(".hero-num").forEach((el) => {
    const line = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.right > line.right + 1) note("clipping", el, `hero ${Math.round(r.width)} dp in ${Math.round(line.width)}`);
  });
  // A two-line description may be cut, but only if the row's screen-reader
  // label still carries the full text.
  phone.querySelectorAll("[data-clamp]").forEach((el) => {
    if (el.scrollHeight <= el.clientHeight + 1) return;
    phone.dataset.truncated = Number(phone.dataset.truncated || 0) + 1;
    const owner = el.closest("[aria-label]");
    if (!owner || !owner.getAttribute("aria-label").includes(el.dataset.full)) note("truncation", el, "full text missing from the row's label");
  });
  phone.querySelectorAll("[data-group]").forEach((group) => {
    const items = group.querySelectorAll(":scope > [data-item]").length;
    if (items > 2) note("items per group", group, `${items} items`);
  });
  const minimum = { primary: 68, secondary: 60, input: 64 };
  phone.querySelectorAll("[data-tap]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const need = minimum[el.dataset.tap] || 56;
    if (r.height < need - 0.5 || r.width < 55.5) note("target", el, `${Math.round(r.width)}×${Math.round(r.height)}, needs ${need}`);
  });
  phone.querySelectorAll("[data-v]").forEach((el) => {
    if (el.closest("[aria-disabled=true]") || el.closest("[data-decor]") || !el.textContent.trim() || /^\p{Extended_Pictographic}/u.test(el.textContent.trim()) && el.dataset.v.startsWith("emoji")) return;
    const fg = parseColor(getComputedStyle(el).color);
    const bg = backgroundOf(el, phone);
    const ratio = contrast(over(fg, bg), bg);
    const size = parseFloat(getComputedStyle(el).fontSize);
    const need = size >= 24 || (size >= 18.66 && Number(getComputedStyle(el).fontWeight) >= 700) ? 3 : 4.5;
    if (ratio < need) note("contrast", el, `${ratio.toFixed(2)}:1, needs ${need}:1`);
  });
  // Every icon must resolve to a symbol in the sprite.
  phone.querySelectorAll("use").forEach((use) => {
    const id = (use.getAttribute("href") || "").slice(1);
    if (!document.getElementById(id)) note("icon", use.closest("[aria-label]") || use.parentElement, `missing #${id}`);
  });
  phone.querySelectorAll(".hero-num").forEach((el) => {
    if (el.dataset.today && Number(el.dataset.size) < Number(el.dataset.today)) note("hero", el, `${el.dataset.size} dp is below today's ${el.dataset.today} dp`);
    if (Number(el.dataset.size) < 18) note("hero", el, `${el.dataset.size} dp is row-money size`);
  });
  return issues;
}

window.audit = function audit() {
  const phones = [...document.querySelectorAll('.phone[data-variant="d3"]')];
  phones.forEach((phone) => { phone.dataset.truncated = 0; });
  const issues = phones.flatMap(auditPhone);
  const checks = ["overflow", "clipping", "truncation", "items per group", "target", "contrast", "hero", "icon"];
  const summary = Object.fromEntries(checks.map((check) => [check, issues.filter((issue) => issue.check === check).length]));
  const truncated = phones.reduce((sum, phone) => sum + Number(phone.dataset.truncated), 0);
  const result = { phones: phones.length, pass: issues.length === 0, summary, truncated, issues };
  console.table(summary);
  return result;
};
