import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases = [
  { name: "duplicate-key", path: "src/accounting/posting.ts", from: "if (existing) {", to: "if (false && existing) {", invariant: "OneJournalPerKey", harm: "A lost reply followed by retry posts the same money twice." },
  { name: "unbalanced-journal", path: "src/accounting/posting.ts", from: "  assertBalancedLines(draft.lines);", to: "  void draft.lines;", invariant: "BalancedJournals", harm: "An invalid internal draft writes unequal debits and credits." },
  { name: "conflicting-payload", path: "src/accounting/posting.ts", from: "if (!sameDraft(existing, draft)) {", to: "if (false) {", invariant: "RequestIntegrity", harm: "A changed amount under an old key is reported as a successful replay." },
  { name: "second-reversal", path: "src/accounting/commands/reversePostedEntry.ts", from: "if (earlier && earlier.idempotencyKey !== input.idempotencyKey) {", to: "if (false && earlier) {", invariant: "UniqueMirroredReversal", harm: "Two callers use different keys to reverse the same entry twice." },
  { name: "wrong-reversal-lines", path: "src/accounting/commands/reversePostedEntry.ts", from: "debitMinorUnits: line.creditMinorUnits,\n      creditMinorUnits: line.debitMinorUnits,", to: "debitMinorUnits: line.debitMinorUnits,\n      creditMinorUnits: line.creditMinorUnits,", invariant: "UniqueMirroredReversal", harm: "Reversing an entry repeats its accounting effect instead of canceling it." },
];
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const scratchManifest = resolve(root, ".orchestrator/scratch-source-files.json");
function listSourcePaths() {
  if (existsSync(scratchManifest)) {
    const paths = JSON.parse(readFileSync(scratchManifest, "utf8"));
    if (!Array.isArray(paths) || paths.length === 0 || !paths.every(path => typeof path === "string")) throw new Error("Scratch source manifest is empty or malformed");
    return paths;
  }
  const listing = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (listing.status !== 0) throw new Error(`Scratch source requires Git metadata or .orchestrator/scratch-source-files.json: ${listing.stderr}`);
  const paths = listing.stdout.split("\0").filter(name => name && !name.startsWith("formal/") && !name.startsWith(".agents/") && existsSync(resolve(root, name)));
  if (paths.length === 0) throw new Error("No product source found for scratch verification");
  return paths;
}
const sourcePaths = listSourcePaths();
const before = new Map(sourcePaths.map(name => [name, hash(resolve(root, name))]));

export function scratchCheckout(label, sourceRef) {
  const scratch = mkdtempSync(resolve(tmpdir(), `lukapp-replay-${label}-`));
  let copiedPaths = sourcePaths;
  if (sourceRef) {
    const archive = spawnSync("git", ["archive", "--format=tar", sourceRef], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    if (archive.status !== 0) throw new Error(`Cannot archive source ref ${sourceRef}: ${archive.stderr}`);
    const extracted = spawnSync("tar", ["-xf", "-", "-C", scratch], { input: archive.stdout });
    if (extracted.status !== 0) throw new Error(`Cannot extract source ref ${sourceRef}: ${extracted.stderr}`);
    const listing = spawnSync("git", ["ls-tree", "-rz", "--name-only", sourceRef], { cwd: root, encoding: "utf8" });
    if (listing.status !== 0) throw new Error(`Cannot list source ref ${sourceRef}`);
    copiedPaths = listing.stdout.split("\0").filter(name => name && !name.startsWith("formal/") && !name.startsWith(".agents/"));
  } else {
    for (const name of sourcePaths) {
      mkdirSync(dirname(resolve(scratch, name)), { recursive: true });
      copyFileSync(resolve(root, name), resolve(scratch, name));
    }
  }
  cpSync(resolve(root, "formal/accounting-replay"), resolve(scratch, "formal/accounting-replay"), { recursive: true });
  const skill = ".agents/skills/verify-accounting-replay";
  if (existsSync(resolve(root, skill))) cpSync(resolve(root, skill), resolve(scratch, skill), { recursive: true });
  symlinkSync(resolve(root, "node_modules"), resolve(scratch, "node_modules"), "dir");
  mkdirSync(resolve(scratch, ".orchestrator/tools"), { recursive: true });
  symlinkSync(resolve(root, ".orchestrator/tools/tla"), resolve(scratch, ".orchestrator/tools/tla"), "dir");
  mkdirSync(resolve(scratch, ".orchestrator/runs"), { recursive: true });
  symlinkSync(resolve(root, ".orchestrator/runs/2026-10-20-v1-replay"), resolve(scratch, ".orchestrator/runs/2026-10-20-v1-replay"), "dir");
  writeFileSync(resolve(scratch, ".orchestrator/scratch-source-files.json"), JSON.stringify(copiedPaths));
  return scratch;
}

export function applyMutation(scratch, name) {
  const mutation = cases.find(row => row.name === name);
  if (!mutation) throw new Error(`Unknown mutation ${name}`);
  const path = resolve(scratch, mutation.path);
  const source = readFileSync(path, "utf8");
  if (source.split(mutation.from).length !== 2) throw new Error(`Mutation needs source review: ${name} no longer has one matching location`);
  writeFileSync(path, source.replace(mutation.from, mutation.to));
  return mutation;
}

export function mutationCheck(out) {
  const results = [];
  for (const mutation of cases) {
    const scratch = scratchCheckout(mutation.name);
    try {
      applyMutation(scratch, mutation.name);
      const target = resolve(out, mutation.name);
      mkdirSync(target, { recursive: true });
      console.log(`Checking isolated real-code mutation ${mutation.name}...`);
      const result = spawnSync(process.execPath, [resolve(scratch, "formal/accounting-replay/check.mjs"), "--out", target], { cwd: scratch, encoding: "utf8", timeout: 240_000, maxBuffer: 32 * 1024 * 1024 });
      writeFileSync(resolve(target, "driver.log"), (result.stdout ?? "") + (result.stderr ?? ""));
      const log = existsSync(resolve(target, "tlc.log")) ? readFileSync(resolve(target, "tlc.log"), "utf8") : "";
      const caught = result.status === 1 && log.includes(`Invariant ${mutation.invariant} is violated`);
      if (!caught) throw new Error(`${mutation.name} did not produce ${mutation.invariant}; inspect ${target}/driver.log`);
      const graph = JSON.parse(readFileSync(resolve(target, "projection.json"), "utf8"));
      const witness = graph.nodes.find(node => node.invariants[mutation.invariant] === false);
      if (!witness) throw new Error(`No real-code counterexample recorded for ${mutation.name}`);
      const row = { name: mutation.name, productPath: mutation.path, invariant: mutation.invariant, detectedByTlc: true, realCodeMutation: true, shortestExtractedCommitTrace: witness.prefix.map(index => graph.commands[index].name), harm: mutation.harm, scratchRemoved: true };
      writeFileSync(resolve(target, "counterexample.json"), JSON.stringify(row, null, 2) + "\n");
      results.push(row);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  const changed = [...before].filter(([name, sha]) => hash(resolve(root, name)) !== sha).map(([name]) => name);
  if (changed.length) throw new Error(`Shared product source changed while verifying: ${changed.join(", ")}`);
  const summary = { status: "PASS_ALL_REAL_CODE_MUTANTS_DETECTED", results, sharedSourceFilesPreserved: before.size, sharedSourceMutations: [], scratchCopiesRemoved: true };
  writeFileSync(resolve(out, "mutations.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}
