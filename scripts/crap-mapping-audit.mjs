import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import ts from "typescript";
import { analyzeFile } from "./crap.mjs";
import { policy, sha256, manifest } from "./backend-scope.mjs";

const ref = "117ba020aa73e4fc8f60dba63a4ecc185980fbd5";
const directory = process.argv[2] ?? "quality/backend/review-r1/retained-data";
mkdirSync(directory, { recursive: true });
const fromGit = file => execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" });
const frozen = JSON.parse(fromGit("quality/backend/freeze-manifest.json"));
const snapshotPath = `${directory}/source-snapshot.json.gz`;
if (!existsSync(snapshotPath)) {
  const sources = Object.fromEntries(frozen.mutationFiles.map(file => [file, fromGit(file)]));
  const snapshot = { ref, sourceHashes: Object.fromEntries(frozen.mutationFiles.map(file => [file, frozen.files[file]])),
    sources, originalReporter: fromGit("scripts/crap.mjs"), originalReporterSha256: frozen.files["scripts/crap.mjs"] };
  writeFileSync(snapshotPath, gzipSync(JSON.stringify(snapshot)));
}
const snapshotBytes = readFileSync(snapshotPath);
const snapshot = JSON.parse(gunzipSync(snapshotBytes));
if (snapshot.ref !== ref || snapshot.originalReporterSha256 !== frozen.files["scripts/crap.mjs"] ||
  sha256(snapshot.originalReporter) !== frozen.files["scripts/crap.mjs"] ||
  JSON.stringify(snapshot.sourceHashes) !== JSON.stringify(Object.fromEntries(frozen.mutationFiles.map(file => [file, frozen.files[file]]))) ||
  JSON.stringify(Object.keys(snapshot.sources)) !== JSON.stringify(frozen.mutationFiles) ||
  Object.entries(snapshot.sources).some(([file, source]) => sha256(source) !== frozen.files[file])) throw new Error("Frozen source snapshot mismatch");
if (sha256(readFileSync("quality/backend/policy.json")) !== frozen.files["quality/backend/policy.json"]) throw new Error("Gate policy changed");

const rawPath = "quality/backend/reporter-validation-expanded-coverage.json.gz";
const originalPath = "quality/backend/reporter-validation-expanded-crap.json.gz";
const rawBytes = readFileSync(rawPath), originalBytes = readFileSync(originalPath);
const coverage = JSON.parse(gunzipSync(rawBytes)), original = JSON.parse(gunzipSync(originalBytes));
const reviewedPath = "quality/backend/crap-mapping/corrected-report.json.gz";
const reviewedBytes = readFileSync(reviewedPath), reviewed = JSON.parse(gunzipSync(reviewedBytes));
const oldModuleText = snapshot.originalReporter.replace('"typescript"', JSON.stringify(import.meta.resolve("typescript")))
  .replace('"./backend-scope.mjs"', JSON.stringify(new URL("./backend-scope.mjs", import.meta.url).href));
const oldModule = await import(`data:text/javascript;base64,${Buffer.from(oldModuleText).toString("base64")}`);
const key = row => `${row.file}:${row.line}:${row.function}`;
const beforeByKey = new Map(original.functions.map(row => [key(row), row]));
const reviewedByKey = new Map(reviewed.functions.map(row => [key(row), row]));
if (beforeByKey.size !== original.functions.length) throw new Error("Ambiguous historical row identity");
if (reviewedByKey.size !== original.functions.length || reviewed.sourceRef !== ref) throw new Error("Reviewed report identity mismatch");
const metricFields = ["complexity", "statements", "branches", "coverage", "crap", "missingCoverage", "statementObservations", "branchObservations", "functionEntries"];
const after = [], changes = [], recovered = { fnMap: 0, "branch-root": 0, "owned-body": 0, missing: 0, ambiguous: 0 };
for (const [file, source] of Object.entries(snapshot.sources)) {
  const data = coverage[Object.keys(coverage).find(path => path.endsWith(`/${file}`))];
  if (!data) throw new Error(`Missing retained file coverage: ${file}`);
  const oldRows = oldModule.analyzeFile(file, source, data);
  for (const row of oldRows) {
    const retained = beforeByKey.get(key(row));
    if (!retained || metricFields.some(field => JSON.stringify(row[field]) !== JSON.stringify(retained[field]))) throw new Error(`Historical calculation mismatch: ${key(row)}`);
  }
  for (const row of analyzeFile(file, source, data)) {
    const before = beforeByKey.get(key(row));
    if (!before || before.complexity !== row.complexity) throw new Error(`AST identity/complexity changed: ${key(row)}`);
    after.push(row);
    if (!before.functionEntries.length) recovered[row.mapping]++;
    const effects = Object.fromEntries(metricFields.filter(field => JSON.stringify(before[field]) !== JSON.stringify(row[field]))
      .map(field => [field, { before: before[field], after: row[field] }]));
    if (Object.keys(effects).length) changes.push({ file, function: row.function, line: row.line, mapping: row.mapping, effects });
  }
}
if (after.length !== original.functions.length) throw new Error("Historical scope changed");
const reviewedFields = [...metricFields, "mapping", "statementBasis", "mappingProblems", "entryProofs"];
const changesFromReviewed = after.flatMap(row => {
  const before = reviewedByKey.get(key(row));
  if (!before || before.complexity !== row.complexity) throw new Error(`Reviewed AST identity/complexity changed: ${key(row)}`);
  const effects = Object.fromEntries(reviewedFields.filter(field => JSON.stringify(before[field]) !== JSON.stringify(row[field]))
    .map(field => [field, { before: before[field], after: row[field] }]));
  return Object.keys(effects).length ? [{ file: row.file, function: row.function, line: row.line, effects,
    rejectedBranchObservations: row.rejectedBranchObservations }] : [];
});
if (reviewed.functions.some(before => before.missingCoverage && !after.find(row => key(row) === key(before))?.missingCoverage))
  throw new Error("A reviewed missing observation gained credit");
