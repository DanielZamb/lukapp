import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vitest";

const repository = resolve(__dirname, "../../../../..");
const roots = ["apps/mobile/app", "apps/mobile/src", "apps/mobile/modules", "src"].map((dir) => join(repository, dir));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "android" || name === "ios") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|testSupport|fixtures|formal)\.tsx?$/.test(name) ? [path] : [];
  });
}

const forbidden: ReadonlyArray<readonly [string, RegExp]> = [
  ["toLocaleString", /\.toLocaleString\(/],
  ["Intl.NumberFormat", /Intl\.NumberFormat/],
  ["a hard-coded es-CO locale", /["'`]es-CO["'`]/],
  ["a hard-coded en-US locale", /["'`]en-US["'`]/],
  ["the removed locale parser", /\bparseMoney\b/],
  ["the removed input sanitizer", /\bformatMoneyInput\b/],
  ["the language-only compact formatter", /\bformatCompactNumber\b/],
  ["an amount formatter without a currency", /\b(formatAmount|compactMoney|amountOfMinorUnits)\(\s*[^,()]+\)/],
  ["an amount session without a currency", /\b(openAmount|amountFormat)\(\s*\)/],
];

type Exemption = readonly [file: string, declaration: string, pattern: string, why: string];

/**
 * Each exemption names its file, the top-level declaration allowed one line with the pattern, and why that use is not
 * money grammar. A second such line, even in the same declaration, is a violation.
 */
const allowed: readonly Exemption[] = [
  ["apps/mobile/src/features/timeZones.ts", "calendarDate", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["apps/mobile/src/features/timeZones.ts", "zoneOffsetMs", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["apps/mobile/src/features/intake/prototype/NotificationFirst.tsx", "time", "toLocaleString", "date helper: the prototype's capture time"],
  ["apps/mobile/src/features/money.ts", "currencyDisplayPrefix", "Intl.NumberFormat", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["apps/mobile/src/features/money.ts", "currencyDisplayPrefix", "a hard-coded es-CO locale", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["src/accounting/timeZone.ts", "requireTimeZone", "a hard-coded en-US locale", "date helper: validates a time zone with Intl.DateTimeFormat"],
  ["src/accounting/timeZone.ts", "calendarDate", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["src/i18n/index.ts", "localeTags", "a hard-coded en-US locale", "language tags for dates and words, never for amounts"],
  ["src/i18n/index.ts", "localeTags", "a hard-coded es-CO locale", "language tags for dates and words, never for amounts"],
  ["src/i18n/format.ts", "formatCompactNumber", "Intl.NumberFormat", "counts that are not money; money code may not call it, by the rule above"],
  ["src/i18n/format.ts", "formatCompactNumber", "the language-only compact formatter", "its own definition"],
];

/**
 * The lines of a top-level declaration: from the line declaring `name` through the first later line that closes at
 * column zero, or that one line when the declaration ends on it.
 */
function declaration(source: string, name: string): readonly [number, number] | null {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^(export )?(async )?(function|const|let) ${name}\\b`).test(line));
  if (start < 0) return null;
  if (/;\s*$/.test(lines[start])) return [start, start];
  const end = lines.findIndex((line, index) => index > start && /^[})\]]/.test(line));
  return end < 0 ? null : [start, end];
}

/** The forbidden uses in one file, after blanking the one exempt line in each exempt declaration. */
function violations(file: string, source: string): string[] {
  return forbidden.flatMap(([name, pattern]) => {
    const lines = source.split("\n");
    for (const [exemptFile, exemptDeclaration, exemptPattern] of allowed) {
      if (exemptFile !== file || exemptPattern !== name) continue;
      const range = declaration(source, exemptDeclaration);
      if (!range) continue;
      const line = lines.findIndex((text, index) => index >= range[0] && index <= range[1] && pattern.test(text));
      if (line >= 0) lines[line] = "";
    }
    return pattern.test(lines.join("\n")) ? [`${file}: ${name}`] : [];
  });
}

test("no production file in the app or the shared code formats or parses money without the workspace currency", () => {
  const found = roots.flatMap(files).flatMap((path) => violations(relative(repository, path), readFileSync(path, "utf8")));
  expect(found).toEqual([]);
});

test("every exemption still names a declaration that uses its pattern, so none outlives its reason", () => {
  for (const [file, name, pattern] of allowed) {
    const source = readFileSync(join(repository, file), "utf8");
    const range = declaration(source, name);
    expect(range, `${file}: ${name}`).not.toBeNull();
    const body = source.split("\n").slice(range![0], range![1] + 1).join("\n");
    expect(forbidden.find(([rule]) => rule === pattern)?.[1].test(body), `${file}: ${name}: ${pattern}`).toBe(true);
  }
});

test("a violation planted beside an exempt declaration, in the same file, is still caught", () => {
  const file = "apps/mobile/src/features/money.ts";
  const source = readFileSync(join(repository, file), "utf8");
  expect(violations(file, source)).toEqual([]);
  const planted = `${source}\nexport function plantedDisplay(minorUnits: number) {\n  return new Intl.NumberFormat("en-US").format(minorUnits / 100);\n}\n`;
  expect(violations(file, planted)).toEqual([`${file}: Intl.NumberFormat`, `${file}: a hard-coded en-US locale`]);
  const inside = source.replace("  const [before", "  const grouped = new Intl.NumberFormat(\"es-CO\").format(1234);\n  const [before");
  expect(inside).not.toBe(source);
  expect(violations(file, inside)).toEqual([`${file}: Intl.NumberFormat`, `${file}: a hard-coded es-CO locale`]);
  const shared = "src/i18n/format.ts";
  const plantedShared = `${readFileSync(join(repository, shared), "utf8")}\nexport const amountLabel = (value: number) => value.toLocaleString("es-CO");\n`;
  expect(violations(shared, plantedShared)).toEqual([`${shared}: toLocaleString`, `${shared}: a hard-coded es-CO locale`]);
});
