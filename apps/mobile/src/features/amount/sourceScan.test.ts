import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vitest";

const mobile = resolve(__dirname, "../../..");
const roots = ["app", "src", "modules"].map((dir) => join(mobile, dir));

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

/** Each exemption names its file, the pattern it may use, and why that use is not money grammar. */
const allowed: ReadonlyArray<readonly [file: string, pattern: string, why: string]> = [
  ["src/features/timeZones.ts", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["src/features/intake/prototype/NotificationFirst.tsx", "toLocaleString", "date helper: the prototype's capture time"],
  ["src/features/money.ts", "Intl.NumberFormat", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["src/features/money.ts", "a hard-coded es-CO locale", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["src/features/intake/suggest.ts", "*", "bank parser: reads the bank's own text and keeps its own grammar"],
];

test("no production file under apps/mobile formats or parses money without the workspace currency", () => {
  const found = roots.flatMap(files).flatMap((path) => {
    const file = relative(mobile, path);
    const source = readFileSync(path, "utf8");
    return forbidden.flatMap(([name, pattern]) => {
      if (!pattern.test(source)) return [];
      if (allowed.some(([allowedFile, allowedPattern]) => allowedFile === file && (allowedPattern === "*" || allowedPattern === name))) return [];
      return [`${file}: ${name}`];
    });
  });
  expect(found).toEqual([]);
});

test("every exemption still matches a real use, so none outlives its reason", () => {
  for (const [file, pattern] of allowed) {
    const source = readFileSync(join(mobile, file), "utf8");
    if (pattern === "*") continue;
    const rule = forbidden.find(([name]) => name === pattern);
    expect(rule?.[1].test(source), `${file}: ${pattern}`).toBe(true);
  }
});
