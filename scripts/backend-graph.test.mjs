import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync, chmodSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importedInputs, manifest, sha256 } from "./backend-scope.mjs";
import { mutationConfig, checkRegression } from "./backend-quality.mjs";
import { checkSandbox, checkSuites, checkPreflight, snapshotSuites, sandboxHashes, instrumentationFor, TestStatus } from "./backend-suites.mjs";
import { guardRunner } from "./backend-vitest-runner.mjs";

test("the real selected mobile import graph, package and compiler inputs survive Stryker selection without entering mutation scope", async () => {
  const inputs = manifest();
  for (const file of ["apps/mobile/src/modules/local-entry-drafts/store.ts", "apps/mobile/src/modules/local-entry-drafts/money.ts",
    "apps/mobile/src/modules/local-entry-drafts/account-setup.ts", "apps/mobile/package.json", "apps/mobile/tsconfig.json"])
    assert.equal(inputs.files[file], sha256(readFileSync(file)), file);
  assert.ok(!inputs.mutationFiles.some(file => file.startsWith("apps/")));
  assert.equal(inputs.mutationTests.selected.length, 31);
  assert.deepEqual(inputs.mutationTests.excluded, ["convex/budgetCapacity.load.test.ts"]);
  await import("@stryker-mutator/core");
  const { ProjectReader } = await import(new URL("./fs/project-reader.js", import.meta.resolve("@stryker-mutator/core")));
  const { defaultOptions } = await import(new URL("./config/index.js", import.meta.resolve("@stryker-mutator/core")));
  const config = mutationConfig(JSON.parse(readFileSync("stryker.config.json")), inputs.mutationFiles, Object.keys(inputs.files), "report.json");
  const selected = await new ProjectReader(fs, {}, { ...defaultOptions, ...config }).resolveInputFileNames();
  for (const file of Object.keys(inputs.files).filter(file => !file.split("/").includes("node_modules"))) assert.ok(selected.includes(resolve(file)), file);
});
test("transitive imported source changes invalidate reuse and missing input fails sandbox validation", t => {
  const root = mkdtempSync(join(tmpdir(), "lukapp-imports-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "apps/mobile"), { recursive: true });
  writeFileSync(join(root, "test.ts"), 'import { value } from "./apps/mobile/store";');
  writeFileSync(join(root, "apps/mobile/store.ts"), 'export { value } from "./value";');
  writeFileSync(join(root, "apps/mobile/value.ts"), "export const value = 1;");
  writeFileSync(join(root, "apps/mobile/package.json"), '{"type":"module"}');
  const graph = importedInputs(["test.ts"], root);
  assert.deepEqual(graph.files, ["apps/mobile/package.json", "apps/mobile/store.ts", "apps/mobile/value.ts", "test.ts"]);
  const inputs = { files: Object.fromEntries(graph.files.map(file => [file, sha256(readFileSync(join(root, file)))])), mutationFiles: [] };
  inputs.instrumentation = instrumentationFor(inputs, "full-diagnostic");
  inputs.sandboxHashes = { ...inputs.files };
  assert.equal(checkSandbox(inputs, root, []).passed, true);
  writeFileSync(join(root, "apps/mobile/value.ts"), "export const value = 2;");
  assert.deepEqual(checkSandbox(inputs, root, []).failures, [{ file: "apps/mobile/value.ts", reason: "changed-input" }]);
  rmSync(join(root, "apps/mobile/store.ts"));
  assert.ok(checkSandbox(inputs, root, []).failures.some(row => row.reason === "missing-input"));
  assert.throws(() => importedInputs(["test.ts"], root), /Unresolved local import/);
});
const suites = () => [{ file: "selected.test.ts", status: "pass", errors: [], tests: [{ name: "real case", status: "pass" }] }];
const tests = () => [{ id: "selected.test.ts#real case", status: TestStatus.Success }];
test("empty failed suites, missing files, skipped/uncollected cases and flattened omissions fail closed", () => {
  assert.equal(checkSuites(["selected.test.ts"], suites(), tests()).passed, true);
  for (const observed of [[], [{ ...suites()[0], status: "fail", tests: [] }], [{ ...suites()[0], tests: [] }],
    [{ ...suites()[0], tests: [{ name: "real case", status: null }] }], [{ ...suites()[0], errors: ["suite failed"] }]])
    assert.equal(checkSuites(["selected.test.ts"], observed, tests()).passed, false);
  for (const status of ["skip", "todo", "fail"]) assert.equal(checkSuites(["selected.test.ts"], [{ ...suites()[0], tests: [{ name: "real case", status }] }]).passed, false);
  assert.equal(checkSuites(["selected.test.ts"], suites(), []).passed, false);
  assert.equal(checkSuites(["selected.test.ts"], suites(), [{ id: "selected.test.ts#different case", status: TestStatus.Success }]).passed, false);
});
test("preflight verification rederives identities and rejects absent or failed evidence", () => {
  const inputs = { digest: "bound", files: {}, mutationFiles: [], sandboxHashes: {}, instrumentation: { selection: "full-diagnostic", files: [] }, mutationTests: { selected: ["selected.test.ts"] } };
  const evidence = { inputDigest: "bound", status: "complete", suites: suites(), runnerTests: tests(), instrumentation: inputs.instrumentation, configured: [], sandbox: { passed: true, failures: [], instrumentation: inputs.instrumentation, configured: [], observations: {} } };
  assert.equal(checkPreflight(evidence, inputs, [], "full-diagnostic").passed, true);
  assert.equal(checkPreflight(undefined, inputs, [], "full-diagnostic").passed, false);
  assert.equal(checkPreflight({ ...evidence, inputDigest: "changed" }, inputs, [], "full-diagnostic").passed, false);
  assert.equal(checkPreflight({ ...evidence, suites: [], passed: true }, inputs, [], "full-diagnostic").passed, false);
  assert.equal(checkPreflight({ ...evidence, expectedIdentities: ["selected.test.ts#omitted"] }, inputs, [], "full-diagnostic").passed, false);
});
test("the installed-runner guard rejects its complete flattened result when the actual suite failed to collect", async t => {
  const root = mkdtempSync(join(tmpdir(), "lukapp-runner-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, "preflight.json");
  const file = { filepath: resolve("selected.test.ts"), result: { state: "fail", errors: [{ message: "missing imported source" }] }, tasks: [] };
  const runner = guardRunner({ options: { mutate: [] }, dryRun: async () => ({ status: "complete", tests: [] }), ctx: { state: { getFiles: () => [file] } } },
    { digest: "bound", files: {}, mutationFiles: [], sandboxHashes: {}, instrumentation: { selection: "full-diagnostic", files: [] }, mutationTests: { selected: ["selected.test.ts"] } }, output);
  assert.equal((await runner.dryRun({})).status, "error");
  const evidence = JSON.parse(readFileSync(output));
  assert.equal(evidence.check.passed, false);
  assert.equal(evidence.suites[0].errors[0].messages[0], "missing imported source");
});
test("nested suite errors and unexecuted leaves survive snapshot flattening", () => {
  const snapshot = snapshotSuites([{ filepath: resolve("selected.test.ts"), result: { state: "pass" }, tasks: [
    { type: "suite", name: "nested", result: { state: "fail" }, tasks: [{ type: "test", name: "case" }] }] }]);
  assert.equal(checkSuites(["selected.test.ts"], snapshot).passed, false);
  assert.deepEqual(snapshot[0].tests, [{ name: "nested case", status: null }]);
});
test("regression summary rejects a missing or unloadable selected suite despite positive totals", () => {
  const inputs = { mutationTests: { selected: ["selected.test.ts"], excluded: ["convex/budgetCapacity.load.test.ts"] } };
  const report = { success: true, numTotalTests: 1, numPassedTests: 1, testResults: [] };
  assert.equal(checkRegression(report, inputs).regressionPassed, false);
});

test("the actual all-mode CLI never invokes mutation after regression/suite-load failure", t => {
  const root = mkdtempSync(join(tmpdir(), "lukapp-all-stop-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "quality/backend"), { recursive: true });
  for (const file of ["backend-quality.mjs", "backend-scope.mjs", "backend-suites.mjs", "backend-mutation.mjs", "crap.mjs", "backend-ast-coverage.mjs"])
    cpSync(`scripts/${file}`, join(root, "scripts", file));
  mkdirSync(join(root, "patches"));
  cpSync("patches/ast-v8-to-istanbul@0.3.12.patch", join(root, "patches/ast-v8-to-istanbul@0.3.12.patch"));
  cpSync("quality/backend/policy.json", join(root, "quality/backend/policy.json"));
  symlinkSync(resolve("node_modules"), join(root, "node_modules"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  mkdirSync(join(root, "bin"));
  const pnpm = join(root, "bin/pnpm");
  writeFileSync(pnpm, String.raw`#!${process.execPath}
import fs from "node:fs";
const args=process.argv.slice(2);
if(args[0]==="--version")console.log("fixture");
else{fs.appendFileSync("commands.jsonl",JSON.stringify(args)+"\n"); if(args.includes("stryker"))process.exit(99); const file=args.find(a=>a.startsWith("--outputFile="))?.slice(13);if(file)fs.writeFileSync(file,JSON.stringify({success:false,numTotalTests:1,numPassedTests:1,testResults:[{name:process.cwd()+"/convex/unloadable.test.ts",status:"failed",assertionResults:[]}]}));process.exit(1);}
`);
  chmodSync(pnpm, 0o755);
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  const result = spawnSync(process.execPath, ["scripts/backend-quality.mjs", "all"], { cwd: root, encoding: "utf8",
    env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` } });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(readdirSync(root).includes("commands.jsonl"), result.stderr + result.stdout);
  const calls = readFileSync(join(root, "commands.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("vitest"));
  const directory = readdirSync(join(root, "quality/backend/runs"))[0];
  const receipt = JSON.parse(readFileSync(join(root, "quality/backend/runs", directory, "receipt.json")));
  assert.equal(receipt.passed, false);
  assert.deepEqual(receipt.stages.map(stage => stage.name), ["coverage-crap"]);
  assert.equal(receipt.stages[0].regression.regressionPassed, false);
});

test("sandbox binding predicts the installed TypeScript config rewrite exactly and still rejects changed options", async t => {
  const inputs = { files: { "tsconfig.json": sha256(readFileSync("tsconfig.json")) }, mutationFiles: [] };
  inputs.instrumentation = instrumentationFor(inputs, "full-diagnostic");
  const hashes = await sandboxHashes(inputs, { mutate: [] });
  const expected = JSON.stringify(JSON.parse(readFileSync("tsconfig.json")), null, 2);
  assert.equal(hashes["tsconfig.json"], sha256(expected));
  const retained = JSON.parse(readFileSync("scripts/fixtures/backend-quality/graph-correction/tsconfig-format-only.json"));
  assert.equal(retained.parsedIdentical, true);
  assert.equal(hashes["tsconfig.json"], retained.sandboxSha256);
  assert.notEqual(hashes["tsconfig.json"], inputs.files["tsconfig.json"]);
  const root = mkdtempSync(join(tmpdir(), "lukapp-config-binding-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "tsconfig.json"), expected);
  assert.equal(checkSandbox({ ...inputs, sandboxHashes: hashes }, root, []).passed, true);
  const changed = JSON.parse(expected); changed.compilerOptions.strict = false;
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify(changed, null, 2));
  assert.equal(checkSandbox({ ...inputs, sandboxHashes: hashes }, root, []).passed, false);
});

test("historical raw numeric statuses retain suite identity validation but lack the new instrumented scope binding", () => {
  const dir = "scripts/fixtures/backend-quality/graph-correction/dry-run-r2";
  const evidence = JSON.parse(readFileSync(`${dir}/preflight.json`));
  const { inputs } = JSON.parse(readFileSync(`${dir}/preflight-inputs.json`));
  assert.equal(checkPreflight(evidence, inputs, inputs.mutationFiles, "full-diagnostic").passed, false);
  const result = checkSuites(inputs.mutationTests.selected, evidence.suites, evidence.runnerTests);
  assert.equal(result.passed, true);
  assert.equal(result.files, 31);
  assert.equal(result.tests, 360);
  assert.ok(evidence.runnerTests.every(test => test.status === TestStatus.Success));
  assert.equal(JSON.parse(readFileSync(`${dir}/execution.json`)).exitStatus, 1);
  for (const status of [TestStatus.Failed, TestStatus.Skipped, undefined, null, 99, "success"]) {
    const changed = structuredClone(evidence);
    changed.runnerTests[0].status = status;
    assert.equal(checkSuites(inputs.mutationTests.selected, changed.suites, changed.runnerTests).passed, false);
  }
  const missing = structuredClone(evidence);
  missing.runnerTests.pop();
  assert.equal(checkSuites(inputs.mutationTests.selected, missing.suites, missing.runnerTests).passed, false);
  const omitted = structuredClone(evidence);
  omitted.suites = omitted.suites.filter(suite => suite.file !== "convex/mobileSetupRetry.test.ts");
  omitted.runnerTests = omitted.runnerTests.filter(test => !test.id.startsWith("convex/mobileSetupRetry.test.ts#"));
  assert.equal(checkSuites(inputs.mutationTests.selected, omitted.suites, omitted.runnerTests).passed, false);
});
