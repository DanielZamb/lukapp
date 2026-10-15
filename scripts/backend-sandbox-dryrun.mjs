import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, readdirSync, lstatSync, readlinkSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { manifest, sha256 } from "./backend-scope.mjs";
import { mutationConfig } from "./backend-quality.mjs";
import { sandboxHashes, checkPreflight } from "./backend-suites.mjs";

const dir = process.argv[2] ?? "quality/backend/graph-correction/dry-run";
if (existsSync(`${dir}/engine.log`)) throw new Error("Refusing to overwrite an existing sandbox validation");
mkdirSync(dir, { recursive: true });
const inputs = manifest();
const startedAt = new Date().toISOString();
writeFileSync(`${dir}/manifest-before.json`, JSON.stringify(inputs, null, 2) + "\n");
const config = { ...mutationConfig(JSON.parse(readFileSync("stryker.config.json")), inputs.mutationFiles, Object.keys(inputs.files), resolve(dir, "mutation.json")),
  dryRunOnly: true, concurrency: 1, tempDirName: `.stryker-v01-${dir.split("/").at(-1)}` };
writeFileSync(`${dir}/stryker.json`, JSON.stringify(config, null, 2) + "\n");
writeFileSync(`${dir}/preflight-inputs.json`, JSON.stringify({ inputs: { ...inputs, sandboxHashes: await sandboxHashes(inputs, config) }, output: resolve(dir, "preflight.json") }, null, 2) + "\n");
const log = openSync(`${dir}/engine.log`, "w");
const child = spawn("pnpm", ["exec", "stryker", "run", `${dir}/stryker.json`], { stdio: ["ignore", log, log], detached: true,
  env: { ...process.env, LUKAPP_MUTATION_PREFLIGHT: resolve(dir, "preflight-inputs.json") } });
let timedOut = false, forced;
const timeout = setTimeout(() => {
  timedOut = true;
  process.kill(-child.pid, "SIGTERM");
  forced = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
}, 300000);
const execution = await new Promise(resolve => {
  child.once("error", error => resolve({ status: null, error }));
  child.once("exit", (status, signal) => resolve({ status, signal }));
});
clearTimeout(timeout);
if (forced) { await new Promise(resolve => setTimeout(resolve, 5000)); clearTimeout(forced); }
closeSync(log);
const inventory = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name), info = lstatSync(path);
    if (info.isSymbolicLink()) inventory.push({ path: relative(config.tempDirName, path), symlink: readlinkSync(path) });
    else if (info.isDirectory()) walk(path);
    else inventory.push({ path: relative(config.tempDirName, path), bytes: info.size, hash: sha256(readFileSync(path)) });
  }
}
if (existsSync(config.tempDirName)) walk(config.tempDirName);
writeFileSync(`${dir}/sandbox-inventory.json`, JSON.stringify(inventory, null, 2) + "\n");
const preflight = existsSync(`${dir}/preflight.json`) ? JSON.parse(readFileSync(`${dir}/preflight.json`)) : undefined;
const check = checkPreflight(preflight, inputs);
const after = manifest();
const result = { startedAt, finishedAt: new Date().toISOString(), source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
  exitStatus: execution.status, signal: execution.signal, error: execution.error?.message, timeoutMs: 300000, timedOut,
  dryRunOnly: true, workers: 1, beforeDigest: inputs.digest, afterDigest: after.digest, inputChanges: Object.keys(after.files).filter(file => inputs.files[file] !== after.files[file]),
  preflight: check, mutationAcceptance: false };
writeFileSync(`${dir}/execution.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
process.exitCode = execution.status === 0 && check.passed && inputs.digest === after.digest ? 0 : 1;
