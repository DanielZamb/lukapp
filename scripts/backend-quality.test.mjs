import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { crapScore, functionComplexity, analyzeFile } from "./crap.mjs";
import { backendFiles, areaFor, policy } from "./backend-scope.mjs";
import { sha256 } from "./backend-scope.mjs";
import { analyzeMutation } from "./backend-mutation.mjs";

test("CRAP distinguishes uncovered risk and inherent excessive complexity", () => {
  assert.equal(crapScore(5, 100), 5);
  assert.equal(crapScore(5, 0), 30);
  assert.equal(crapScore(32, 100), 32);
  assert.equal(crapScore(10, 50), 22.5);
});
test("AST decisions ignore comments, strings, optional types, and nested functions", () => {
  const source = ts.createSourceFile("fixture.ts", `function f(x?: string) {
    const label = "if while ? &&"; // if for ||
    function nested() { if (x) return 1; return 0; }
    if (x && label) return x ? 1 : 0;
    return 0;
  }`, ts.ScriptTarget.Latest, true);
  assert.equal(functionComplexity(source.statements[0]), 4);
});
test("missing coverage remains explicit instead of silently becoming full coverage", () => {
  const [row] = analyzeFile("fixture.ts", "function f() { return 1; }", undefined);
  assert.equal(row.missingCoverage, true);
  assert.equal(row.coverage, 0);
  assert.equal(row.crap, 2);
});
test("single-line function coverage uses real entry counts and overlapping V8 statement ranges", () => {
  const source = "const f = () => 1;";
  const loc = { start: { line: 1, column: 9 }, end: { line: 1, column: 17 } };
  const coverage = { statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 18 } } }, s: { 0: 1 },
    fnMap: { 0: { loc } }, f: { 0: 0 }, branchMap: {}, b: {} };
  const [uncalled] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(uncalled.coverage, 0);
  assert.equal(uncalled.missingCoverage, false);
  coverage.f[0] = 1;
  assert.equal(analyzeFile("fixture.ts", source, coverage)[0].coverage, 100);
});
test("all backend areas are nonempty and webhook behavior and runtime policy are included", () => {
  const files = backendFiles();
  for (const area of policy.areas) assert.ok(files.some(file => areaFor(file) === area));
  assert.ok(files.includes("convex/clerkWebhook.ts"));
  assert.ok(files.includes("convex/lib/clerk.ts"));
  assert.ok(files.includes("src/budget/types.ts"));
  assert.ok(!files.includes("convex/auth.config.ts"));
  assert.ok(!files.some(file => file.endsWith(".test.ts")));
});
test("mutation receipts deny credit to uncovered, errors, and omitted results", () => {
  const report = statuses => ({ files: { "source.ts": { source: "function f() {}", mutants: statuses.map((status, id) => ({ id: String(id), status })) } } });
  const hashes = { "source.ts": sha256("function f() {}") };
  const result = analyzeMutation(report(["Killed", "Killed", "Killed", "Killed", "NoCoverage"]), ["source.ts"], hashes, 80);
  assert.equal(result.score, 80);
  assert.equal(result.executed, 4);
  assert.equal(result.generated, 5);
  assert.equal(result.passed, true);
  const errors = analyzeMutation(report(["Killed", "CompileError", "RuntimeError", "Ignored", "NotRun"]), ["source.ts"], hashes, 80);
  assert.equal(errors.score, 20);
  assert.equal(errors.executed, 2);
  assert.equal(errors.passed, false);
  assert.equal(analyzeMutation(report(["Killed"]), ["source.ts", "missing.ts"], hashes, 80).passed, false);
  assert.equal(analyzeMutation(report(["Killed"]), ["source.ts"], { "source.ts": "wrong" }, 80).passed, false);
});
