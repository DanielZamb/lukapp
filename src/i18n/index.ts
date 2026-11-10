import { en } from "./catalog/en";
import { es } from "./catalog/es";
import type { Catalog, MessageKey, MessageParams, PluralKey } from "./types";

export type { Catalog, MessageKey, MessageParams, PluralKey } from "./types";

export const languages = ["en", "es"] as const;
export type Language = (typeof languages)[number];

/** `system` follows the device; a language is the person's explicit choice. */
export type LanguagePreference = Language | "system";

export const catalogs: Record<Language, Catalog> = { en, es };

/** Spanish copy is Colombian; dates and numbers follow the same region. */
export const localeTags: Record<Language, string> = { en: "en-US", es: "es-CO" };

export const languageNames: Record<Language, string> = { en: "English", es: "Español" };

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "es";
}

export function parseLanguagePreference(value: unknown): LanguagePreference {
  return isLanguage(value) ? value : "system";
}

/** Device Spanish or English is honoured; any other device language reads in English. */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLocale: string | null | undefined,
): Language {
  if (preference !== "system") return preference;
  const primary = deviceLocale?.trim().toLowerCase().split(/[-_]/)[0];
  return isLanguage(primary) ? primary : "en";
}

function lookup(language: Language, key: string): string | undefined {
  const at = key.indexOf(".");
  const namespace = catalogs[language][key.slice(0, at) as keyof Catalog] as
    | Record<string, string>
    | undefined;
  return namespace?.[key.slice(at + 1)];
}

function fill(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  return fill(lookup(language, key) ?? lookup("en", key) ?? key, params);
}

/** English and Spanish share the same rule: exactly one is singular. */
export function translateCount(
  language: Language,
  key: PluralKey,
  count: number,
  params?: MessageParams,
): string {
  const form = `${key}_${count === 1 ? "one" : "other"}` as MessageKey;
  return translate(language, form, { count, ...params });
}

export type Translator = {
  language: Language;
  locale: string;
  t: (key: MessageKey, params?: MessageParams) => string;
  tn: (key: PluralKey, count: number, params?: MessageParams) => string;
};

export function createTranslator(language: Language): Translator {
  return {
    language,
    locale: localeTags[language],
    t: (key, params) => translate(language, key, params),
    tn: (key, count, params) => translateCount(language, key, count, params),
  };
}
