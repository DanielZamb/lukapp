import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { parseArguments, checkStages, mutationConfig, verifyReceipt } from "./backend-quality.mjs";
import { manifest, compilerConfigurationFiles, areaFor, policy, sha256 } from "./backend-scope.mjs";
import { analyzeFile } from "./crap.mjs";

function authReceipt(t) {
  const directory = mkdtempSync(join(tmpdir(), "lukapp-receipt-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const inputs = manifest();
  const report = { files: Object.fromEntries(inputs.mutationFiles.filter(file => areaFor(file) === "auth")
    .map(file => [file, { source: readFileSync(file, "utf8"), mutants: [{ id: file, status: "Killed" }] }])) };
  const bytes = gzipSync(JSON.stringify(report));
  writeFileSync(join(directory, "auth-mutation.json.gz"), bytes);
  const receipt = { mode: "mutation", area: "auth", manifest: inputs, stages: [{ name: "auth", exitStatus: 0, passed: true }],
    passed: true, changedDuringRun: false, artifacts: { "auth-mutation.json.gz": sha256(bytes) } };
  const save = () => writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt));
  save();
  return { directory, receipt, save };
}

test("review A1 rejects incompatible CLI arguments before any execution", () => {
  for (const args of [["all", "auth"], ["coverage", "auth"], ["all", "unknown"], ["verify"],
    ["verify", "directory", "extra"], ["mutation", "auth", "extra"], ["mutation", "unknown"]]) {
    assert.throws(() => parseArguments(args), /Usage/, JSON.stringify(args));
  }
  assert.deepEqual(parseArguments([]), { mode: "all", area: undefined });
  assert.deepEqual(parseArguments(["mutation", "auth"]), { mode: "mutation", area: "auth" });
  assert.deepEqual(parseArguments(["verify", "directory"]), { mode: "verify", area: "directory" });
});

