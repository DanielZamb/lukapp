import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { manifest, sha256, areaFor } from "./backend-scope.mjs";
import { verifyReceipt, prepareMutationStage } from "./backend-quality.mjs";
import { guardRunner } from "./backend-vitest-runner.mjs";
import { TestStatus, checkPreflight, sandboxHashes, instrumentationFor } from "./backend-suites.mjs";

const checkout = process.cwd();
async function authStage(t, area = "auth") {
  const directory = mkdtempSync(join(tmpdir(), "lukapp-stage-scope-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "bin"));
  const pnpm = join(directory, "bin/pnpm");
  writeFileSync(pnpm, String.raw`#!${process.execPath}
import fs from "node:fs";
if(process.argv[2]==="--version")console.log("scope-fixture");
else {fs.copyFileSync(process.argv.at(-1),process.env.SCOPE_CAPTURE+"/config.json");fs.copyFileSync(process.env.LUKAPP_MUTATION_PREFLIGHT,process.env.SCOPE_CAPTURE+"/binding.json");process.exit(1);}
`);
  chmodSync(pnpm, 0o755);
  const cli = spawnSync(process.execPath, ["scripts/backend-quality.mjs", "mutation", area], { encoding: "utf8",
    env: { ...process.env, PATH: `${join(directory, "bin")}:${process.env.PATH}`, SCOPE_CAPTURE: directory } });
  assert.equal(cli.status, 1, cli.stderr);
  const run = cli.stdout.match(/Receipt: (.+)\/receipt\.json; FAIL/);
  assert.ok(run, cli.stdout + cli.stderr);
  t.after(() => rmSync(run[1], { recursive: true, force: true }));
  const config = JSON.parse(readFileSync(join(directory, "config.json")));
  const binding = JSON.parse(readFileSync(join(directory, "binding.json")));
  assert.deepEqual(config.mutate, binding.inputs.mutationFiles.filter(file => areaFor(file) === area));
  assert.equal(binding.inputs.mutationFiles.length, 86);
  assert.ok(config.mutate.every(file => areaFor(file) === area));
  const sandbox = join(directory, "sandbox");
  mkdirSync(sandbox);
  await import("@stryker-mutator/core");
  const core = import.meta.resolve("@stryker-mutator/core");
  const require = createRequire(core);
  const { disableTypeChecks } = await import(pathToFileURL(require.resolve("@stryker-mutator/instrumenter")));
  const { defaultOptions } = await import(new URL("./config/index.js", core));
  const { Project } = await import(new URL("./fs/project.js", core));
  const { DisableTypeChecksPreprocessor } = await import(new URL("./sandbox/disable-type-checks-preprocessor.js", core));
  const { TSConfigPreprocessor } = await import(new URL("./sandbox/ts-config-preprocessor.js", core));
  const copied = Object.keys(binding.inputs.files).filter(file => !file.split("/").includes("node_modules"));
  const project = new Project(fs, Object.fromEntries(copied.map(file => [resolve(file), { mutate: false }])));
  const log = { debug() {}, warn(message) { throw new Error(message); } }, options = { ...defaultOptions, ...config };
  await new DisableTypeChecksPreprocessor(log, options, disableTypeChecks).preprocess(project);
  await new TSConfigPreprocessor(log, options).preprocess(project);
  for (const file of Object.keys(binding.inputs.files)) {
    const destination = join(sandbox, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.split("/").includes("node_modules") ? readFileSync(file) : await project.files.get(resolve(file)).readContent());
  }
  const output = join(directory, "auth-preflight.json");
  async function observe() {
    const files = () => binding.inputs.mutationTests.selected.map(file => ({ filepath: resolve(file), result: { state: "pass" },
      tasks: [{ type: "test", name: "scope checker fixture", result: { state: "pass" } }] }));
    const tests = binding.inputs.mutationTests.selected.map(file => ({ id: `${file}#scope checker fixture`, status: TestStatus.Success }));
    const runner = { options: config, dryRun: async () => ({ status: "complete", tests }), ctx: { state: { getFiles: files } } };
    process.chdir(sandbox);
    try { await guardRunner(runner, binding.inputs, output).dryRun({}); }
    finally { process.chdir(checkout); }
    return JSON.parse(readFileSync(output));
  }
  function saveReceipt(evidence) {
    const current = manifest();
    const report = { files: Object.fromEntries(current.mutationFiles.filter(file => areaFor(file) === "auth").map(file => [file, { source: readFileSync(file, "utf8"), mutants: [{ id: file, status: "Killed" }] }])) };
    const artifacts = {};
    for (const [file, bytes] of [["auth-mutation.json.gz", gzipSync(JSON.stringify(report))], ["auth-preflight.json", JSON.stringify(evidence)],
      ["auth-stryker.json", JSON.stringify(config)], ["auth-preflight-inputs.json", JSON.stringify(binding)]]) {
      writeFileSync(join(directory, file), bytes); artifacts[file] = sha256(bytes);
    }
    writeFileSync(join(directory, "receipt.json"), JSON.stringify({ mode: "mutation", area: "auth", manifest: current,
      stages: [{ name: "auth", exitStatus: 0, passed: true }], passed: true, changedDuringRun: false, artifacts }));
  }
  return { directory, sandbox, config, binding, observe, saveReceipt };
}
test("Auth stage setup checks changed copied Recovery bytes and the actual final verifier rejects the receipt", async t => {
  const stage = await authStage(t);
  const recovery = "src/savingsRecovery/commands.ts";
  assert.ok(stage.binding.inputs.files[recovery]);
  writeFileSync(join(stage.sandbox, recovery), readFileSync(join(stage.sandbox, recovery), "utf8") + "\nexport const copiedRecoveryTamper = true;\n");
  const observed = await stage.observe();
  stage.saveReceipt(observed);
  const verified = verifyReceipt(stage.directory);
  t.diagnostic(JSON.stringify({ sandbox: observed.sandbox.passed, finalVerifier: verified.passed, failures: observed.sandbox.failures }));
  assert.equal(observed.sandbox.passed, false, "copied Recovery source must not inherit the Auth instrumentation exemption");
  assert.equal(verified.passed, false, "the final verifier must reject changed non-Auth source despite positive flags");
});
test("Auth stage exact scope accepts predicted copied bytes and changes only to selected instrumented inputs", async t => {
  const stage = await authStage(t);
  for (const file of stage.config.mutate) writeFileSync(join(stage.sandbox, file), "instrumented Auth fixture bytes");
  const observed = await stage.observe();
  stage.saveReceipt(observed);
  assert.equal(observed.sandbox.passed, true);
  const verified = verifyReceipt(stage.directory);
  t.diagnostic(JSON.stringify({ sandbox: observed.sandbox.passed, preflightStatus: observed.status, finalVerifier: verified.passed }));
  assert.equal(verified.passed, true);
});

test("every actual per-area CLI setup retains the full manifest and uses exactly its configured instrumented files", async t => {
  for (const area of ["accounting", "auth", "budget", "recovery", "convex"]) {
    const stage = await authStage(t, area);
    assert.equal(stage.binding.inputs.instrumentation.selection, area);
    assert.deepEqual(stage.binding.inputs.instrumentation.files, stage.config.mutate);
    assert.deepEqual(Object.keys(stage.binding.inputs.sandboxHashes).sort(), Object.keys(stage.binding.inputs.files).filter(file => !stage.config.mutate.includes(file)).sort());
    const evidence = await stage.observe();
    assert.equal(evidence.sandbox.passed, true, area);
    assert.equal(checkPreflight(evidence, stage.binding.inputs, stage.config.mutate, area).passed, true, area);
  }
});
test("Auth setup rejects non-area accounting and imported mobile changes, and the verifier rechecks observations despite positive flags", async t => {
  const stage = await authStage(t);
  const valid = await stage.observe();
  for (const file of ["src/accounting/period.ts", "apps/mobile/src/modules/local-entry-drafts/store.ts"]) {
    const destination = join(stage.sandbox, file), original = readFileSync(destination);
    writeFileSync(destination, original + "\nexport const changedCopiedInput = true;\n");
    const evidence = await stage.observe();
    assert.equal(evidence.sandbox.passed, false, file);
    const forgedFlags = structuredClone(valid);
    forgedFlags.sandbox.observations = evidence.sandbox.observations;
    stage.saveReceipt(forgedFlags);
    assert.equal(verifyReceipt(stage.directory).passed, false, file);
    writeFileSync(destination, original);
  }
});
test("actual Auth guard and final verifier reject absent, overbroad, incomplete, duplicate and mismatched scope bindings", async t => {
  const stage = await authStage(t);
  const originalInputs = structuredClone(stage.binding.inputs), originalConfig = structuredClone(stage.config);
  const valid = await stage.observe();
  const mutateCases = [
    () => { delete stage.binding.inputs.instrumentation; },
    () => { delete stage.binding.inputs.instrumentation.files; },
    () => { stage.binding.inputs.instrumentation.files = originalInputs.mutationFiles; },
    () => { stage.binding.inputs.instrumentation.files.pop(); },
    () => { stage.binding.inputs.instrumentation.files.push(stage.config.mutate[0]); },
    () => { stage.binding.inputs.instrumentation.selection = "recovery"; },
    () => { stage.binding.inputs.instrumentation.selection = "unknown"; },
    () => { delete stage.config.mutate; },
    () => { stage.config.mutate = originalInputs.mutationFiles; },
    () => { stage.config.mutate = stage.config.mutate.slice(1); },
    () => { stage.binding.inputs.sandboxHashes["src/access/protocol.ts"] = originalInputs.files["src/access/protocol.ts"]; },
    () => { delete stage.binding.inputs.sandboxHashes["src/savingsRecovery/commands.ts"]; },
  ];
  for (const [index, mutate] of mutateCases.entries()) {
    stage.binding.inputs = structuredClone(originalInputs);
    for (const key of Object.keys(stage.config)) delete stage.config[key];
    Object.assign(stage.config, structuredClone(originalConfig));
    mutate();
    const observed = await stage.observe();
    assert.equal(observed.sandbox.passed, false, `guard case ${index}`);
    stage.saveReceipt(valid);
    assert.equal(verifyReceipt(stage.directory).passed, false, `verifier case ${index}`);
    if (index < 10) await assert.rejects(() => sandboxHashes(stage.binding.inputs, stage.config), /Invalid instrumented scope/);
  }
});
test("the complete 86-file scope is accepted only as an explicit full diagnostic and cannot label an Auth receipt", async t => {
  const stage = await authStage(t);
  const prepared = await prepareMutationStage(manifest(), "full-diagnostic", JSON.parse(readFileSync("stryker.config.json")), "fixture-report.json");
  stage.binding.inputs = prepared.inputs;
  Object.assign(stage.config, prepared.config);
  assert.equal(stage.config.mutate.length, 86);
  const observed = await stage.observe();
  assert.equal(observed.sandbox.passed, true);
  assert.equal(checkPreflight(observed, stage.binding.inputs, stage.config.mutate, "full-diagnostic").passed, true);
  assert.equal(checkPreflight(observed, stage.binding.inputs, stage.config.mutate, "auth").passed, false);
  stage.saveReceipt(observed);
  assert.equal(verifyReceipt(stage.directory).passed, false);
  for (const selection of [undefined, "all", "unknown"]) assert.throws(() => instrumentationFor(manifest(), selection), /invalid instrumented selection/);
});

test("stage preflight and final verification reject missing instrumented files and missing observation or artifact bindings", async t => {
  const stage = await authStage(t);
  const valid = await stage.observe();
  for (const missing of ["instrumentation", "configured", "sandbox.instrumentation", "sandbox.configured", "sandbox.observations"]) {
    const changed = structuredClone(valid), keys = missing.split(".");
    delete (keys.length === 1 ? changed : changed[keys[0]])[keys.at(-1)];
    stage.saveReceipt(changed);
    assert.equal(verifyReceipt(stage.directory).passed, false, missing);
  }
  const destination = join(stage.sandbox, stage.config.mutate[0]);
  rmSync(destination);
  const missingFile = await stage.observe();
  assert.equal(missingFile.sandbox.passed, false);
  assert.ok(missingFile.sandbox.failures.some(row => row.file === stage.config.mutate[0] && row.reason === "missing-input"));
  for (const name of ["auth-stryker.json", "auth-preflight-inputs.json"]) {
    stage.saveReceipt(valid);
    const receipt = JSON.parse(readFileSync(join(stage.directory, "receipt.json")));
    delete receipt.artifacts[name];
    writeFileSync(join(stage.directory, "receipt.json"), JSON.stringify(receipt));
    assert.equal(verifyReceipt(stage.directory).passed, false, name);
  }
});
