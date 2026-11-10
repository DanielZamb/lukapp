import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const mobile = join(__dirname, "../..");
const routes = ["categories", "category-look", "budget", "overview", "history", "month-close", "devices", "entry"]
  .map((name) => `app/${name}.tsx`);
const folders = ["categories", "categoryLook", "budget", "overview", "history", "monthClose", "devices"]
  .map((name) => `src/features/${name}`);
const copyProps = new Set(["title", "label", "placeholder", "detail", "eyebrow", "accessibilityLabel", "accessibilityHint", "text"]);
// A catalog key ("review.flowNet") names copy rather than being copy.
const catalogKey = /^[a-z]+\.[A-Za-z0-9_]+$/;
const hasLetter = /\p{L}/u;

function sourceFiles() {
  const files = folders.flatMap((folder) => readdirSync(join(mobile, folder))
    .filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !name.startsWith("PlansRoute"))
    .map((name) => `${folder}/${name}`));
  return [...routes, ...files];
}

function isTranslatorCall(node: ts.Node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "tn"].includes(node.expression.text);
}

function literalTexts(node: ts.Node): string[] {
  if (isTranslatorCall(node)) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text), ...node.templateSpans.flatMap((span) => literalTexts(span.expression))];
  if (ts.isConditionalExpression(node)) return [...literalTexts(node.whenTrue), ...literalTexts(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return literalTexts(node.right);
    if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(operator))
      return [...literalTexts(node.left), ...literalTexts(node.right)];
    return [];
  }
  if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) return node.expression ? literalTexts(node.expression) : [];
  return [];
}

/** Hard-coded English a person could see or hear: JSX text and literals given to copy props. */
export function hardCodedCopy(fileName: string, source: string) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    const trimmed = text.trim();
    if (hasLetter.test(trimmed) && !catalogKey.test(trimmed))
      found.push(`${fileName}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${JSON.stringify(trimmed)}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
      for (const text of literalTexts(node)) report(node, text);
    if (ts.isJsxAttribute(node) && copyProps.has(node.name.getText(file)) && node.initializer)
      for (const text of literalTexts(node.initializer)) report(node, text);
    if (ts.isPropertyAssignment(node) && copyProps.has(node.name.getText(file)))
      for (const text of literalTexts(node.initializer)) report(node, text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

test("the scan catches hard-coded copy in every shape it guards", () => {
  const sample = `
    const options = [{ key: "date", label: "Date" }];
    export const View = () => <>
      <Header title="Budgets" eyebrow={\`\${month} BUDGET\`} />
      <Text>Nothing yet</Text>
      <Text>{over ? "over" : t("budget.jarLeft")}</Text>
      <Pressable accessibilityLabel={busy ? t("common.done") : "Saving"} accessibilityValue={{ text: \`\${n} left\` }} />
      <Text>{category.style.emoji} {t("review.flowNet")}</Text>
      {sheet === "sort" && <Text>{t(sortLabels[key])}</Text>}
      <Choice label={{ key: "x", label: "review.sortDate" }.label} />
    </>;`;
  expect(hardCodedCopy("sample.tsx", sample).map((line) => line.split(" ").slice(1).join(" "))).toEqual([
    "\"Date\"", "\"Budgets\"", "\"BUDGET\"", "\"Nothing yet\"", "\"over\"", "\"Saving\"", "\"left\"",
  ]);
});

test("organising and reviewing money has no hard-coded user-facing English", () => {
  const files = sourceFiles();
  expect(files.length).toBeGreaterThan(40);
  const found = files.flatMap((name) => hardCodedCopy(relative(mobile, join(mobile, name)), readFileSync(join(mobile, name), "utf8")));
  expect(found).toEqual([]);
});
