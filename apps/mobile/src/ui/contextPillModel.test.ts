import { describe, expect, test } from "vitest";
import { dockDelay, dockShowsSuffix, glassMaterial, islandAmountFits, pillCopy, pillEnabled, pillAppearance, compactTypography, pillHideReason, pillPresenceTransition, pillPlacement, pillVisibility, summaryIsVisible } from "./contextPillModel";

describe("summary visibility", () => {
  test("shows only after the summary leaves, and a return suppresses intermediate scrolls", () => {
    expect(summaryIsVisible(null, 900)).toBe(true);
    expect(summaryIsVisible({ y: 20, height: 200 }, 227)).toBe(true);
    expect(summaryIsVisible({ y: 20, height: 200 }, 228)).toBe(false);
    expect(pillVisibility("summary", "summaryGone")).toBe("visible");
    expect(pillVisibility("visible", "back")).toBe("returning");
    expect(pillVisibility("returning", "summaryGone")).toBe("returning");
    expect(pillVisibility("returning", "summarySeen")).toBe("summary");
    expect(pillVisibility("visible", "summarySeen")).toBe("summary");
  });
  test("swipe dismissal lasts until observed visibility", () => {
    expect(pillVisibility("visible", "swipeUp")).toBe("dismissed");
    expect(pillVisibility("dismissed", "summaryGone")).toBe("dismissed");
    expect(pillVisibility("dismissed", "summarySeen")).toBe("summary");
    expect(pillVisibility("summary", "summaryGone")).toBe("visible");
  });
  test.each(["default", "reflow"] as const)("is inert at %s", tier => expect(pillEnabled(tier, true)).toBe(false));
  test("requires an active XXXL host", () => {
    expect(pillEnabled("xxxl", false)).toBe(false);
    expect(pillEnabled("xxxl", true)).toBe(true);
  });
});

test("uses cutout height, preserves measured geometry, and rejects a tall narrow notch", () => {
  expect(pillPlacement({ kind: "none", rect: null })).toEqual({ kind: "peekDock" });
  const ios = { x: 133.5, y: 11, width: 126, height: 37 };
  expect(pillPlacement({ kind: "island", rect: ios })).toEqual({ kind: "island", top: 8, height: 44, centerX: 196.5, centerY: 29.5, cutout: ios });
  const hole = { x: 142.2, y: 0, width: 43, height: 40.3 };
  expect(pillPlacement({ kind: "centredPunchHole", rect: hole })).toEqual({ kind: "peekDock" });
  expect(pillPlacement({ kind: "centredPunchHole", rect: { x: 140, y: 0, width: 40, height: 80 } })).toEqual({ kind: "peekDock" });
  expect(pillPlacement({ kind: "centredPunchHole", rect: { x: 140, y: 0, width: 40, height: 41.01 } })).toEqual({ kind: "peekDock" });
});

test("docks after three seconds, or 1.2 seconds with Reduce Motion", () => {
  expect(dockDelay(false)).toBe(3000);
  expect(dockDelay(true)).toBe(1200);
});
test("drops the visible suffix only when the measured line does not fit", () => {
  expect(dockShowsSuffix({ textWidth: 140, availableWidth: 140 })).toBe(true);
  expect(dockShowsSuffix({ textWidth: 141, availableWidth: 140 })).toBe(false);
});
test.each(["regular", "clear", "solid"] as const)("Reduce Transparency forces Solid from %s", requested => {
  expect(glassMaterial({ requested, darkContent: true, reduceTransparency: true })).toBe("solid");
});
test("Clear requires known dark content", () => {
  expect(glassMaterial({ requested: "clear", darkContent: false, reduceTransparency: false })).toBe("regular");
  expect(glassMaterial({ requested: "clear", darkContent: true, reduceTransparency: false })).toBe("clear");
});
test("budget copy keeps the full spoken label independently of compact fitting", () => {
  expect(pillCopy({ kind: "budget", name: "Food & drink", emoji: "🥗", currency: "COP", limitMinor: 20000000, spentMinor: 12000000 }))
    .toEqual({ amount: "COP 80.000", line: "COP 80.000 left", label: "Back to summary, Food & drink, COP 80.000 left", tone: "positive",
      figures: [{ label: "Left to spend", value: "COP 80.000" }, { label: "Spent of COP 200.000", value: "COP 120.000" }], progress: 0.6, limit: "of COP 200.000" });
});
test("negative remaining says over, with the absolute excess", () => {
  const copy = pillCopy({ kind: "budget", name: "Food", emoji: "🥗", currency: "COP", limitMinor: 20000000, spentMinor: 21200000 });
  expect(copy.line).toBe("COP 12.000 over");
  expect(copy.label).toBe("Back to summary, Food, COP 12.000 over");
  expect(copy.tone).toBe("warning");
  expect(copy.progress).toBe(1);
});
test("an entry has its own signed amount and no invented budget figures", () => {
  expect(pillCopy({ kind: "entry", name: "Groceries", emoji: "🧾", currency: "COP", amountMinor: -4500000 }))
    .toEqual({ amount: "−COP 45.000", line: "−COP 45.000", label: "Back to summary, Groceries, −COP 45.000", tone: "default",
      figures: [{ label: "Amount", value: "−COP 45.000" }], progress: null, limit: null });
});