test("review A1 the CLI rejects all auth without starting a run", () => {
  const result = spawnSync(process.execPath, ["scripts/backend-quality.mjs", "all", "auth"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
  assert.equal(result.stdout, "");
});

test("review A1 the actual verifier rejects a source-bound Auth-only receipt labelled all", t => {
  const fixture = authReceipt(t);
  assert.equal(verifyReceipt(fixture.directory).passed, true, "the report itself supplies valid partial Auth evidence");
  assert.equal(verifyReceipt(fixture.directory).fullGatePassed, false);
  fixture.receipt.mode = "all";
  delete fixture.receipt.area;
  fixture.save();
  assert.equal(verifyReceipt(fixture.directory).passed, false);
});

test("review A1 runner and verifier stage plans require exact mode completeness and uniqueness", () => {
  const stages = names => names.map(name => ({ name, passed: true, exitStatus: 0 }));
  const full = ["coverage-crap", ...policy.areas];
  assert.equal(checkStages("all", undefined, stages(full)).valid, true);
  assert.equal(checkStages("all", undefined, stages([...full].reverse())).valid, true);
  for (const name of full) assert.equal(checkStages("all", undefined, stages(full.filter(stage => stage !== name))).valid, false, name);
  for (const extra of ["auth", "unknown"]) assert.equal(checkStages("all", undefined, stages([...full, extra])).valid, false, extra);
  assert.equal(checkStages("all", "auth", stages(full)).valid, false);
  assert.equal(checkStages("coverage", undefined, stages(["coverage-crap"])).valid, true);
  assert.equal(checkStages("mutation", undefined, stages(policy.areas)).valid, true);
  assert.equal(checkStages("mutation", "auth", stages(["auth"])).valid, true);
  assert.equal(checkStages("mutation", "auth", stages(["auth", "budget"])).valid, false);
  for (const mode of [undefined, "verify", "unknown"]) assert.equal(checkStages(mode, undefined, stages(full)).valid, false);
  assert.equal(checkStages("all", undefined, undefined).valid, false);
});

test("review A1 the actual verifier rejects duplicate and incompatible stages", t => {
  const fixture = authReceipt(t);
  fixture.receipt.stages.push({ ...fixture.receipt.stages[0] });
  fixture.save();
  assert.equal(verifyReceipt(fixture.directory).passed, false);
  fixture.receipt.stages = [{ name: "auth", exitStatus: 0, passed: true }];
  fixture.receipt.mode = "coverage";
  delete fixture.receipt.area;
  fixture.save();
  assert.equal(verifyReceipt(fixture.directory).passed, false);
  fixture.receipt.mode = "mutation";
  fixture.receipt.stages = [{ name: "unknown", exitStatus: 0, passed: true }];
  fixture.save();
  assert.equal(verifyReceipt(fixture.directory).passed, false);
});

test("review A2 the manifest binds the Convex child compiler configuration", t => {
  const fixture = authReceipt(t);
  const child = "convex/tsconfig.json";
  assert.equal(fixture.receipt.manifest.files[child], sha256(readFileSync(child)));
  fixture.receipt.manifest.files[child] = sha256('{ "extends": "../tsconfig.json", "compilerOptions": { "target": "ES2020" } }');
  fixture.save();
  const result = verifyReceipt(fixture.directory);
  assert.equal(result.passed, false);
  assert.ok(result.changed.includes(child));
});

test("review A2 installed Stryker file selection preserves both applicable compiler configurations", async () => {
  await import("@stryker-mutator/core");
  const { ProjectReader } = await import(new URL("./fs/project-reader.js", import.meta.resolve("@stryker-mutator/core")));
  const { defaultOptions } = await import(new URL("./config/index.js", import.meta.resolve("@stryker-mutator/core")));
  const config = JSON.parse(readFileSync("stryker.config.json", "utf8"));
  const reader = new ProjectReader(fs, {}, { ...defaultOptions, ...config });
  const selected = await reader.resolveInputFileNames();
  assert.ok(selected.includes(resolve("tsconfig.json")));
  assert.ok(selected.includes(resolve("convex/tsconfig.json")));
});

test("review A2 TypeScript resolves transitive JSONC configuration dependencies and the sandbox keeps them", async t => {
  const directory = mkdtempSync(join(tmpdir(), "lukapp-config-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "convex"));
  writeFileSync(join(directory, "convex/tsconfig.json"), '{ "extends": "../tsconfig.json" }');
  writeFileSync(join(directory, "tsconfig.json"), '{ /* JSONC */ "extends": "./compiler-base.json", }');
  writeFileSync(join(directory, "compiler-base.json"), '{ "compilerOptions": { "strict": true } }');
  const files = compilerConfigurationFiles(["convex/tsconfig.json"], directory);
  assert.deepEqual(files, ["compiler-base.json", "convex/tsconfig.json", "tsconfig.json"]);
  const initial = sha256(readFileSync(join(directory, "compiler-base.json")));
  writeFileSync(join(directory, "compiler-base.json"), '{ "compilerOptions": { "strict": false } }');
  assert.notEqual(sha256(readFileSync(join(directory, files[0]))), initial);
  const { ProjectReader } = await import(new URL("./fs/project-reader.js", import.meta.resolve("@stryker-mutator/core")));
  const { defaultOptions } = await import(new URL("./config/index.js", import.meta.resolve("@stryker-mutator/core")));
  const base = JSON.parse(readFileSync("stryker.config.json", "utf8"));
  const config = mutationConfig(base, [], files, "report.json");
  const cwd = process.cwd();
  try {
    process.chdir(directory);
    const selected = await new ProjectReader(fs, {}, { ...defaultOptions, ...config }).resolveInputFileNames();
    for (const file of files) assert.ok(selected.includes(resolve(file)), file);
  } finally {
    process.chdir(cwd);
  }
});

function typeOnlyFixture() {
  const source = `function f(x) {\n  type Erased = number;\n${Array.from({ length: 9 }, (_, i) => `  if (x === ${i}) return ${i};`).join("\n")}\n  return 10;\n}`;
  const loc = { start: { line: 2, column: 2 }, end: { line: 2, column: 23 } };
  return { source, coverage: { statementMap: {}, s: {}, fnMap: {}, f: {},
    branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } } };
}

test("review A3 an erased-only branch cannot turn a missing CC10 function into a pass", () => {
  const { source, coverage } = typeOnlyFixture();
  for (const count of [1, 0]) {
    coverage.b[0] = [count];
    const [row] = analyzeFile("fixture.ts", source, coverage);
    assert.equal(row.complexity, 10);
    assert.equal(row.coverage, 0);
    assert.equal(row.crap, 110);
    assert.equal(row.missingCoverage, true);
    assert.equal(row.branchObservations, 0);
    assert.deepEqual(row.rejectedBranchObservations.map(branch => branch.reason), ["no-owned-executable-position"]);
  }
});

test("review A3 a branch crossing a nested function cannot establish parent invocation", () => {
  const source = "function outer() {\n  const inner = () => 1;\n  return inner;\n}";
  const loc = { start: { line: 2, column: 0 }, end: { line: 2, column: 24 } };
  const rows = analyzeFile("fixture.ts", source, { statementMap: {}, s: {}, fnMap: {}, f: {},
    branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } });
  assert.deepEqual(rows.map(row => row.coverage), [0, 0]);
  assert.deepEqual(rows.map(row => row.missingCoverage), [true, true]);
  assert.equal(rows[0].rejectedBranchObservations[0].reason, "nested-function-overlap");
});

test("review A3 parameter branches require executable initializer positions and retain zero paths", () => {
  const source = "function f(x: boolean = flag ? true : false) { return x; }";
  const loc = value => ({ start: { line: 1, column: source.indexOf(value) }, end: { line: 1, column: source.indexOf(value) + value.length } });
  const base = { statementMap: {}, s: {}, fnMap: {}, f: {} };
  const erased = loc("boolean");
  const [missing] = analyzeFile("fixture.ts", source, { ...base, branchMap: { 0: { type: "branch", loc: erased, locations: [erased] } }, b: { 0: [1] } });
  assert.equal(missing.coverage, 0);
  assert.equal(missing.missingCoverage, true);
  const yes = loc("true"), no = loc("false");
  const coverage = { ...base, branchMap: { 0: { type: "cond-expr", loc: { start: yes.start, end: no.end }, locations: [yes, no] } }, b: { 0: [1, 0] } };
  const [called] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(called.coverage, 50);
  assert.equal(called.branches, 50);
  assert.equal(called.missingCoverage, false);
  coverage.b[0] = [0, 0];
  const [uncalled] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(uncalled.coverage, 0);
  assert.equal(uncalled.missingCoverage, false);
});

test("review A3 rejecting erased branches preserves independent named and V8 root invocation proofs", () => {
  const source = "const f = () => {\n  type Erased = number;\n};";
  const root = { start: { line: 1, column: 10 }, end: { line: 3, column: 2 } };
  const erased = { start: { line: 2, column: 2 }, end: { line: 2, column: 23 } };
  for (const kind of ["named", "branch-root"]) for (const count of [1, 0]) {
    const coverage = { statementMap: {}, s: {}, fnMap: {}, f: {},
      branchMap: { 0: { type: "branch", loc: erased, locations: [erased] } }, b: { 0: [1] } };
    if (kind === "named") { coverage.fnMap[0] = { loc: root }; coverage.f[0] = count; }
    else { coverage.branchMap[1] = { type: "branch", loc: root, locations: [root] }; coverage.b[1] = [count]; }
    const [row] = analyzeFile("fixture.ts", source, coverage);
    assert.equal(row.coverage, count ? 100 : 0);
    assert.equal(row.missingCoverage, false);
    assert.deepEqual(row.functionEntries, [count]);
    assert.equal(row.branchObservations, kind === "named" ? 0 : 1);
  }
});
