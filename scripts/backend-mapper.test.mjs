import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { parseAstAsync } from "vitest/node";
import { manifest, coverageFormat, sha256 } from "./backend-scope.mjs";
import { analyzeFile } from "./crap.mjs";
const require = createRequire(import.meta.resolve("@vitest/coverage-v8"));
const mapperFile = require.resolve("ast-v8-to-istanbul");
const mapper = (await import(pathToFileURL(mapperFile))).default;
async function convert(map, [filename, wrapperLength, sources, functions]) {
  return map({ code: sources.source, sourceMap: sources.sourceMap?.sourcemap, ast: await parseAstAsync(sources.source),
    coverage: { functions, url: filename }, wrapperLength,
    ignoreNode(node, type) {
      if (type === "statement" && node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name.startsWith("__vite_ssr_import_")) return true;
      if (type === "statement" && node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression" && node.expression.left.type === "MemberExpression" && node.expression.left.object.type === "Identifier" && node.expression.left.object.name === "__vite_ssr_exports__") return true;
      return false;
    } });
}
test("the effective installed mapper and committed patch have the exact approved identities in reuse inputs", () => {
  const inputs = manifest();
  assert.equal(coverageFormat.mapper.version, "0.3.12");
  assert.equal(sha256(readFileSync(mapperFile)), coverageFormat.mapper.installedSha256);
  assert.equal(sha256(readFileSync(coverageFormat.mapper.patch)), coverageFormat.mapper.patchSha256);
  assert.equal(inputs.files[coverageFormat.mapper.patch], coverageFormat.mapper.patchSha256);
  assert.equal(inputs.files[mapperFile.slice(process.cwd().length + 1)], coverageFormat.mapper.installedSha256);
  assert.equal(coverageFormat.format, "vitest-v8-3.2.7-ast-flattened-logicals-v1");
});
test("installed patch recovers actual retained callback counts zero and one without altering prior counters", async () => {
  for (const [label, directory, count] of [
    ["representative-before", "representative", 0], ["representative-after", "representative-after-regression", 1],
  ]) {
    const dir = `scripts/fixtures/backend-quality/ast-remapping/${directory}`;
    const inputs = JSON.parse(gunzipSync(readFileSync(`${dir}/conversion-inputs.json.gz`)));
    const actual = JSON.parse(JSON.stringify(await convert(mapper, inputs[0])));
    const expected = JSON.parse(readFileSync(`scripts/fixtures/backend-quality/mapper-diagnosis/${label}-corrected.json`));
    assert.deepEqual(actual, expected);
    const summary = JSON.parse(readFileSync("scripts/fixtures/backend-quality/mapper-diagnosis/comparison.json")).runs.find(run => run.dataset === label);
    for (const kind of ["f", "s", "b"]) assert.deepEqual(summary.counterChanges[kind].changedOrMissing, []);
    const file = "src/savingsRecovery/commands.ts", text = readFileSync(`${dir}/source.ts.txt`, "utf8");
    const rows = analyzeFile(file, text, Object.values(actual)[0], coverageFormat.format);
    assert.equal(rows.mappingFailures.length, 0);
    assert.equal(rows.filter(row => row.missingCoverage).length, 0);
    const callback = rows.find(row => row.function === "anonymous@188:78");
    assert.deepEqual(callback.functionEntries, [count]);
    assert.equal(callback.coverage, count === 0 ? 0 : 100);
  }
});
test("installed patch preserves every retained tiny function and branch counter including all zero evidence", async () => {
  const input = JSON.parse(readFileSync("scripts/fixtures/backend-quality/ast-remapping/ast/conversion-inputs.json"))[0];
  const actual = JSON.parse(JSON.stringify(await convert(mapper, [input.filename, input.wrapperLength, input.sources, input.functions])));
  const expected = JSON.parse(readFileSync("scripts/fixtures/backend-quality/ast-remapping/ast/coverage-final.json"));
  assert.deepEqual(actual, expected);
  const data = Object.values(actual)[0];
  assert.equal(Object.values(data.f).filter(count => count === 0).length, 11);
  for (let id = 0; id < 9; id++) assert.deepEqual(data.b[id], [0, 1]);
  assert.deepEqual(data.b[9], [0, 0]);
  assert.equal(data.f[14], 2);
});
async function originalMapper(t) {
  const directory = mkdtempSync(join(tmpdir(), "lukapp-original-mapper-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  symlinkSync(resolve(dirname(mapperFile), "../.."), join(directory, "node_modules"));
  writeFileSync(join(directory, "original.mjs"), readFileSync("scripts/fixtures/backend-quality/mapper-diagnosis/mapper-original.mjs.txt"));
  return (await import(pathToFileURL(join(directory, "original.mjs")))).default;
}
async function synthetic(map, code) {
  const ast = await parseAstAsync(code), functions = [{ functionName: "", isBlockCoverage: true,
    ranges: [{ startOffset: 0, endOffset: code.length, count: 1 }] }];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) functions.push({ functionName: node.id?.name ?? "", isBlockCoverage: true,
      ranges: [{ startOffset: node.start, endOffset: node.end, count: node.type === "FunctionDeclaration" ? 1 : 0 }] });
    for (const [key, value] of Object.entries(node)) if (key !== "parent") {
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
  return map({ code, ast, coverage: { functions, url: "file:///tmp/lukapp-mapper-fixture.js" } });
}
test("flattened nested logical expressions keep child functions visible and emit no duplicate branch group", async () => {
  const code = "function f(x) { return (x && (() => 1)) || (() => 2); }";
  const data = Object.values(await synthetic(mapper, code))[0];
  assert.equal(Object.keys(data.fnMap).length, 3);
  assert.deepEqual(Object.values(data.f), [1, 0, 0]);
  assert.equal(Object.keys(data.branchMap).length, 1);
  assert.equal(data.branchMap[0].locations.length, 3);
});
test("explicit next/file/if/else ignore hints retain installed behavior inside and beside nested logical expressions", async t => {
  const original = await originalMapper(t);
  for (const code of [
    "/* c8 ignore file */\nfunction f(x) { return (x && (() => 1)) || (() => 2); }",
    "function f(x) { /* c8 ignore next */ return (x && (() => 1)) || (() => 2); }",
    "/* c8 ignore next */\nfunction f(x) { return (x && (() => 1)) || (() => 2); }",
    "function f(x) { /* c8 ignore if */ if (x) { return (x && (() => 1)) || (() => 2); } return 0; }",
    "function f(x) { /* c8 ignore else */ if (x) return 0; else { return (x && (() => 1)) || (() => 2); } }",
  ]) assert.deepEqual(await synthetic(mapper, code), await synthetic(original, code), code);
});

test("an explicit next hint on a function inside a flattened logical operand still excludes that function", async t => {
  const original = await originalMapper(t);
  const code = "function f(x) { return (x && /* c8 ignore next */ function ignored() { return 1; }) || (() => 2); }";
  const patched = Object.values(await synthetic(mapper, code))[0];
  const before = Object.values(await synthetic(original, code))[0];
  assert.ok(!Object.values(patched.fnMap).some(fn => fn.name === "ignored"));
  assert.deepEqual(Object.values(patched.f), [1, 0]);
  assert.deepEqual(patched, before);
});
