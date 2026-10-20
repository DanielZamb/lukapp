import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const out = resolve(root, outFlag < 0 ? "reports/formal-accounting-replay/latest" : args[outFlag + 1]);
mkdirSync(out, { recursive: true });
const refFlag = args.indexOf("--source-ref");
if (refFlag >= 0) {
  const requestedRef = args[refFlag + 1];
  if (!requestedRef || requestedRef.startsWith("--")) throw new Error("--source-ref requires a retained Git commit or ref");
  const resolved = spawnSync("git", ["rev-parse", "--verify", `${requestedRef}^{commit}`], { cwd: root, encoding: "utf8" });
  if (resolved.status !== 0) throw new Error(`Cannot resolve immutable source ref ${requestedRef}`);
  const sourceCommit = resolved.stdout.trim();
  const { scratchCheckout } = await import("./mutations.mjs");
  const scratch = scratchCheckout("snapshot", sourceCommit);
  let result;
  try {
    console.log(`Checking isolated immutable product snapshot ${sourceCommit}...`);
    result = spawnSync(process.execPath, [resolve(scratch, "formal/accounting-replay/check.mjs"), "--out", out, ...(args.includes("--self-test") ? ["--self-test"] : [])], { cwd: scratch, encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  writeFileSync(resolve(out, "source-snapshot.json"), JSON.stringify({ requestedRef, sourceCommit, productSource: "git archive of this immutable commit", verificationSource: root, scratchRemoved: true, exitCode: result.status, error: result.error?.message ?? null }, null, 2) + "\n");
  process.exit(result.status ?? 2);
}
const jar = resolve(root, ".orchestrator/tools/tla/v1.7.4/tla2tools.jar");
const jarSha256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const coveragePath = resolve(root, "formal/accounting-replay/coverage.json");
const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));
const sourceBefore = new Map(coverage.files.map(file => [file.path, hash(resolve(root, file.path))]));
const sourceDrift = coverage.files.filter(file => sourceBefore.get(file.path) !== file.sha256).map(file => file.path);
if (sourceDrift.length) console.log(`Covered source changed since ${coverage.syncCommit}; review the model mapping: ${sourceDrift.join(", ")}. The actual modified code will still be checked.`);
if (!existsSync(jar)) {
  mkdirSync(dirname(jar), { recursive: true });
  const fetched = spawnSync("curl", ["-fsSL", "--retry", "2", "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar", "-o", jar], { encoding: "utf8", timeout: 120_000 });
  if (fetched.status !== 0) throw new Error(`Cannot install pinned TLC: ${fetched.stderr}`);
}
if (hash(jar) !== jarSha256) throw new Error("Pinned TLC jar hash mismatch; do not execute it");

function run(command, argv, log, env = process.env) {
  const result = spawnSync(command, argv, { cwd: root, env, encoding: "utf8", timeout: 240_000, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(resolve(out, log), (result.stdout ?? "") + (result.stderr ?? ""));
  return result;
}

console.log("Extracting bounded transitions by executing the actual accounting code...");
const corpus = run("python3", [".orchestrator/runs/2026-10-20-v1-replay/verify_inputs.py"], "corpus.log");
if (corpus.status !== 0) {
  process.stderr.write(readFileSync(resolve(out, "corpus.log")));
  process.exit(2);
}
const projection = run("pnpm", ["exec", "vitest", "run", "--config", "formal/accounting-replay/vitest.config.ts"], "projection.log", { ...process.env, REPLAY_FORMAL_OUTPUT: out });
if (projection.status !== 0) {
  process.stderr.write(readFileSync(resolve(out, "projection.log")));
  process.exit(2);
}
const graph = JSON.parse(readFileSync(resolve(out, "projection.json"), "utf8"));
const tla = value => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) return `<<${value.map(tla).join(", ")}>>`;
  return `[${Object.entries(value).map(([key, item]) => `${key} |-> ${tla(item)}`).join(", ")}]`;
};
const successors = graph.nodes.map((node, from) => graph.commands.map((_, command) => {
  const matches = graph.edges.filter(edge => edge.from === from && edge.command === command);
  if (matches.length > 1 || (Object.values(node.invariants).every(Boolean) && matches.length !== 1)) throw new Error(`Incomplete or ambiguous extracted transition: state ${from}, command ${command}`);
  // A violated invariant terminates extraction; TLC must encounter it before any later step.
  return matches[0]?.to ?? from;
}));
writeFileSync(resolve(out, "RealLedger.tla"), `---- MODULE RealLedger ----\nCommandNames == ${tla(graph.commands.map(row => row.name))}\nLedgers == ${tla(graph.nodes.map(row => row.projection.entries))}\nIntegrity == ${tla(graph.nodes.map(row => row.projection.requestIntegrity))}\nRollback == ${tla(graph.nodes.map(row => row.projection.rejectedNoWrite))}\nSuccessors == ${tla(successors)}\n====\n`);
copyFileSync(resolve(root, "formal/accounting-replay/Replay.tla"), resolve(out, "Replay.tla"));
copyFileSync(resolve(root, "formal/accounting-replay/Replay.cfg"), resolve(out, "Replay.cfg"));
const distinctPersistedLedgers = new Set(graph.nodes.map(node => JSON.stringify(node.projection.entries))).size;
console.log(`TLC checking ${graph.nodes.length} projected verification states (${distinctPersistedLedgers} distinct persisted ledgers) and ${graph.edges.length} actual command transitions...`);
const checked = run("java", ["-XX:+UseParallelGC", "-Xmx1g", "-Dtlc2.tool.fp.FPSet.impl=tlc2.tool.fp.MemFPSet", "-cp", jar, "tlc2.TLC", "-workers", "1", "-fpbits", "8", "-seed", "1", "-fp", "0", "-metadir", resolve(out, "states"), "-config", resolve(out, "Replay.cfg"), resolve(out, "Replay.tla")], "tlc.log");
const log = readFileSync(resolve(out, "tlc.log"), "utf8");
const pass = checked.status === 0 && log.includes("Model checking completed. No error has been found.");
const stateCount = [...log.matchAll(/([\d,]+) distinct states found/g)].at(-1)?.[1].replaceAll(",", "") ?? "0";
const changedDuringCheck = [...sourceBefore].filter(([path, sha]) => hash(resolve(root, path)) !== sha).map(([path]) => path);
if (changedDuringCheck.length) throw new Error(`Source changed during checking: ${changedDuringCheck.join(", ")}`);
const summary = { at: new Date().toISOString(), status: pass ? "PASS_BOUNDED_REAL_CODE_MODEL" : "FAIL", tlcVersion: "2.19", release: "v1.7.4", jarSha256, fingerprintBackend: "MemFPSet", fingerprintPartitions: 256, syncCommit: coverage.syncCommit, sourceDrift, sourceChangedDuringCheck: [], projectedVerificationStates: graph.nodes.length, distinctPersistedLedgers, actualCommandTransitions: graph.edges.length, modelStates: Number(stateCount), bounds: { concurrentCallers: 2, chosenIntents: 4, attemptsPerIntent: 2, forwardKeys: 2, reversalKeys: 5, minorAmounts: [1, 2], bootstrapLoanMinor: 100 }, output: out, model: "Two admitted fixture callers around atomic accounting mutations; actual code supplies every database edge", runtimeAcceptance: "Local synthetic fixture only. No fresh Clerk/Convex DEV acceptance or whole-system proof." };
writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
if (!pass) process.stderr.write(log);
console.log(JSON.stringify(summary));
if (pass && args.includes("--self-test")) {
  const { mutationCheck } = await import("./mutations.mjs");
  console.log(JSON.stringify(mutationCheck(resolve(out, "mutations"))));
  console.log("Scratch changes removed. Rechecking the untouched baseline...");
  const restored = run(process.execPath, [resolve(root, "formal/accounting-replay/check.mjs"), "--out", resolve(out, "restored")], "restored.log");
  if (restored.status !== 0) throw new Error(`Baseline did not return to its original result; inspect ${out}/restored.log`);
}
process.exit(pass ? 0 : 1);
