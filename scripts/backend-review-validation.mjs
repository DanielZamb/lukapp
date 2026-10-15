import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { manifest, sha256 } from "./backend-scope.mjs";

const directory = process.argv[2];
if (!directory || existsSync(directory)) throw new Error("Provide a new output directory for tooling validation");
mkdirSync(directory, { recursive: true });
const before = manifest();
const receipt = { startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)],
  reviewedHead: "308456396694d0204541b35d75538fb6d0802462",
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), node: process.version,
  scope: "tooling tests and retained-data recalculation only", manifest: before, commands: [],
  backendExecutions: 0, officialQualityExecution: false, artifacts: {} };
function save() { writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n"); }
function execute(name, args) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  for (const stream of ["stdout", "stderr"]) writeFileSync(join(directory, `${name}-${stream}.log.gz`), gzipSync(result[stream] ?? ""));
  receipt.commands.push({ name, executable: process.execPath, args, startedAt, finishedAt: new Date().toISOString(),
    elapsedMs: performance.now() - start, exitStatus: result.status, signal: result.signal, error: result.error?.message ?? null });
  save();
}
save();
execute("tooling-tests", ["--test", "--test-concurrency=2", "scripts/backend-quality.test.mjs", "scripts/backend-quality-review.test.mjs"]);
if (receipt.commands[0].exitStatus === 0) execute("retained-data", ["scripts/crap-mapping-audit.mjs", join(directory, "retained-data")]);
const after = manifest();
receipt.finishedAt = new Date().toISOString();
receipt.inputDigestAfter = after.digest;
receipt.changedInputs = Object.keys({ ...before.files, ...after.files }).filter(file => before.files[file] !== after.files[file]);
receipt.toolingChecksPassed = receipt.commands.length === 2 && receipt.commands.every(command => command.exitStatus === 0) && !receipt.changedInputs.length;
const summaryPath = join(directory, "retained-data/summary.json");
if (existsSync(summaryPath)) {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  receipt.advisoryCrap = { sourceRef: summary.sourceRef, passed: summary.after.passed, failures: summary.after.failures,
    missingObservations: summary.after.missing, fromReviewed3084563: summary.fromReviewed3084563 };
}
function retainHashes(path = directory) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) retainHashes(file);
    else if (resolve(file) !== resolve(directory, "receipt.json")) receipt.artifacts[file.slice(directory.length + 1)] = sha256(readFileSync(file));
  }
}
retainHashes();
save();
console.log(JSON.stringify({ directory, toolingChecksPassed: receipt.toolingChecksPassed, inputDigest: before.digest,
  commands: receipt.commands, advisoryCrap: receipt.advisoryCrap }, null, 2));
process.exitCode = receipt.toolingChecksPassed ? 0 : 1;
