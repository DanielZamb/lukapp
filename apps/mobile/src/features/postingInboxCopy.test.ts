import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const mobile = join(__dirname, "../..");
const copyProps = new Set(["title", "label", "placeholder", "detail", "eyebrow", "accessibilityLabel", "accessibilityHint", "status", "body", "empty", "guidance", "searchLabel"]);
const setters = new Set(["setError", "setNotice", "setDiscardError", "setFailure"]);
/** Literal text that is not copy: format tokens and placeholders shown as typed values. */
const allowed = new Set(["-0"]);

/**
 * The prototype route (`intake-prototype.tsx`, `intake/prototype/`) is reached only from the intake hub in dev or
 * beta-diagnostics builds, so it stays out of this guard.
 */
function areaFiles(): string[] {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? entry.name === "prototype" ? [] : walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  const features = join(mobile, "src/features");
  return [
    ...["post.tsx", "entry.tsx", "drafts.tsx", "intake.tsx"].map((name) => join(mobile, "app", name)),
    ...walk(join(features, "posting")),
    ...walk(join(features, "intake")),
    ...["DraftsScreen.tsx", "ActivityRows.tsx", "activity.ts", "inboxCount.ts", "useInboxCount.ts", "useIntakeCandidates.ts",
      "useLocalEntryDrafts.ts", "localEntryDrafts.ts", "localEntryDraftErrors.ts", "localDiscardNotices.ts", "discardOutcome.ts",
      "pendingExpenseSchema.ts", "clearLocalInput.ts", "money.ts"].map((name) => join(features, name)),
  ].filter((file) => /\.tsx?$/.test(file) && !/\.test\.ts$|\.testSupport\.ts$/.test(file));
}

const isCopy = (text: string) => /\p{L}/u.test(text) && !allowed.has(text.trim());

/** Literals that become the shown value itself: directly, through a condition or fallback, or inside a template. */
function literalsIn(node: ts.Node, found: ts.Node[] = []): ts.Node[] {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literalsIn(node.expression, found);
  if (ts.isConditionalExpression(node)) { literalsIn(node.whenTrue, found); return literalsIn(node.whenFalse, found); }
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) {
    if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) literalsIn(node.left, found);
    return literalsIn(node.right, found);
  }
  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isCopy(node.text)) found.push(node);
  if (ts.isTemplateExpression(node)) {
    if (isCopy(node.head.text) || node.templateSpans.some((span) => isCopy(span.literal.text))) found.push(node);
    node.templateSpans.forEach((span) => literalsIn(span.expression, found));
  }
  return found;
}

function hardCodedCopy(file: string, text = readFileSync(file, "utf8")): string[] {
  const jsx = file.endsWith(".tsx");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const problems: string[] = [];
  const report = (node: ts.Node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    problems.push(`${relative(mobile, file)}:${line + 1} ${node.getText().trim().slice(0, 80)}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && isCopy(node.text)) report(node);
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
      literalsIn(node.expression).forEach(report);
    if (ts.isJsxAttribute(node) && copyProps.has(node.name.getText()) && node.initializer)
      literalsIn(ts.isJsxExpression(node.initializer) && node.initializer.expression ? node.initializer.expression : node.initializer).forEach(report);
    // In plain modules `status` and `title` name domain fields; in components they carry copy into a row or card.
    if (jsx && ts.isPropertyAssignment(node) && copyProps.has(node.name.getText())) literalsIn(node.initializer).forEach(report);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && setters.has(node.expression.text))
      node.arguments.forEach((argument) => literalsIn(argument).forEach(report));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

test("entering money and the inbox keep their copy in the catalog", () => {
  const files = areaFiles();
  expect(files.length).toBeGreaterThan(40);
  expect(files.flatMap((file) => hardCodedCopy(file))).toEqual([]);
});

test("the guard notices hard-coded copy and lets catalog calls through", () => {
  const sample = join(mobile, "src/features/sample.tsx");
  expect(hardCodedCopy(sample, `const a = <Text accessibilityLabel="Post it">Post</Text>;
const b = <Button label={busy ? "Posting…" : t("posting.formPost")} title={kind === "transfer" ? t("x") : t("y")} />;
const c = { title: "Place added", amount: "-0" };
setError(\`Could not \${what}\`);
const d = <Text>{t("inbox.title")}{"…"}</Text>;`)).toEqual([
    "src/features/sample.tsx:1 \"Post it\"",
    "src/features/sample.tsx:1 Post",
    "src/features/sample.tsx:2 \"Posting…\"",
    "src/features/sample.tsx:3 \"Place added\"",
    "src/features/sample.tsx:4 `Could not ${what}`",
  ]);
});
