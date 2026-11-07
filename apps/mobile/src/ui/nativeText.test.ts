import { expect, test } from "vitest";
import { androidScaledSize, cappedNativeStyle } from "./nativeText";

test.each([1.3, 1.5, 2])("capped hero matches the HTML at Android scale %s", scale => {
  const style = cappedNativeStyle({ fontSize: 44, lineHeight: 45.76, letterSpacing: -2.2 }, scale, 1.2);
  const size = style.fontSize ?? 0;
  const line = style.lineHeight ?? 0;
  expect(Math.min(androidScaledSize(size, scale), size * 1.2)).toBeCloseTo(52.8);
  expect(androidScaledSize(line, scale)).toBeCloseTo(54.912);
  expect(androidScaledSize(style.letterSpacing ?? 0, scale)).toBeCloseTo(-2.64);
});
test("uncapped prose retains native scaling and the scale below a cap stays untouched", () => {
  expect(cappedNativeStyle({ fontSize: 16, lineHeight: 23.2 }, 2)).toEqual({});
  expect(cappedNativeStyle({ fontSize: 18 }, 1.3, 1.5)).toEqual({});
  expect(androidScaledSize(16, 1.5)).toBe(23);
  expect(androidScaledSize(44, 1.5)).toBe(44);
});

test("Fabric line height uses uncapped conversion", () => {
  const eyebrow = cappedNativeStyle({ lineHeight: 16.2 }, 2, 1.3);
  const status = cappedNativeStyle({ lineHeight: 18.9 }, 2, 1.3);
  expect(androidScaledSize(eyebrow.lineHeight ?? 0, 2)).toBeCloseTo(21.06);
  expect(androidScaledSize(status.lineHeight ?? 0, 2)).toBeCloseTo(24.57);
});