test.each([["JPY", 100, "JPY 100"], ["BHD", 1234, "BHD 1,234"]])("uses %s currency precision", (currency, amountMinor, expected) => {
  expect(pillCopy({ kind: "entry", name: "Entry", emoji: "🧾", currency: String(currency), amountMinor: Number(amountMinor) }).amount).toBe(expected);
});
test("negative net spending from reversals retains its sign", () => {
  const copy = pillCopy({ kind: "budget", name: "Food", emoji: "🥗", currency: "COP", limitMinor: 20000, spentMinor: -5000 });
  expect(copy.figures[1].value).toBe("−COP 50");
  expect(copy.line).toBe("COP 250 left");
  expect(copy.progress).toBe(0);
});

test("compact island keeps at least18-point money and falls back when the camera leaves too little room", () => {
  const shape = { height: 44, android: false, fontScale: 2, windowWidth: 320, cutout: { x: 142, y: 0, width: 43, height: 40 } };
  expect(islandAmountFits({ ...shape, measuredWidth: 120 })).toBe(true);
  expect(islandAmountFits({ ...shape, measuredWidth: 190 })).toBe(false);
});

test("S21 lens-derived island stays on screen and is centred on both axes", () => {
  const rect = { x: 505 / 3.375, y: 0, width: 70 / 3.375, height: 99 / 3.375 };
  const placement = pillPlacement({ kind: "centredPunchHole", rect });
  expect(placement.kind).toBe("island");
  if (placement.kind !== "island") throw new Error("Expected S21 island");
  expect(placement.top).toBeCloseTo(6.5925925926);
  expect(placement.centerX).toBe(160);
  expect(placement.height).toBeCloseTo(24.7407407407);
  expect(placement.top + placement.height / 2).toBeCloseTo(64 / 3.375);
  expect(placement.height - rect.width).toBe(4);
});
test("falls back when a centred lens cannot keep two-point clearance on screen", () => {
  expect(pillPlacement({ kind: "centredPunchHole", rect: { x: 150, y: 0, width: 20, height: 20 } })).toEqual({ kind: "peekDock" });
  expect(pillPlacement({ kind: "centredPunchHole", rect: { x: 140, y: 0, width: 40, height: 40 } })).toEqual({ kind: "peekDock" });
});
const modes: Array<"light" | "dark"> = ["light", "dark"];
const forms: Array<"android" | "ios" | "peekDock"> = ["android", "ios", "peekDock"];
for (const appTheme of modes) for (const form of forms) for (const reduceTransparency of [false, true]) {
  test(`${appTheme} ${form} inverted surface with Reduce Transparency ${reduceTransparency}`, () => {
    const appearance = pillAppearance(form === "peekDock" ? { appTheme, reduceTransparency, form }
      : { appTheme, reduceTransparency, form: "island", platform: form, expanded: false });
    expect(appearance).toMatchObject(appTheme === "light"
      ? { dark: true, background: "#000000", ink: "#ffffff", muted: "#d4d4d8", positive: "#4ade80", danger: "#fca5a5" }
      : { dark: false, background: "#ffffff", ink: "#141118", muted: "#3f3748", positive: "#064e3b", danger: "#7f1d1d" });
    expect(appearance.material).toBe(form === "android" || reduceTransparency ? "solid" : "regular");
    expect(appearance.tintOpacity).toBe(0.74);
  });
}
test("compact cap fits the S21 visual and falls back below the sixteen-point floor", () => {
  const fit = compactTypography({ height: 24.7407407407, fontScale: 1.5, android: true });
  expect(fit.kind).toBe("fits");
  if (fit.kind !== "fits") throw new Error("Expected compact fit");
  expect(fit.multiplierCap).toBeCloseTo(1.1315199531);
  expect(fit.minimumScale * 14.67 * fit.multiplierCap).toBeCloseTo(16);
  expect(fit.tileSize).toBeCloseTo(20.7407407407);
  expect(compactTypography({ height: 22, fontScale: 1.5, android: true })).toEqual({ kind: "fallback" });
  expect(islandAmountFits({ height: 24.7407407407, android: true, fontScale: 1.5, windowWidth: 320, cutout: { x: 149.63, y: 0, width: 20.74, height: 29.33 }, measuredWidth: 200 })).toBe(false);
});
test("hide reasons choose reverse animation except for Back", () => {
  expect(pillHideReason("summary")).toBe("scroll");
  expect(pillHideReason("dismissed")).toBe("swipe");
  expect(pillHideReason("returning")).toBe("back");
  expect(pillPresenceTransition({ current: 1, visible: false, reason: "scroll", reduceMotion: false })).toEqual({ target: 0, duration: 180 });
  expect(pillPresenceTransition({ current: 1, visible: false, reason: "swipe", reduceMotion: false })).toEqual({ target: 0, duration: 180 });
  expect(pillPresenceTransition({ current: 1, visible: false, reason: "back", reduceMotion: false })).toEqual({ target: 0, duration: 0 });
  expect(pillPresenceTransition({ current: 1, visible: false, reason: "scroll", reduceMotion: true })).toEqual({ target: 0, duration: 120 });
});
test("interrupted reversal retains current progress and cadence", () => {
  expect(pillPresenceTransition({ current: 0.6, visible: false, reason: "scroll", reduceMotion: false })).toEqual({ target: 0, duration: 108 });
  expect(pillPresenceTransition({ current: 0.25, visible: true, reason: "scroll", reduceMotion: false })).toEqual({ target: 1, duration: 135 });
  expect(pillPresenceTransition({ current: 0.5, visible: true, reason: "scroll", reduceMotion: true })).toEqual({ target: 1, duration: 60 });
});
