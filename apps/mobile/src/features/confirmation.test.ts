import { expect, test } from "vitest";
import { confirmShown, sameValue, showing } from "./confirmation";

test("a confirming press acts only on the opening it rendered, while the screen still shows the same values", () => {
  const first = showing({ categoryId: "food", minorUnits: 12_000_000 });
  expect(confirmShown(first, first, { categoryId: "food", minorUnits: 12_000_000 })).toBe("confirmed");
  expect(confirmShown(first, first, { categoryId: "food", minorUnits: 24_000_000 })).toBe("changed");
  expect(confirmShown(first, first, null)).toBe("changed");
  expect(confirmShown(null, first, first.snapshot)).toBe("stale");
  const second = showing({ categoryId: "food", minorUnits: 12_000_000 });
  expect(second.generation).not.toBe(first.generation);
  expect(confirmShown(second, first, first.snapshot)).toBe("stale");
});

test("plain values compare by their entries, never by identity or key order", () => {
  expect(sameValue({ a: [1, { b: "x" }], c: null }, { c: null, a: [1, { b: "x" }] })).toBe(true);
  expect(sameValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  expect(sameValue([], {})).toBe(false);
  expect(sameValue(0, -0)).toBe(false);
});
