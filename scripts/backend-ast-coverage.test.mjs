import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { analyzeFile } from "./crap.mjs";
import { AST_COVERAGE_FORMAT as format } from "./backend-ast-coverage.mjs";
const file = "scripts/fixtures/backend-quality/ast-remapping/fixture/nested.ts";
const source = readFileSync(file, "utf8");
const original = Object.values(JSON.parse(readFileSync("scripts/fixtures/backend-quality/ast-remapping/ast/coverage-final.json")))[0];
const copy = () => structuredClone(original);
const analyze = data => analyzeFile(file, source, data, format);
const failed = rows => { assert.ok(rows.some(row => row.missingCoverage)); assert.ok(rows.filter(row => row.missingCoverage).every(row => row.coverage === 0)); };

test("retained real AST fixture assigns every counter, preserves nine zero paths, eleven uncalled entries and the count-two callback", () => {
  const rows = analyze(copy());
  assert.deepEqual(rows.mappingFailures, []);
  assert.equal(rows.length, 15);
  assert.equal(rows.some(row => row.missingCoverage), false);
  const parent = rows.find(row => row.function === "parent");
  assert.equal(parent.complexity, 10);
  assert.equal(parent.coverage, 50);
  assert.equal(parent.branches, 50);
  assert.equal(parent.crap, 22.5);
  assert.equal(parent.branchObservations, 18);
  assert.deepEqual(rows.assignments.filter(row => row.kind === "branches" && row.owner === 0).map(row => row.count), Array.from({ length: 9 }, () => [0, 1]).flat());
  assert.equal(rows.filter(row => row.functionEntries[0] === 0).length, 11);
  for (const row of rows.filter(row => row.functionEntries[0] === 0)) assert.equal(row.coverage, 0);
  assert.deepEqual(rows.at(-1).functionEntries, [2]);
  assert.equal(rows.at(-1).coverage, 100);
  assert.equal(rows.find(row => row.function === "chosen").coverage, 0);
  assert.deepEqual(original.b[9], [0, 0]);
  const legacy = Object.values(JSON.parse(readFileSync("scripts/fixtures/backend-quality/ast-remapping/legacy/coverage-final.json")))[0];
  assert.equal(analyzeFile(file, source, legacy)[0].missingCoverage, true);
  assert.equal(analyzeFile(file, source, legacy)[0].crap, 110);
});
test("missing function or decision observations never borrow positive entry or statements", () => {
  let data = copy(); delete data.fnMap[1]; delete data.f[1];
  const child = analyze(data)[1]; assert.equal(child.missingCoverage, true); assert.equal(child.coverage, 0);
  data = copy(); delete data.branchMap[0]; delete data.b[0];
  const parent = analyze(data)[0]; assert.equal(parent.missingCoverage, true); assert.equal(parent.coverage, 0);
});
test("invalid starts, nulls outside proven end positions, unknown sentinels, and counts fail without crashing", () => {
  const changes = [
    data => { data.fnMap[0] = null; }, data => { data.branchMap[0] = null; },
    data => { delete data.fnMap[0].loc.start.line; }, data => { data.fnMap[0].loc.start.column = null; },
    data => { data.fnMap[0].loc.end.line = 999; }, data => { data.fnMap[0].loc.end.column = -1; },
    data => { data.fnMap[0].loc.end.column = Infinity; }, data => { data.statementMap[0].start = {}; },
    data => { data.statementMap[0].end.column = "Infinity"; }, data => { data.branchMap[0].locations[1] = { start: { line: 3 }, end: {} }; },
    data => { data.branchMap[0].locations.reverse(); }, data => { data.fnMap[0].decl.end.column = null; },
    data => { data.f[0] = -1; }, data => { data.s[0] = 0.5; }, data => { data.b[0] = [null, 1]; },
    data => { data.b[0] = [0]; }, data => { data.f.orphan = 1; }, data => { data.b[0] = [NaN, 1]; },
  ];
  for (const change of changes) { const data = copy(); change(data); failed(analyze(data)); }
});
test("unassigned erased or nested executable observations fail rather than disappear", () => {
  for (const location of [
    { start: { line: 1, column: 26 }, end: { line: 1, column: 32 } },
    { start: { line: 3, column: 15 }, end: { line: 4, column: null } },
  ]) {
    const data = copy(); data.statementMap.extra = location; data.s.extra = 1;
    failed(analyze(data));
    assert.ok(analyze(data).mappingFailures.some(row => row.id === "extra"));
  }
});
test("same-line nested function selection belongs to the decision and does not invoke either child", () => {
  const text = "function outer(x) { return x ? () => 1 : () => 2; }";
  const ast = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true);
  const nodes = []; function visit(node) { nodes.push(node); ts.forEachChild(node, visit); } visit(ast);
  const loc = node => ({ start: { line: 1, column: node.getStart(ast) }, end: { line: 1, column: node.end } });
  const fns = nodes.filter(node => ts.isFunctionLike(node) && node.body);
  const decision = nodes.find(ts.isConditionalExpression), statement = nodes.find(ts.isReturnStatement);
  const coverage = { fnMap: {}, f: {}, statementMap: {}, s: {}, branchMap: { 0: { type: "cond-expr", loc: loc(decision), locations: [loc(decision.whenTrue), loc(decision.whenFalse)] } }, b: { 0: [1, 0] } };
  fns.forEach((node, index) => { coverage.fnMap[index] = { decl: node.name ? loc(node.name) : { start: loc(node).start, end: { line: 1, column: node.getStart(ast) + 1 } }, loc: loc(node.body) }; coverage.f[index] = index === 0 ? 1 : 0; });
  [statement, ...fns.slice(1).map(node => node.body)].forEach((node, index) => { coverage.statementMap[index] = loc(node); coverage.s[index] = index === 0 ? 1 : 0; });
  const rows = analyzeFile("fixture.ts", text, coverage, format);
  assert.deepEqual(rows.map(row => row.missingCoverage), [false, false, false]);
  assert.deepEqual(rows.map(row => row.coverage), [50, 0, 0]);
  assert.deepEqual(rows.map(row => row.functionEntries), [[1], [0], [0]]);
  coverage.branchMap[0].locations[0] = loc(fns[2]);
  failed(analyzeFile("fixture.ts", text, coverage, format));
});
test("AST mode cannot reinterpret legacy branch roots or unknown format labels", () => {
  const legacy = Object.values(JSON.parse(readFileSync("scripts/fixtures/backend-quality/ast-remapping/legacy/coverage-final.json")))[0];
  failed(analyze(legacy));
  assert.throws(() => analyzeFile(file, source, original, "new-default"), /Unknown coverage format/);
});

