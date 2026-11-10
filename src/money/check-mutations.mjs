import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const reportDir = resolve(root, "reports/mvp-2026-11-10/amount-mutations");
mkdirSync(reportDir, { recursive: true });
const amountPath = resolve(root, "src/money/amount.ts");
const currenciesPath = resolve(root, "src/accounting/currencies.ts");
const originalAmount = readFileSync(amountPath, "utf8");
const originalCurrencies = readFileSync(currenciesPath, "utf8");
const mutants = [
  {
    name: "swap-usd-separators", path: currenciesPath, source: originalCurrencies,
    before: 'id: "usd", version: 1, group: ",", decimal: "."',
    after: 'id: "usd", version: 1, group: ".", decimal: ","',
  },
  {
    name: "accept-foreign-decimal", path: amountPath, source: originalAmount,
    before: '  const raw = text.trim();',
    after: `  if (convention.id === "cop" && precision === 2 && /^\\d+\\.\\d{1,2}$/.test(text)) {
    const [whole, fraction] = text.split(".");
    return { kind: "parsed", minorUnits: Number(whole + fraction.padEnd(2, "0")) };
  }
  const raw = text.trim();`,
  },
  {
    name: "allow-short-group", path: amountPath, source: originalAmount,
    before: "last.length === convention.primaryGroupSize",
    after: "last.length >= 1 && last.length <= convention.primaryGroupSize",
  },
  {
    name: "drop-safe-integer-bound", path: amountPath, source: originalAmount,
    before: "if (digits.length > maxMinorUnits.length || (digits.length === maxMinorUnits.length && digits > maxMinorUnits))",
    after: "if (false)",
  },
  {
    name: "round-excess-decimals", path: amountPath, source: originalAmount,
    before: 'if (fraction.length > precision) return refuse({ code: "too_many_decimals", precision, actual: fraction.length });',
    after: `if (fraction.length > precision) {
    const magnitude = Number(whole.split(convention.group).join("") + fraction.slice(0, precision)) + (fraction[precision] >= "5" ? 1 : 0);
    return { kind: "parsed", minorUnits: negative ? -magnitude : magnitude };
  }`,
  },
];
const receipt = [];
try {
  for (const mutant of mutants) {
    if (mutant.source.split(mutant.before).length !== 2) throw new Error(`Mutation target must occur once: ${mutant.name}`);
    writeFileSync(mutant.path, mutant.source.replace(mutant.before, mutant.after));
    const jsonPath = resolve(reportDir, `${mutant.name}.json`);
    rmSync(jsonPath, { force: true });
    const result = spawnSync("pnpm", ["vitest", "run", "src/money/amount.test.ts", "src/money/conventions.test.ts", "-t", "literal thousand-confusion|safe bounds|every supported currency", "--reporter=json", `--outputFile=${jsonPath}`], { cwd: root, encoding: "utf8" });
    writeFileSync(mutant.path, mutant.source);
    if (result.error) throw result.error;
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    const failed = report.testResults.flatMap(file => file.assertionResults.filter(test => test.status === "failed").map(test => test.fullName));
    if (result.status !== 1 || failed.length === 0 || report.numFailedTestSuites === 0) throw new Error(`Mutant not killed by an assertion: ${mutant.name}`);
    receipt.push({ mutant: mutant.name, exitCode: result.status, failedTests: failed, witnesses: report.testResults.flatMap(file => file.assertionResults.filter(test => test.status === "failed").slice(0, 1).map(test => ({ test: test.fullName, failure: test.failureMessages[0] }))), sourceChange: { before: mutant.before, after: mutant.after } });
    process.stdout.write(`${mutant.name}: killed by ${failed.length} tests\n`);
  }
} finally {
  writeFileSync(amountPath, originalAmount);
  writeFileSync(currenciesPath, originalCurrencies);
}
const hash = source => createHash("sha256").update(source).digest("hex");
writeFileSync(resolve(reportDir, "receipt.json"), JSON.stringify({
  source: { amount: hash(originalAmount), currencies: hash(originalCurrencies) },
  restored: readFileSync(amountPath, "utf8") === originalAmount && readFileSync(currenciesPath, "utf8") === originalCurrencies,
  command: "node src/money/check-mutations.mjs", results: receipt,
}, null, 2) + "\n");
