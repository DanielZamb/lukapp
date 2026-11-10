import { describe, expect, it } from "vitest";
import { catalogs, createTranslator, resolveLanguage, translate, translateCount } from "./index";
import { formatLongDate, formatMonthName, formatShortDate } from "./format";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("shared catalog", () => {
  it("gives Spanish every English message with the same placeholders", () => {
    const problems: string[] = [];
    for (const [namespace, messages] of Object.entries(catalogs.en)) {
      const spanish = (catalogs.es as Record<string, Record<string, string>>)[namespace] ?? {};
      for (const [key, english] of Object.entries(messages as Record<string, string>)) {
        const translated = spanish[key];
        if (!translated?.trim()) problems.push(`${namespace}.${key}: missing`);
        else if (placeholders(translated).join() !== placeholders(english).join())
          problems.push(`${namespace}.${key}: placeholders differ`);
      }
      for (const key of Object.keys(spanish))
        if (!(key in messages)) problems.push(`${namespace}.${key}: only in Spanish`);
    }
    expect(problems).toEqual([]);
  });

  it("pairs every counted message", () => {
    const unpaired: string[] = [];
    for (const [namespace, messages] of Object.entries(catalogs.en))
      for (const key of Object.keys(messages)) {
        const base = key.match(/^(.*)_(one|other)$/);
        if (base && !(`${base[1]}_${base[2] === "one" ? "other" : "one"}` in messages))
          unpaired.push(`${namespace}.${key}`);
      }
    expect(unpaired).toEqual([]);
  });
});

describe("language choice", () => {
  it("follows a Spanish or English device and otherwise reads in English", () => {
    expect(resolveLanguage("system", "es-CO")).toBe("es");
    expect(resolveLanguage("system", "es_419")).toBe("es");
    expect(resolveLanguage("system", "en-GB")).toBe("en");
    expect(resolveLanguage("system", "pt-BR")).toBe("en");
    expect(resolveLanguage("system", undefined)).toBe("en");
  });

  it("lets the in-app choice override the device", () => {
    expect(resolveLanguage("en", "es-CO")).toBe("en");
    expect(resolveLanguage("es", "en-US")).toBe("es");
  });
});

describe("messages", () => {
  it("fills parameters and counts", () => {
    expect(translateCount("en", "settings.places", 1)).toBe("1 place");
    expect(translateCount("es", "settings.places", 3)).toBe("3 lugares");
    expect(translate("es", "common.back")).toBe("Atrás");
    expect(createTranslator("es").locale).toBe("es-CO");
  });
});

describe("dates", () => {
  const date = Date.UTC(2026, 10, 10, 12);
  it("uses Colombian Spanish order and English order", () => {
    expect(formatLongDate("es", date, "UTC")).toBe("10 de noviembre de 2026");
    expect(formatLongDate("en", date, "UTC")).toBe("November 10, 2026");
    expect(formatMonthName("es", date, { timeZone: "UTC" })).toBe("Noviembre");
    expect(formatMonthName("es", date, { timeZone: "UTC", capitalize: false })).toBe("noviembre");
    expect(formatShortDate("es", date, "UTC")).toBe("10 nov");
    expect(formatShortDate("en", date, "UTC")).toBe("Nov 10");
  });
});
