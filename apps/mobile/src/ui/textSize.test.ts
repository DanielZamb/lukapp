import { expect, test } from "vitest";
import { readableLayout } from "./layout";
import { appScaledStyle } from "./nativeText";
import { effectiveFontScale, parseTextSizePreference } from "./textSize";

test("the app's text size never goes below the phone's and feeds the same tier switch", () => {
  expect(effectiveFontScale(1, "phone")).toBe(1);
  expect(effectiveFontScale(1, "large")).toBe(1.5);
  expect(effectiveFontScale(1, "largest")).toBe(2);
  expect(effectiveFontScale(2, "large")).toBe(2);
  expect(effectiveFontScale(1.5, "phone")).toBe(1.5);
  expect(readableLayout({ width: 392, fontScale: effectiveFontScale(1, "phone") }).tier).toBe("default");
  expect(readableLayout({ width: 392, fontScale: effectiveFontScale(1, "largest") }).tier).toBe("xxxl");
  expect(readableLayout({ width: 392, fontScale: effectiveFontScale(1, "large") }).tier).toBe("xxxl");
});

test("an unknown stored value follows the phone", () => {
  expect(["large", "largest", "phone", null, "huge"].map(parseTextSizePreference)).toEqual(["large", "largest", "phone", "phone", "phone"]);
});

test("text drawn at the app's size matches what the phone would draw at that setting", () => {
  expect(appScaledStyle({ fontSize: 16, lineHeight: 24 }, 2, false)).toEqual({ fontSize: 32, lineHeight: 48 });
  // Android 14 and later scale large text less: 30sp at 200% is 38dp, not 60.
  expect(appScaledStyle({ fontSize: 30 }, 2, true)).toEqual({ fontSize: 38 });
  expect(appScaledStyle({ fontSize: 16 }, 2, true)).toEqual({ fontSize: 28 });
  // A capped style stops at its cap, as it does under the phone's setting.
  expect(appScaledStyle({ fontSize: 44, lineHeight: 46 }, 2, true, 1.2)).toEqual({ fontSize: 44 * 1.2, lineHeight: 46 * 1.2 });
  expect(appScaledStyle({}, 1.5, false)).toEqual({ fontSize: 21 });
});
