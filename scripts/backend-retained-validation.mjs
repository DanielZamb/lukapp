import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { manifest, coverageFormat, sha256 } from "./backend-scope.mjs";
import { checkPreflight, TestStatus } from "./backend-suites.mjs";
import { analyzeFile } from "./crap.mjs";
const output = process.argv[2] ?? "quality/backend/final-correction/retained";
mkdirSync(output, { recursive: true });
const current = manifest();
const dir = "quality/backend/graph-correction/dry-run-r2";
const evidence = JSON.parse(readFileSync(`${dir}/preflight.json`));
const { inputs } = JSON.parse(readFileSync(`${dir}/preflight-inputs.json`));
const check = checkPreflight(evidence, inputs);
const identity = { inputDigest: current.digest, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  trackedWorktreeClean: execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim() === "",
  checkerHash: sha256(readFileSync("scripts/backend-suites.mjs")), reporterHash: sha256(readFileSync("scripts/backend-ast-coverage.mjs")), coverageFormat };
writeFileSync(join(output, "checker-validation.json"), JSON.stringify({ kind: "retained-observation checker validation", ...identity,
  newEngineExecution: false, historicalEngineExitStatus: JSON.parse(readFileSync(`${dir}/execution.json`)).exitStatus,
  rawPreflightHash: sha256(readFileSync(`${dir}/preflight.json`)), rawInputsHash: sha256(readFileSync(`${dir}/preflight-inputs.json`)),
  installedSuccessStatus: TestStatus.Success, check, mutationAcceptance: false }, null, 2) + "\n");
const reports = [];
for (const [label, dataset] of [["before", "representative"], ["after", "representative-after-regression"]]) {
  const sourceFile = `quality/backend/ast-remapping/${dataset}/source.ts.txt`;
  const correctedFile = `quality/backend/mapper-diagnosis/representative-${label}-corrected.json`;
  const text = readFileSync(sourceFile, "utf8"), corrected = Object.values(JSON.parse(readFileSync(correctedFile)))[0];
  // Focused tests reproduce these exact maps with the byte-verified installed
  // patched mapper. Historical unpatched reports remain unchanged.
  const rows = analyzeFile("src/savingsRecovery/commands.ts", text, corrected, coverageFormat.format);
  const report = { kind: "advisory retained-data recalculation", ...identity, newBackendExecution: false,
    originalFormat: "vitest-v8-3.2.7-ast-v1", sourceHash: sha256(text), sourceSnapshotHash: sha256(readFileSync(sourceFile)),
    correctedMapHash: sha256(readFileSync(correctedFile)), fullGatePassed: false, rows, mappingFailures: rows.mappingFailures,
    failures: rows.filter(row => row.missingCoverage || row.crap > current.policy.maximumFunctionCrap), assignments: rows.assignments };
  writeFileSync(join(output, `${label}-patched-crap.json`), JSON.stringify(report, null, 2) + "\n");
  reports.push({ dataset, functions: rows.length, missing: rows.filter(row => row.missingCoverage).length,
    unassigned: rows.mappingFailures.length, failures: report.failures.length,
    callback: rows.find(row => row.function === "anonymous@188:78") });
}
writeFileSync(join(output, "summary.json"), JSON.stringify({ ...identity, checkerValidationPassed: check.passed, reports,
  officialAcceptance: false }, null, 2) + "\n");
console.log(JSON.stringify({ checkerValidationPassed: check.passed, reports: reports.map(({ callback, ...report }) => ({ ...report, callbackCount: callback.functionEntries })) }, null, 2));
process.exitCode = check.passed && reports.every(report => report.missing === 0 && report.unassigned === 0) ? 0 : 1;
