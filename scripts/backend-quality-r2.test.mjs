import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { analyzeFile } from "./crap.mjs";

function conditionalCallbacks(count = 0) {
  const returns = Array.from({ length: 9 }, (_, i) => `  if (x === ${i}) return () => ${i};`);
  const source = ["function parent(x) {", "  const observed = 1;", ...returns, "  return undefined;", "}"].join("\n");
  const fnMap = { parent: { loc: { start: { line: 1, column: 0 }, end: { line: 13, column: 1 } } } };
  const f = { parent: 1 }, branchMap = {}, b = {};
  returns.forEach((text, index) => {
    const line = index + 3;
    const loc = { start: { line, column: text.indexOf("return") }, end: { line, column: text.length } };
    branchMap[index] = { type: "branch", loc, locations: [loc] };
    b[index] = [count];
    fnMap[index] = { loc: { start: { line, column: text.indexOf("()") }, end: { line, column: text.length - 1 } } };
    f[index] = 0;
  });
  return { source, coverage: { statementMap: {}, s: {}, fnMap, f, branchMap, b } };
}
function assertAmbiguousParent(row) {
  assert.equal(row.complexity, 10);
  assert.equal(row.mapping, "ambiguous");
  assert.equal(row.missingCoverage, true);
  assert.equal(row.coverage, 0);
  assert.equal(row.statements, 0);
  assert.equal(row.branches, 0);
  assert.equal(row.crap, 110);
  assert.ok(row.mappingProblems.includes("ambiguous-nested-branch-ownership"));
}

test("review r2 positive parent entry cannot erase nine uncovered executable callback paths", () => {
  const { source, coverage } = conditionalCallbacks();
  const [parent, ...children] = analyzeFile("fixture.ts", source, coverage);
  assertAmbiguousParent(parent);
  assert.deepEqual(parent.functionEntries, [1]);
  assert.equal(parent.rejectedBranchObservations.length, 9);
  assert.deepEqual(parent.rejectedBranchObservations.map(branch => branch.count), Array(9).fill(0));
  assert.equal(parent.entryProofs[0].count, 1);
  assert.equal(children.length, 9);
  for (const child of children) {
    assert.equal(child.missingCoverage, false);
    assert.equal(child.coverage, 0);
    assert.equal(child.crap, 2);
    assert.deepEqual(child.functionEntries, [0]);
  }
  assert.equal([parent, ...children].filter(row => row.missingCoverage || row.crap > 30).length, 1);
});

test("review r2 positive owned statements cannot replace rejected zero or positive executable paths", () => {
  for (const count of [0, 1]) {
    const { source, coverage } = conditionalCallbacks(count);
    delete coverage.fnMap.parent;
    delete coverage.f.parent;
    coverage.statementMap[0] = { start: { line: 2, column: 2 }, end: { line: 2, column: 21 } };
    coverage.s[0] = 1;
    const [parent] = analyzeFile("fixture.ts", source, coverage);
    assertAmbiguousParent(parent);
    assert.equal(parent.statementObservations, 1);
    assert.deepEqual(parent.functionEntries, []);
    assert.deepEqual(parent.rejectedBranchObservations.map(branch => branch.count), Array(9).fill(count));
  }
});

test("review r2 accepted positive branches do not hide zero or positive rejected executable paths", () => {
  for (const count of [0, 1]) {
    const { source, coverage } = conditionalCallbacks(count);
    const loc = { start: { line: 3, column: 6 }, end: { line: 3, column: 13 } };
    coverage.branchMap.accepted = { type: "branch", loc, locations: [loc] };
    coverage.b.accepted = [1];
    const [parent] = analyzeFile("fixture.ts", source, coverage);
    assertAmbiguousParent(parent);
    assert.equal(parent.branchObservations, 1);
    assert.deepEqual(parent.functionEntries, [1]);
    assert.equal(parent.rejectedBranchObservations.length, 9);
  }
});

test("review r2 retained zero range 142:0 makes its parent ambiguous despite the positive invocation proof", () => {
  const raw = JSON.parse(gunzipSync(readFileSync("scripts/fixtures/backend-quality/legacy/coverage.json.gz")));
  const snapshot = JSON.parse(gunzipSync(readFileSync("scripts/fixtures/backend-quality/legacy/sources.json.gz")));
  const file = "src/savingsRecovery/commands.ts";
  const data = raw[Object.keys(raw).find(path => path.endsWith(`/${file}`))];
  const rows = analyzeFile(file, snapshot.sources[file], data);
  const parent = rows.find(row => row.function === "anonymous@187:34");
  assert.equal(parent.mapping, "ambiguous");
  assert.equal(parent.missingCoverage, true);
  assert.equal(parent.coverage, 0);
  assert.equal(parent.crap, 20);
  assert.deepEqual(parent.functionEntries, [1]);
  assert.ok(parent.mappingProblems.includes("ambiguous-nested-branch-ownership"));
  assert.deepEqual(parent.rejectedBranchObservations, [{ id: "142:0", count: 0,
    location: { start: { line: 187, column: 111 }, end: { line: 188, column: 110 } }, reason: "nested-function-overlap" }]);
  assert.equal(rows.find(row => row.function === "anonymous@188:78").missingCoverage, true);
});
