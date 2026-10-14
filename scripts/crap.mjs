import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { backendFiles, policy } from "./backend-scope.mjs";

const isFunction = node => ts.isFunctionLike(node) && node.body !== undefined;
export function functionComplexity(node) {
  let count = 1;
  function visit(child) {
    if (child !== node && isFunction(child)) return;
    if (ts.isIfStatement(child) || ts.isConditionalExpression(child) || ts.isForStatement(child) ||
      ts.isForInStatement(child) || ts.isForOfStatement(child) || ts.isWhileStatement(child) ||
      ts.isDoStatement(child) || ts.isCaseClause(child) || ts.isCatchClause(child)) count++;
    if (ts.isBinaryExpression(child) && [ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(child.operatorToken.kind)) count++;
    ts.forEachChild(child, visit);
  }
  visit(node);
  return count;
}
export function crapScore(complexity, coverage) {
  return complexity ** 2 * (1 - coverage / 100) ** 3 + complexity;
}
export function analyzeFile(file, text, coverage) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const functions = [];
  function visit(node) { if (isFunction(node)) functions.push(node); ts.forEachChild(node, visit); }
  visit(source);
  const offset = location => source.getPositionOfLineAndCharacter(location.line - 1, location.column);
  return functions.map(node => {
    const end = node.end;
    const functionEntries = Object.entries(coverage?.fnMap ?? {}).filter(([, entry]) => offset(entry.loc.end) === end &&
      offset(entry.loc.start) <= node.body.getStart(source) && offset(entry.loc.start) >= node.getFullStart());
    const start = Math.min(node.getStart(source), ...functionEntries.map(([, entry]) => offset(entry.loc.start)));
    const nested = functions.filter(child => child !== node && child.getStart(source) > start && child.end <= end);
    const owned = location => {
      const position = offset(location.start);
      return position >= start && offset(location.end) <= end &&
        !nested.some(child => position >= child.getStart(source) && position < child.end);
    };
    const statementOwned = location => {
      const from = offset(location.start), through = offset(location.end);
      return from < end && through > start && !nested.some(child => from >= child.getStart(source) && through <= child.end);
    };
    const statementCounts = Object.entries(coverage?.statementMap ?? {}).filter(([, location]) => statementOwned(location))
      .map(([id]) => coverage.s[id]);
    const branchCounts = Object.entries(coverage?.branchMap ?? {}).filter(([, branch]) => owned(branch.loc))
      .flatMap(([id]) => coverage.b[id]);
    const percent = counts => counts.length ? 100 * counts.filter(count => count > 0).length / counts.length : 0;
    const entries = functionEntries.map(([id]) => coverage.f[id]);
    const observations = statementCounts.length ? statementCounts : entries;
    const statements = entries.length && entries.every(count => count === 0) ? 0 : percent(observations);
    const branches = branchCounts.length ? percent(branchCounts) : statements;
    const coveragePercent = Math.min(statements, branches);
    const complexity = functionComplexity(node);
    const location = source.getLineAndCharacterOfPosition(start);
    return { file, function: node.name?.getText(source) ?? `anonymous@${location.line + 1}:${location.character + 1}`,
      line: location.line + 1, complexity, statements, branches, coverage: coveragePercent,
      crap: crapScore(complexity, coveragePercent), missingCoverage: observations.length === 0 && branchCounts.length === 0,
      statementObservations: statementCounts.length, branchObservations: branchCounts.length, functionEntries: entries };
  });
}
export function reportCrap(coverage) {
  const files = backendFiles();
  const missingFiles = files.filter(file => !(coverage[resolve(file)] ?? coverage[file]));
  const functions = files.flatMap(file => analyzeFile(file, readFileSync(file, "utf8"), coverage[resolve(file)] ?? coverage[file]));
  const failures = functions.filter(row => row.missingCoverage || row.crap > policy.maximumFunctionCrap);
  return { criterion: policy.maximumFunctionCrap, metric: "per-function AST cyclomatic complexity; minimum statement/branch coverage; nested functions measured separately",
    files: files.length, missingFiles, functions: functions.sort((a, b) => b.crap - a.crap),
    failures, passed: files.length > 0 && functions.length > 0 && missingFiles.length === 0 && failures.length === 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/crap.mjs")) {
  const result = reportCrap(JSON.parse(readFileSync(process.argv[2] ?? "coverage/coverage-final.json", "utf8")));
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ passed: result.passed, functions: result.functions.length, missingFiles: result.missingFiles,
    failures: result.failures.length, highest: result.functions.slice(0, 8) }, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
