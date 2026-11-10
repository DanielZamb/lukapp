import { describe, expect, test } from "vitest";
import {
  categoryColor, categoryInk, categoryOutline, categoryPalette, contrastRatio, faintEdge, hexToHsl, hslToHex,
  parseHexColor, readableOn,
} from "./appearance";

describe("stored colour", () => {
  test.each([
    ["#2e7d32", "#2E7D32"], ["2e7d32", "#2E7D32"], ["  #ABCDEF ", "#ABCDEF"], ["#000000", "#000000"],
  ])("%s is stored as %s", (typed, stored) => {
    expect(parseHexColor(typed)).toBe(stored);
  });

  test.each(["", "#", "#2E7D3", "#2E7D32F", "#GGGGGG", "h270", "#2E 7D32", "rgb(1,2,3)"])("%s is not a colour", (typed) => {
    expect(parseHexColor(typed)).toBeNull();
  });

  test.each([
    [{ color: "h270" }, "light", "#57218c"],
    [{ color: "h270" }, "dark", "#ad73e8"],
    [{ color: "#A1B2C3" }, "light", "#A1B2C3"],
    [{ color: "#A1B2C3" }, "dark", "#A1B2C3"],
    [{ color: "#a1b2c3" }, "dark", "#a1b2c3"],
    [{ color: "sunset" }, "light", "#047857"],
    [{ color: "sunset" }, "dark", "#34d399"],
    [{ color: "#A1B2C" }, "light", "#047857"],
  ] as const)("%o in %s renders %s", (style, mode, expected) => {
    expect(categoryColor({ emoji: "🛒", tone: "positive", ...style }, mode)).toBe(expected);
  });

  test("a style without a colour keeps its tone", () => {
    expect(categoryColor({ emoji: "🛒", tone: "warning" }, "light")).toBe("#9c5f06");
  });
});

describe("hue, saturation and lightness", () => {
  test.each([
    ["#FF0000", { hue: 0, saturation: 100, lightness: 50 }],
    ["#00FF00", { hue: 120, saturation: 100, lightness: 50 }],
    ["#808080", { hue: 0, saturation: 0, lightness: 50 }],
    ["#FFCCCC", { hue: 0, saturation: 100, lightness: 90 }],
  ])("%s reads as %o", (hex, hsl) => {
    expect(hexToHsl(hex)).toEqual(hsl);
  });

  test.each([
    [{ hue: 240, saturation: 100, lightness: 50 }, "#0000ff"],
    [{ hue: 0, saturation: 100, lightness: 90 }, "#ffcccc"],
    [{ hue: 0, saturation: 0, lightness: 10 }, "#1a1a1a"],
  ])("%o writes %s", (hsl, hex) => {
    expect(hslToHex(hsl)).toBe(hex);
  });
});

describe("contrast", () => {
  test("ratios match the WCAG reference values", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  test.each([
    ["#FFFDE7", "light-yellow", "#000000"],
    ["#FFEB3B", "yellow", "#000000"],
    ["#777777", "mid grey", "#000000"],
    ["#2E7D32", "mid green", "#FFFFFF"],
    ["#1A237E", "navy", "#FFFFFF"],
    ["#0D0D0D", "near black", "#FFFFFF"],
  ])("text on %s (%s) is %s", (color, _, expected) => {
    expect(readableOn(color)).toBe(expected);
  });

  test("text on any fill reaches 4.5:1", () => {
    const failures: string[] = [];
    for (let value = 0; value < 0x1000000; value += 0x0b1f3d) {
      const color = `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
      if (contrastRatio(color, readableOn(color)) < 4.5) failures.push(color);
    }
    expect(failures).toEqual([]);
  });

  test.each([
    ["#FFFDE7", "light", "#8a8a8a"],
    ["#FFFDE7", "dark", "#FFFDE7"],
    ["#0D0D0D", "light", "#0D0D0D"],
    ["#0D0D0D", "dark", "#737373"],
    ["#2E7D32", "light", "#2E7D32"],
    ["#2E7D32", "dark", "#2E7D32"],
  ] as const)("a %s tint in %s mode is outlined in %s", (color, mode, outline) => {
    expect(categoryOutline(color, mode)).toBe(outline);
  });

  test("every palette colour keeps its own outline in both themes", () => {
    const outlined = categoryPalette.filter((entry) =>
      categoryOutline(entry.light, "light") !== entry.light || categoryOutline(entry.dark, "dark") !== entry.dark);
    expect(outlined.map((entry) => entry.id)).toEqual([]);
    expect(categoryPalette).toHaveLength(28);
  });

  test("a faint track gets a ring and a visible one does not", () => {
    expect(faintEdge("#FFFFFF", "light")).toEqual({ borderWidth: 1, borderColor: "#8a8a8a" });
    expect(faintEdge("#000000", "dark")).toEqual({ borderWidth: 1, borderColor: "#737373" });
    expect(faintEdge("#2E7D32", "light")).toBeNull();
  });

  test.each([
    ["#FFEB3B", "light", "#0a0a0a"],
    ["#FFEB3B", "dark", "#FFEB3B"],
    ["#1A237E", "dark", "#fafafa"],
    ["#1A237E", "light", "#1A237E"],
  ] as const)("text drawn in %s on the %s screen is %s", (color, mode, expected) => {
    expect(categoryInk(color, mode)).toBe(expected);
  });
});