const failures = after.filter(row => row.missingCoverage || row.crap > policy.maximumFunctionCrap);
const report = { advisoryOnly: true, sourceRef: ref, criterion: policy.maximumFunctionCrap,
  functions: after.sort((a, b) => b.crap - a.crap), failures, passed: failures.length === 0 };
const revisedBytes = gzipSync(JSON.stringify(report));
writeFileSync(`${directory}/corrected-report.json.gz`, revisedBytes);
const inputManifest = manifest();
const inputChanges = Object.keys({ ...frozen.files, ...inputManifest.files }).filter(file => frozen.files[file] !== inputManifest.files[file]);
const coverageEffect = comparison => changes.filter(row => row.effects.coverage && comparison(row.effects.coverage.after, row.effects.coverage.before)).length;
const summary = { advisoryOnly: true, command: `node scripts/crap-mapping-audit.mjs ${directory}`, sourceRef: ref,
  criterion: policy.maximumFunctionCrap, mutationCriteriaUnchanged: policy.mutationScoreMinimum,
  node: process.version, typescript: ts.version, inputManifest,
  inputs: { sourceSnapshotSha256: sha256(snapshotBytes), retainedCoverageSha256: sha256(rawBytes), retainedReportSha256: sha256(originalBytes),
    frozenReporterSha256: frozen.files["scripts/crap.mjs"], correctedReporterSha256: sha256(readFileSync("scripts/crap.mjs")),
    reviewedReportSha256: sha256(reviewedBytes),
    installedV8ProviderSha256: sha256(readFileSync("node_modules/@vitest/coverage-v8/dist/provider.js")) },
  originalCalculationReproduced: true, sourceHashes: snapshot.sourceHashes, inputChanges,
  before: { functions: original.functions.length, emptyEntries: original.functions.filter(row => !row.functionEntries.length).length,
    missing: original.functions.filter(row => row.missingCoverage).length, failures: original.failures.length, passed: original.passed },
  after: { functions: after.length, emptyEntries: after.filter(row => !row.functionEntries.length).length,
    mappings: Object.fromEntries([...new Set(after.map(row => row.mapping))].map(mapping => [mapping, after.filter(row => row.mapping === mapping).length])),
    missing: after.filter(row => row.missingCoverage).length, failures: failures.length, passed: report.passed },
  previouslyEmpty: recovered, changedFunctions: changes.length,
  coverageChanges: { increased: coverageEffect((a, b) => a > b), decreased: coverageEffect((a, b) => a < b), unchanged: after.length - coverageEffect((a, b) => a !== b) },
  fromReviewed3084563: { changedFunctions: changesFromReviewed.length,
    coverageIncreased: changesFromReviewed.filter(row => row.effects.coverage && row.effects.coverage.after > row.effects.coverage.before).length,
    coverageDecreased: changesFromReviewed.filter(row => row.effects.coverage && row.effects.coverage.after < row.effects.coverage.before).length,
    priorMissingObservationsRemainFailures: true },
  failures: failures.map(({ file, function: name, line, complexity, coverage, crap, missingCoverage, mappingProblems }) =>
    ({ file, function: name, line, complexity, coverage, crap, missingCoverage, mappingProblems })),
  originalReceiptsModified: false, backendExecutions: 0, correctedReportSha256: sha256(revisedBytes) };
writeFileSync(`${directory}/effects.json.gz`, gzipSync(JSON.stringify(changes)));
writeFileSync(`${directory}/effects-from-3084563.json.gz`, gzipSync(JSON.stringify(changesFromReviewed)));
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ before: summary.before, after: summary.after, previouslyEmpty: recovered,
  changedFunctions: changes.length, coverageChanges: summary.coverageChanges, fromReviewed3084563: summary.fromReviewed3084563, inputChanges }, null, 2));
