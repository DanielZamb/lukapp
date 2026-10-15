import ts from "typescript";

export const AST_COVERAGE_FORMAT = "vitest-v8-3.2.7-ast-v1";
export const PATCHED_AST_COVERAGE_FORMAT = "vitest-v8-3.2.7-ast-flattened-logicals-v1";
const isFunction = node => ts.isFunctionLike(node) && node.body !== undefined;
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const logical = node => ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind);
function runtime(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}
export function analyzeAstCoverage(file, text, coverage, complexityOf) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const functions = [], statements = [], decisions = [], problems = [], assignments = [];
  const lines = source.getLineStarts();
  const position = (point, end = false) => {
    if (!point || !Number.isInteger(point.line) || point.line < 1 || point.line > lines.length) return undefined;
    const start = lines[point.line - 1], limit = (lines[point.line] ?? text.length);
    const length = text.slice(start, limit).replace(/[\r\n]+$/, "").length;
    if (end && point.column === null) return { offset: start + length, sentinel: true, line: point.line };
    if (!Number.isInteger(point.column) || point.column < 0 || point.column > length) return undefined;
    return { offset: start + point.column, sentinel: false, line: point.line };
  };
  function runtimeStarts(node) {
    const unwrapped = runtime(node), starts = [node.getStart(source), unwrapped.getStart(source)];
    if (logical(unwrapped)) starts.push(...runtimeStarts(unwrapped.left));
    return [...new Set(starts)];
  }
  function bodyStarts(node) {
    const starts = runtimeStarts(node.body);
    // Vite's inserted parentheses around a single arrow parameter can map the
    // body start to that parameter. Both declaration and complete body ending
    // must still match this one function; this never supplies a call count.
    if (ts.isArrowFunction(node) && node.parameters.length === 1 && ts.isIdentifier(node.parameters[0].name))
      starts.push(node.getStart(source), node.parameters[0].getStart(source));
    return [...new Set(starts)];
  }
  function matches(node, loc, starts = runtimeStarts(node), minimumEnd = node.end, boundaryEnds = []) {
    const start = position(loc?.start), end = position(loc?.end, true);
    if (!start || !end || end.offset < start.offset || !starts.includes(start.offset)) return false;
    const lastLine = source.getLineAndCharacterOfPosition(minimumEnd).line + 1;
    // Null is the pinned provider's serialized Infinity, accepted only for the
    // ending line of this uniquely matched construct. It never expands ownership.
    if (end.sentinel) return end.line === lastLine;
    return end.offset >= minimumEnd && (boundaryEnds.includes(end.offset) || /^[\s,;:()[\]{}]*$/.test(text.slice(minimumEnd, end.offset)));
  }
  function addStatement(node, owner, starts = runtimeStarts(node)) { statements.push({ node: runtime(node), owner, starts }); }
  function visit(node, owner) {
    if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ||
      (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(mod => mod.kind === ts.SyntaxKind.DeclareKeyword))) return;
    if (isFunction(node)) {
      const fn = { node, owner, entries: [], statements: [], branches: [], problems: [], proofs: [] };
      functions.push(fn);
      for (const parameter of node.parameters) visit(parameter, fn);
      if (!ts.isBlock(node.body)) addStatement(node.body, fn, bodyStarts(node));
      visit(node.body, fn);
      return;
    }
    if (ts.isVariableDeclaration(node) && node.initializer) addStatement(node.initializer, owner, [...runtimeStarts(node.initializer), node.getStart(source)]);
    if (ts.isPropertyDeclaration(node) && node.initializer) addStatement(node.initializer, owner, [...runtimeStarts(node.initializer), node.getStart(source)]);
    if ([ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.BreakStatement, ts.SyntaxKind.ContinueStatement,
      ts.SyntaxKind.DebuggerStatement, ts.SyntaxKind.ReturnStatement, ts.SyntaxKind.ThrowStatement,
      ts.SyntaxKind.TryStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement,
      ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
      ts.SyntaxKind.WithStatement, ts.SyntaxKind.LabeledStatement, ts.SyntaxKind.IfStatement,
      ts.SyntaxKind.SwitchStatement].includes(node.kind)) addStatement(node, owner);
    if (ts.isIfStatement(node)) decisions.push({ node, owner, type: "if", arms: [node, node.elseStatement] });
    if (ts.isConditionalExpression(node)) decisions.push({ node, owner, type: "cond-expr", arms: [runtime(node.whenTrue), runtime(node.whenFalse)] });
    if (ts.isSwitchStatement(node)) decisions.push({ node, owner, type: "switch", arms: [...node.caseBlock.clauses] });
    if (logical(node)) {
      let parent = node.parent;
      while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
      if (!logical(parent)) {
        const arms = [];
        const flatten = child => { child = runtime(child); if (logical(child)) { flatten(child.left); flatten(child.right); } else arms.push(child); };
        flatten(node);
        decisions.push({ node, owner, type: "binary-expr", arms });
      }
    }
    if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer)
      decisions.push({ node, owner, type: "default-arg", arms: [runtime(node.initializer)] });
    ts.forEachChild(node, child => visit(child, owner));
  }
  visit(source, undefined);
  function reject(kind, id, reason, observation) { problems.push({ kind, id, reason, observation }); }
  function assign(kind, id, candidates, count, observation) {
    if (candidates.length !== 1) { reject(kind, id, "unassigned-or-ambiguous-executable-observation", observation); return; }
    if (!validCount(count)) { reject(kind, id, "missing-or-invalid-count", { count, observation }); return; }
    const candidate = candidates[0];
    assignments.push({ kind, id, count, owner: candidate.owner?.node.getStart(source) ?? "module", location: observation });
    if (candidate.seen) reject(kind, id, "duplicate-construct-observation", observation);
    candidate.seen = true;
    if (candidate.owner) candidate.owner[kind].push(count);
  }
  for (const [id, entry] of Object.entries(coverage?.fnMap ?? {})) {
    if (!entry || typeof entry !== "object") { reject("entries", id, "invalid-function-observation", entry); continue; }
    const candidates = functions.filter(fn => {
      const body = runtime(fn.node.body);
      const decl = fn.node.name ?? (ts.isPropertyAssignment(fn.node.parent) ? fn.node.parent.name : undefined);
      const start = decl?.getStart(source) ?? fn.node.getStart(source);
      const declStart = position(entry.decl?.start), declEnd = position(entry.decl?.end, true);
      return declStart?.offset === start && declEnd && !declEnd.sentinel && declEnd.offset > start &&
        declEnd.offset >= (decl?.end ?? start + 1) && declEnd.offset <= Math.max(...runtimeStarts(body)) && matches(body, entry.loc, bodyStarts(fn.node));
    });
    if (candidates.length !== 1) { reject("entries", id, "unassigned-or-ambiguous-function", entry); continue; }
    const fn = candidates[0], count = coverage.f?.[id];
    if (!validCount(count)) reject("entries", id, "missing-or-invalid-count", { entry, count });
    else fn.entries.push(count);
    fn.proofs.push({ kind: "ast-fnMap", id, count, start: entry.loc.start, end: entry.loc.end, declaration: entry.decl });
  }
  for (const [id, loc] of Object.entries(coverage?.statementMap ?? {}))
    assign("statements", id, statements.filter(candidate => matches(candidate.node, loc, candidate.starts)), coverage.s?.[id], loc);
  for (const [id, entry] of Object.entries(coverage?.branchMap ?? {})) {
    if (!entry || typeof entry !== "object") { reject("branches", id, "invalid-decision-observation", entry); continue; }
    const candidates = decisions.filter(decision => decision.type === entry.type && matches(decision.node, entry.loc,
        decision.owner?.entries.length === 1 && runtime(decision.owner.node.body) === decision.node ? bodyStarts(decision.owner.node) : runtimeStarts(decision.node)) &&
      Array.isArray(entry.locations) && entry.locations.length === decision.arms.length && decision.arms.every((arm, index) => {
        const loc = entry.locations[index];
        if (!arm) return entry.type === "if" && index === 1 && !decision.node.elseStatement &&
          loc && Object.keys(loc.start ?? { invalid: true }).length === 0 && Object.keys(loc.end ?? { invalid: true }).length === 0;
        // The pinned mapper ends a logical operand at the next source-map
        // token. Only this decision's next operand start is an extra endpoint.
        const next = entry.type === "binary-expr" ? decision.arms[index + 1] : undefined;
        const starts = index === 0 && decision.owner?.entries.length === 1 && runtime(decision.owner.node.body) === decision.node ?
          [...runtimeStarts(arm), ...bodyStarts(decision.owner.node)] : runtimeStarts(arm);
        return matches(arm, loc, starts, arm.end, next ? runtimeStarts(next) : []);
      }));
    if (candidates.length !== 1) { reject("branches", id, "unassigned-or-ambiguous-decision", entry); continue; }
    const candidate = candidates[0], counts = coverage.b?.[id];
    if (!Array.isArray(counts) || counts.length !== candidate.arms.length || counts.some(count => !validCount(count))) {
      reject("branches", id, "missing-or-invalid-count", { entry, counts }); continue;
    }
    if (candidate.seen) reject("branches", id, "duplicate-construct-observation", entry);
    candidate.seen = true;
    counts.forEach((count, index) => {
      assignments.push({ kind: "branches", id: `${id}:${index}`, count, owner: candidate.owner?.node.getStart(source) ?? "module",
        location: entry.locations[index], decision: entry.loc, type: entry.type });
      candidate.owner?.branches.push(count);
    });
  }
  for (const [map, counts, kind] of [["fnMap", "f", "entries"], ["statementMap", "s", "statements"], ["branchMap", "b", "branches"]])
    for (const id of Object.keys(coverage?.[counts] ?? {})) if (!(id in (coverage?.[map] ?? {}))) reject(kind, id, "orphan-count", coverage[counts][id]);
  for (const candidate of [...statements, ...decisions]) if (!candidate.seen)
    candidate.owner?.problems.push(`missing-${candidate.type ? "decision" : "statement"}-observation@${candidate.node.getStart(source)}`);
  const percent = counts => 100 * counts.filter(count => count > 0).length / counts.length;
  const rows = functions.map(fn => {
    const location = source.getLineAndCharacterOfPosition(fn.node.getStart(source));
    if (fn.entries.length !== 1) fn.problems.push("missing-or-duplicate-function-entry");
    const mappingProblems = [...fn.problems, ...problems.map(problem => `${problem.reason}:${problem.kind}:${problem.id}`)];
    const missingCoverage = mappingProblems.length > 0;
    const uncalled = fn.entries.length === 1 && fn.entries[0] === 0;
    const statements = missingCoverage || uncalled ? 0 : percent(fn.statements.length ? fn.statements : fn.entries);
    const branches = missingCoverage || uncalled ? 0 : fn.branches.length ? percent(fn.branches) : statements;
    const coveragePercent = Math.min(statements, branches), complexity = complexityOf(fn.node);
    return { file, function: fn.node.name?.getText(source) ?? `anonymous@${location.line + 1}:${location.character + 1}`,
      line: location.line + 1, complexity, statements, branches, coverage: coveragePercent,
      crap: complexity ** 2 * (1 - coveragePercent / 100) ** 3 + complexity,
      missingCoverage, statementObservations: fn.statements.length, branchObservations: fn.branches.length,
      functionEntries: fn.entries, mapping: missingCoverage ? "missing-or-ambiguous-ast" : "ast-fnMap",
      statementBasis: missingCoverage ? "none" : fn.statements.length ? "ast-statements" : "function-entry",
      mappingProblems, rejectedBranchObservations: [], entryProofs: fn.proofs };
  });
  rows.mappingFailures = problems;
  rows.assignments = assignments;
  return rows;
}