test("retained representative AST counters have unique owners while the provider's missing callback remains failing", () => {
  const dir = "scripts/fixtures/backend-quality/ast-remapping/representative";
  const data = Object.values(JSON.parse(readFileSync(`${dir}/coverage-final.json`)))[0];
  const text = readFileSync(`${dir}/source.ts.txt`, "utf8");
  const rows = analyzeFile("src/savingsRecovery/commands.ts", text, data, format);
  assert.equal(rows.length, 54);
  assert.deepEqual(rows.mappingFailures, []);
  assert.equal(rows.filter(row => row.missingCoverage).length, 1);
  const missing = rows.find(row => row.function === "anonymous@188:78");
  assert.equal(missing.missingCoverage, true);
  assert.equal(missing.coverage, 0);
  assert.deepEqual(missing.functionEntries, []);
  const parent = rows.find(row => row.function === "anonymous@187:34");
  assert.equal(parent.missingCoverage, false);
  assert.deepEqual(parent.functionEntries, [1]);
  assert.deepEqual(rows.assignments.filter(row => row.kind === "branches").map(row => row.count), Object.values(data.b).flat());
  assert.equal(rows.assignments.filter(row => row.kind === "statements").length, Object.keys(data.s).length);
});

test("an empty implicit-else location is invalid when the matched source if has an explicit else", () => {
  const data = copy();
  const text = source.replace("if (x === 0) return () => 0;", "if (x === 0) return () => 0; else return 9;");
  const rows = analyzeFile(file, text, data, format);
  failed(rows);
  assert.ok(rows.mappingFailures.some(row => row.kind === "branches" && row.id === "0"));
});
test("an erased type alias observation cannot supply statement coverage for an invoked function", () => {
  const text = "function f() {\n  type Erased = number;\n  return 1;\n}";
  const data = { fnMap: { 0: { decl: { start: { line: 1, column: 9 }, end: { line: 1, column: 10 } },
    loc: { start: { line: 1, column: 13 }, end: { line: 4, column: null } } } }, f: { 0: 1 },
    statementMap: { 0: { start: { line: 2, column: 2 }, end: { line: 2, column: null } },
      1: { start: { line: 3, column: 2 }, end: { line: 3, column: null } } }, s: { 0: 1, 1: 1 }, branchMap: {}, b: {} };
  const rows = analyzeFile("fixture.ts", text, data, format);
  failed(rows);
  assert.ok(rows.mappingFailures.some(row => row.kind === "statements" && row.id === "0"));
});

test("the new public Recovery regression executes the raw V8 predicate but its absent AST observation still fails", () => {
  const dir = "scripts/fixtures/backend-quality/ast-remapping/representative-after-regression";
  const proof = JSON.parse(readFileSync(`${dir}/callback-raw-probe.json`));
  assert.deepEqual(proof.functions[0].ranges, [{ startOffset: 15948, endOffset: 15981, count: 1 }]);
  const data = Object.values(JSON.parse(readFileSync(`${dir}/coverage-final.json`)))[0];
  const rows = analyzeFile("src/savingsRecovery/commands.ts", readFileSync(`${dir}/source.ts.txt`, "utf8"), data, format);
  assert.equal(rows.mappingFailures.length, 0);
  assert.equal(rows.filter(row => row.missingCoverage).length, 1);
  const missing = rows.find(row => row.function === "anonymous@188:78");
  assert.equal(missing.missingCoverage, true);
  assert.equal(missing.coverage, 0);
  assert.deepEqual(missing.functionEntries, []);
});
