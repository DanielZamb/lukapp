import { describe, expect, test } from "vitest";
import { dockDelay, dockShowsSuffix, glassMaterial, islandAmountFits, pillCopy, pillEnabled, pillPlacement, pillVisibility, summaryIsVisible } from "./contextPillModel";

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
  expect(pillPlacement({ kind: "island", rect: ios })).toEqual({ kind: "island", top: 8, height: 44, cutout: ios });
  const hole = { x: 142.2, y: 0, width: 43, height: 40.3 };
  expect(pillPlacement({ kind: "centredPunchHole", rect: hole })).toEqual({ kind: "island", top: 0, height: 44, cutout: hole });
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
  const shape = { fontScale: 2, windowWidth: 320, cutout: { x: 142, y: 0, width: 43, height: 40 } };
  expect(islandAmountFits({ ...shape, measuredWidth: 120 })).toBe(true);
  expect(islandAmountFits({ ...shape, measuredWidth: 190 })).toBe(false);
});
