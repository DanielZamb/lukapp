import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
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
test("a missing function map cannot borrow the executing outer declaration line", () => {
  const [row] = analyzeFile("fixture.ts", "const f = () => 1;", {
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 18 } } }, s: { 0: 1 },
    fnMap: {}, f: {}, branchMap: {}, b: {},
  });
  assert.equal(row.coverage, 0);
  assert.equal(row.missingCoverage, true);
  assert.equal(row.statementObservations, 0);
  assert.deepEqual(row.functionEntries, []);
});
test("a named entry tolerates a remapped semicolon and records calls independently of the outer line", () => {
  const source = "const f = () => 1;";
  const loc = { start: { line: 1, column: 9 }, end: { line: 1, column: 18 } };
  const coverage = { statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 18 } } }, s: { 0: 1 },
    fnMap: { 0: { loc } }, f: { 0: 0 }, branchMap: {}, b: {} };
  const [uncalled] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(uncalled.coverage, 0);
  assert.equal(uncalled.missingCoverage, false);
  assert.equal(uncalled.statementObservations, 0);
  assert.deepEqual(uncalled.functionEntries, [0]);
  coverage.f[0] = 1;
  const [called] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(called.coverage, 100);
  assert.equal(called.mapping, "fnMap");
});
test("an anonymous V8 function branch proves invocation, including an explicit uncalled count", () => {
  const loc = { start: { line: 1, column: 10 }, end: { line: 1, column: 18 } };
  const coverage = { statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 18 } } }, s: { 0: 1 },
    fnMap: {}, f: {}, branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } };
  const [called] = analyzeFile("fixture.ts", "const f = () => 1;", coverage);
  assert.equal(called.coverage, 100);
  assert.equal(called.mapping, "branch-root");
  assert.deepEqual(called.functionEntries, [1]);
  assert.equal(called.statementObservations, 0);
  coverage.b[0] = [0];
  const [uncalled] = analyzeFile("fixture.ts", "const f = () => 1;", coverage);
  assert.equal(uncalled.coverage, 0);
  assert.equal(uncalled.missingCoverage, false);
});
test("outer and partial ranges do not masquerade as function calls", () => {
  for (const source of ["const f = () => 1;", "const f = () => 1; const g = 2;"]) {
    const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: source.length } };
    const [row] = analyzeFile("fixture.ts", source, { statementMap: { 0: loc }, s: { 0: 1 },
      fnMap: { 0: { loc } }, f: { 0: 1 }, branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } });
    assert.equal(row.missingCoverage, true);
    assert.equal(row.coverage, 0);
  }
  const source = "const f = () => 1; const g = 2;";
  const [row] = analyzeFile("fixture.ts", source, { statementMap: {}, s: {},
    fnMap: { 0: { loc: { start: { line: 1, column: 10 }, end: { line: 1, column: source.length } } } }, f: { 0: 1 }, branchMap: {}, b: {} });
  assert.equal(row.missingCoverage, true);
  assert.equal(row.coverage, 0);
});
test("a module-wide branch counter cannot establish invocation of a first-line function", () => {
  const source = "function f() { return 1; }";
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: source.length } };
  const [row] = analyzeFile("fixture.ts", source, { statementMap: { 0: loc }, s: { 0: 1 }, fnMap: {}, f: {},
    branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } });
  assert.equal(row.missingCoverage, true);
  assert.equal(row.coverage, 0);
});
test("choosing a function-valued conditional arm does not prove that the chosen function was called", () => {
  const source = "const f = true ? () => 1 : () => 2;";
  const yes = { start: { line: 1, column: 17 }, end: { line: 1, column: 24 } };
  const no = { start: { line: 1, column: 27 }, end: { line: 1, column: 34 } };
  for (const type of ["branch", "cond-expr"]) {
    const locations = type === "branch" ? { 0: { type, loc: yes, locations: [yes] }, 1: { type, loc: no, locations: [no] } } :
      { 0: { type, loc: { start: yes.start, end: no.end }, locations: [yes, no] } };
    const b = type === "branch" ? { 0: [1], 1: [0] } : { 0: [1, 0] };
    const rows = analyzeFile("fixture.ts", source, { statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: locations, b });
    assert.deepEqual(rows.map(row => row.coverage), [0, 0]);
    assert.deepEqual(rows.map(row => row.missingCoverage), [true, true]);
  }
});
test("ambiguous nested selection counters fail closed, while explicit decision paths belong to the parent", () => {
  const source = "function outer(flag) { return flag ? () => 1 : () => 2; }";
  const arm = expression => ({ start: { line: 1, column: source.indexOf(expression) },
    end: { line: 1, column: source.indexOf(expression) + expression.length } });
  const yes = arm("() => 1"), no = arm("() => 2");
  const base = { statementMap: {}, s: {}, fnMap: { 0: { loc: { start: { line: 1, column: 0 }, end: { line: 1, column: source.length } } } }, f: { 0: 1 } };
  const ambiguous = analyzeFile("fixture.ts", source, { ...base,
    branchMap: { 0: { type: "branch", loc: yes, locations: [yes] }, 1: { type: "branch", loc: no, locations: [no] } }, b: { 0: [1], 1: [0] } });
  assert.equal(ambiguous[0].coverage, 0);
  assert.equal(ambiguous[0].missingCoverage, true);
  assert.equal(ambiguous[0].mapping, "ambiguous");
  const explicit = analyzeFile("fixture.ts", source, { ...base,
    branchMap: { 0: { type: "cond-expr", loc: { start: yes.start, end: no.end }, locations: [yes, no] } }, b: { 0: [1, 0] } });
  assert.equal(explicit[0].coverage, 50);
  assert.equal(explicit[0].missingCoverage, false);
  assert.deepEqual(explicit.slice(1).map(row => row.missingCoverage), [true, true]);
});
test("fully owned body statements are usable without borrowing an outer line or requiring a function name", () => {
  const source = "const f = () => {\n  return 1;\n};";
  const coverage = { statementMap: { 0: { start: { line: 2, column: 0 }, end: { line: 2, column: 11 } } }, s: { 0: 1 },
    fnMap: {}, f: {}, branchMap: {}, b: {} };
  const [called] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(called.coverage, 100);
  assert.equal(called.mapping, "owned-body");
  assert.equal(called.missingCoverage, false);
  coverage.s[0] = 0;
  const [uncalled] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(uncalled.coverage, 0);
  assert.equal(uncalled.missingCoverage, false);
});
test("an explicit uncalled body-range entry overrides positive body-line hits", () => {
  const source = "const f = () => {\n  return 1;\n};";
  const [row] = analyzeFile("fixture.ts", source, { statementMap: { 0: { start: { line: 2, column: 0 }, end: { line: 2, column: 11 } } }, s: { 0: 1 },
    fnMap: { 0: { loc: { start: { line: 1, column: 16 }, end: { line: 3, column: 1 } } } }, f: { 0: 0 }, branchMap: {}, b: {} });
  assert.equal(row.coverage, 0);
  assert.equal(row.missingCoverage, false);
  assert.deepEqual(row.functionEntries, [0]);
});
test("a body-range counter shared by a returned function cannot be assigned to either function", () => {
  const source = "const f = () => () => 1;";
  const loc = { start: { line: 1, column: 16 }, end: { line: 1, column: 23 } };
  const rows = analyzeFile("fixture.ts", source, { statementMap: {}, s: {}, fnMap: { 0: { loc } }, f: { 0: 1 }, branchMap: {}, b: {} });
  assert.deepEqual(rows.map(row => row.missingCoverage), [true, true]);
  assert.deepEqual(rows.map(row => row.coverage), [0, 0]);
  assert.deepEqual(rows.map(row => row.mapping), ["ambiguous", "ambiguous"]);
});
test("structural braces and erased type declarations cannot establish body execution", () => {
  const source = "const f = () => {\n  type Value = number;\n};";
  const rows = analyzeFile("fixture.ts", source, { statementMap: {
    0: { start: { line: 2, column: 0 }, end: { line: 2, column: 22 } },
    1: { start: { line: 3, column: 0 }, end: { line: 3, column: 1 } },
  }, s: { 0: 1, 1: 1 }, fnMap: {}, f: {}, branchMap: {}, b: {} });
  assert.equal(rows[0].coverage, 0);
  assert.equal(rows[0].missingCoverage, true);
  assert.equal(rows[0].statementObservations, 0);
});
test("owned branch paths remain conservative when no separate entry or statement is available", () => {
  const source = "const f = x => x ? 1 : 0;";
  const yes = { start: { line: 1, column: 19 }, end: { line: 1, column: 20 } };
  const no = { start: { line: 1, column: 23 }, end: { line: 1, column: 24 } };
  const [row] = analyzeFile("fixture.ts", source, { statementMap: {}, s: {}, fnMap: {}, f: {},
    branchMap: { 0: { type: "cond-expr", loc: { start: yes.start, end: no.end }, locations: [yes, no] } }, b: { 0: [1, 0] } });
  assert.equal(row.coverage, 50);
  assert.equal(row.statements, 50);
  assert.equal(row.branches, 50);
  assert.equal(row.crap, 2.5);
  assert.equal(row.statementBasis, "owned-branches");
  assert.equal(row.missingCoverage, false);
});
test("nested functions cannot inherit an outer call or donate their invocation to a parent", () => {
  const source = "function outer() {\n  const inner = () => 1;\n  return inner;\n}";
  const outer = { start: { line: 1, column: 0 }, end: { line: 4, column: 1 } };
  const inner = { start: { line: 2, column: 16 }, end: { line: 2, column: 24 } };
  const declaration = { start: { line: 2, column: 0 }, end: { line: 2, column: 24 } };
  const coverage = { statementMap: { 0: declaration }, s: { 0: 1 },
    fnMap: { 0: { loc: outer }, 1: { loc: inner } }, f: { 0: 1, 1: 0 }, branchMap: {}, b: {} };
  const rows = analyzeFile("fixture.ts", source, coverage);
  assert.equal(rows[0].coverage, 100);
  assert.equal(rows[0].statementObservations, 0);
  assert.equal(rows[1].coverage, 0);
  assert.deepEqual(rows[1].functionEntries, [0]);
  const onlyChild = analyzeFile("fixture.ts", source, { statementMap: { 0: declaration }, s: { 0: 1 },
    fnMap: {}, f: {}, branchMap: { 0: { type: "branch", loc: inner, locations: [inner] } }, b: { 0: [1] } });
  assert.equal(onlyChild[0].missingCoverage, true);
  assert.equal(onlyChild[0].coverage, 0);
  assert.equal(onlyChild[1].coverage, 100);
  assert.equal(onlyChild[1].mapping, "branch-root");
});
test("conflicting or missing entry counts cannot be repaired with an outer statement hit", () => {
  const loc = { start: { line: 1, column: 10 }, end: { line: 1, column: 18 } };
  const coverage = { statementMap: { 0: { start: { line: 1, column: 0 }, end: loc.end } }, s: { 0: 1 },
    fnMap: { 0: { loc } }, f: { 0: 0 }, branchMap: { 0: { type: "branch", loc, locations: [loc] } }, b: { 0: [1] } };
  const [conflicting] = analyzeFile("fixture.ts", "const f = () => 1;", coverage);
  assert.equal(conflicting.coverage, 0);
  assert.equal(conflicting.missingCoverage, true);
  assert.deepEqual(conflicting.mappingProblems, ["conflicting-function-entry-counts"]);
  const [missing] = analyzeFile("fixture.ts", "const f = () => 1;", { ...coverage, f: {} });
  assert.equal(missing.coverage, 0);
  assert.equal(missing.missingCoverage, true);
});
test("the lower of owned statements and branches remains the function coverage", () => {
  const source = "function f(x) {\n  if (x) return 1;\n  return 0;\n}";
  const first = { start: { line: 2, column: 0 }, end: { line: 2, column: 18 } };
  const last = { start: { line: 3, column: 0 }, end: { line: 3, column: 11 } };
  const branch = { start: { line: 2, column: 2 }, end: first.end };
  const coverage = { statementMap: { 0: first, 1: last }, s: { 0: 1, 1: 0 },
    fnMap: { 0: { loc: { start: { line: 1, column: 0 }, end: { line: 4, column: 1 } } } }, f: { 0: 1 },
    branchMap: { 0: { type: "if", loc: branch, locations: [branch] } }, b: { 0: [1] } };
  const [row] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(row.statements, 50);
  assert.equal(row.branches, 100);
  assert.equal(row.coverage, 50);
  coverage.s[1] = 1; coverage.b[0] = [0];
  const [branchMissing] = analyzeFile("fixture.ts", source, coverage);
  assert.equal(branchMissing.statements, 100);
  assert.equal(branchMissing.branches, 0);
  assert.equal(branchMissing.coverage, 0);
});
test("retained V8 named, anonymous, and unobserved callbacks map without new backend executions", () => {
  const coverage = JSON.parse(gunzipSync(readFileSync("scripts/fixtures/backend-quality/legacy/coverage.json.gz")));
  const snapshot = JSON.parse(gunzipSync(readFileSync("scripts/fixtures/backend-quality/legacy/sources.json.gz")));
  const rows = file => {
    assert.equal(sha256(snapshot.sources[file]), snapshot.sourceHashes[file]);
    return analyzeFile(file, snapshot.sources[file], coverage[Object.keys(coverage).find(key => key.endsWith(`/${file}`))]);
  };
  const named = rows("src/accounting/core.ts").find(row => row.function === "anonymous@29:25");
  assert.equal(named.mapping, "fnMap");
  assert.deepEqual(named.functionEntries, [114]);
  assert.equal(named.coverage, 100);
  const anonymous = rows("src/savingsRecovery/amounts.ts").find(row => row.function === "anonymous@9:37");
  assert.equal(anonymous.mapping, "branch-root");
  assert.deepEqual(anonymous.functionEntries, [1345]);
  assert.equal(anonymous.statementObservations, 0);
  assert.equal(anonymous.coverage, 100);
  const missing = rows("src/accounting/categories.ts").find(row => row.function === "anonymous@95:63");
  assert.equal(missing.coverage, 0);
  assert.equal(missing.missingCoverage, true);
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
