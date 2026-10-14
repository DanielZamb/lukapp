import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { backendFiles, policy } from "./backend-scope.mjs";

const isFunction = node => ts.isFunctionLike(node) && node.body !== undefined;
function selectedFunctionValue(node) {
  let value = node;
  while (ts.isParenthesizedExpression(value.parent) || ts.isAsExpression(value.parent) ||
    ts.isTypeAssertionExpression(value.parent) || ts.isNonNullExpression(value.parent) || ts.isSatisfiesExpression(value.parent)) value = value.parent;
  const parent = value.parent;
  return (ts.isConditionalExpression(parent) && (parent.whenTrue === value || parent.whenFalse === value)) ||
    (ts.isBinaryExpression(parent) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind) && parent.right === value) ||
    ((ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.initializer === value);
}
function executableAnchors(node, source) {
  const positions = [];
  function visit(child) {
    if (isFunction(child) || ts.isTypeNode(child) || ts.isTypeAliasDeclaration(child) || ts.isInterfaceDeclaration(child)) return;
    if (ts.canHaveModifiers(child) && ts.getModifiers(child)?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return;
    if (ts.isStatement(child) && !ts.isBlock(child) && !ts.isEmptyStatement(child)) positions.push(child.getStart(source));
    if (ts.isExpression(child) && !ts.isParenthesizedExpression(child) && !ts.isAsExpression(child) &&
      !ts.isTypeAssertionExpression(child) && !ts.isNonNullExpression(child) && !ts.isSatisfiesExpression(child)) positions.push(child.getStart(source));
    ts.forEachChild(child, visit);
  }
  visit(node.body);
  return positions;
}
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
  function visit(node) {
    if (isFunction(node)) {
      let runtimeStart = node.getStart(source);
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
      const exports = modifiers.filter(modifier => [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(modifier.kind));
      if (exports.length) {
        runtimeStart = exports.at(-1).end;
        while (/\s/.test(text[runtimeStart] ?? "") && runtimeStart < text.length) runtimeStart++;
      }
      const keyword = node.getChildren(source).find(child => child.kind === ts.SyntaxKind.FunctionKeyword);
      functions.push({ node, start: node.getStart(source), fullStart: node.getFullStart(), bodyStart: node.body.getStart(source),
        end: node.end, runtimeStarts: [node.getStart(source), runtimeStart, keyword?.getStart(source)].filter(start => start !== undefined),
        anchors: executableAnchors(node, source), selectedValue: selectedFunctionValue(node) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const fn of functions) {
    let ancestor = fn.node.parent;
    while (ancestor && !isFunction(ancestor)) ancestor = ancestor.parent;
    fn.parentFunction = functions.find(parent => parent.node === ancestor);
  }
  const offset = location => source.getPositionOfLineAndCharacter(location.line - 1, location.column);
  const range = location => ({ start: offset(location.start), end: offset(location.end) });
  const separators = suffix => /^[\s,;)]*$/.test(suffix);
  const rootCandidates = location => {
    const observed = range(location);
    return functions.filter(fn => fn.runtimeStarts.some(start => observed.start === start ||
      (observed.start >= fn.fullStart && observed.start < start && /^\s*$/.test(text.slice(observed.start, start)))) &&
      observed.end >= fn.end && separators(text.slice(fn.end, observed.end)));
  };
  const named = Object.entries(coverage?.fnMap ?? {}).map(([id, entry]) => {
    const observed = range(entry.loc);
    const bodies = functions.filter(fn => observed.start === fn.bodyStart && observed.end >= fn.end &&
      separators(text.slice(fn.end, observed.end)));
    return { id, location: entry.loc, candidates: [...new Set([...rootCandidates(entry.loc), ...bodies])], count: coverage.f?.[id] };
  });
  const branchRanges = Object.entries(coverage?.branchMap ?? {}).flatMap(([id, entry]) => {
    const locations = entry.locations?.length ? entry.locations : [entry.loc];
    return locations.map((location, index) => {
      const matches = rootCandidates(location);
      const selections = matches.filter(fn => fn.selectedValue);
      return { id: `${id}:${index}`, location, count: coverage.b?.[id]?.[index],
        candidates: entry.type === "branch" && locations.length === 1 ? matches : [],
        selectorOwner: entry.type !== "branch" && selections.length === 1 ? selections[0].parentFunction : undefined,
        entireFile: !text.slice(0, offset(location.start)).trim() && !text.slice(offset(location.end)).trim() };
    });
  });
  const percent = counts => counts.length ? 100 * counts.filter(count => count > 0).length / counts.length : 0;
  return functions.map(fn => {
    const { node, start, end } = fn;
    const nested = functions.filter(child => child !== fn && child.start > start && child.end <= end);
    const namedMatches = named.filter(entry => entry.candidates.includes(fn));
    const rootBranches = branchRanges.filter(entry => !entry.entireFile && !fn.selectedValue && entry.candidates.includes(fn));
    const proofs = [...namedMatches.map(entry => ({ ...entry, kind: "fnMap" })),
      ...rootBranches.map(entry => ({ ...entry, kind: "branch-root" }))];
    const problems = [];
    if (branchRanges.some(entry => entry.candidates.some(child => child.selectedValue && child.parentFunction === fn)))
      problems.push("ambiguous-nested-function-selection-branch");
    if (proofs.some(entry => entry.candidates.length !== 1)) problems.push("ambiguous-function-range");
    const valid = count => Number.isSafeInteger(count) && count >= 0;
    if (proofs.some(entry => !valid(entry.count))) problems.push("missing-or-invalid-entry-count");
    const entryCounts = proofs.filter(entry => entry.candidates.length === 1 && valid(entry.count)).map(entry => entry.count);
    if (new Set(entryCounts).size > 1) problems.push("conflicting-function-entry-counts");
    const entries = (namedMatches.length ? namedMatches : rootBranches)
      .filter(entry => entry.candidates.length === 1 && valid(entry.count)).map(entry => entry.count);
    const statementCounts = Object.entries(coverage?.statementMap ?? {}).filter(([, location]) => {
      const observed = range(location);
      return observed.start >= fn.bodyStart && observed.end <= end &&
        fn.anchors.some(position => position >= observed.start && position < observed.end) &&
        !nested.some(child => observed.start < child.end && observed.end > child.start);
    }).map(([id]) => coverage.s?.[id]);
    const branchCounts = branchRanges.filter(entry => {
      if (entry.entireFile) return false;
      if (entry.selectorOwner) return entry.selectorOwner === fn;
      if (entry.candidates.length) return rootBranches.includes(entry) && entry.candidates.length === 1;
      const observed = range(entry.location);
      const insideEnd = observed.end <= end || separators(text.slice(end, observed.end));
      const bodyOwned = observed.start >= fn.bodyStart && observed.start < end && insideEnd;
      const parameterOwned = node.parameters.some(parameter => parameter.initializer &&
        observed.start >= parameter.getStart(source) && observed.end <= parameter.end);
      return (bodyOwned || parameterOwned) &&
        !nested.some(child => observed.start >= child.start && observed.start < child.end);
    }).map(entry => entry.count);
    if ([...statementCounts, ...branchCounts].some(count => !valid(count))) problems.push("missing-or-invalid-owned-count");
    const observations = statementCounts.length ? statementCounts : entries.length ? entries : branchCounts;
    if (!observations.length) problems.push(fn.selectedValue && branchRanges.some(entry => entry.candidates.includes(fn)) ?
      "ambiguous-function-value-selection-branch" : "no-owned-function-observations");
    const missingCoverage = problems.length > 0 || observations.length === 0;
    const uncalled = entries.length > 0 && entries.every(count => count === 0);
    const statements = missingCoverage || uncalled ? 0 : percent(observations);
    const branches = missingCoverage || uncalled ? 0 : branchCounts.length ? percent(branchCounts) : statements;
    const coveragePercent = Math.min(statements, branches);
    const complexity = functionComplexity(node);
    const location = source.getLineAndCharacterOfPosition(start);
    return { file, function: node.name?.getText(source) ?? `anonymous@${location.line + 1}:${location.character + 1}`,
      line: location.line + 1, complexity, statements, branches, coverage: coveragePercent,
      crap: crapScore(complexity, coveragePercent), missingCoverage,
      statementObservations: statementCounts.length, branchObservations: branchCounts.length, functionEntries: entries,
      mapping: missingCoverage ? problems.some(problem => /ambiguous|conflicting/.test(problem)) ? "ambiguous" : "missing" :
        namedMatches.length ? "fnMap" : rootBranches.length ? "branch-root" : "owned-body",
      statementBasis: missingCoverage ? "none" : statementCounts.length ? "owned-statements" : entries.length ? "function-entry" : "owned-branches",
      mappingProblems: problems, entryProofs: proofs.map(({ kind, id, count, location: observed }) => ({ kind, id, count,
        start: observed.start, end: observed.end })) };
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
