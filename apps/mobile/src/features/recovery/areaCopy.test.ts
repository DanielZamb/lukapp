import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const mobile = join(__dirname, "../../..");
const areaFiles = [
  "app/places.tsx", "app/account.tsx", "app/plans.tsx", "app/recovery.tsx", "app/settings.tsx",
  "src/features/useFrozenCommand.ts",
  ...["src/features/places", "src/features/recovery"].flatMap((folder) =>
    readdirSync(join(mobile, folder)).filter((name) => /\.tsx?$/.test(name) && !name.includes(".test.")).map((name) => `${folder}/${name}`)),
];
const copyProps = new Set(["title", "label", "placeholder", "detail", "eyebrow", "accessibilityLabel", "accessibilityHint", "helperText", "error"]);

function hasLetter(text: string) {
  return /\p{L}/u.test(text);
}

function literalCopy(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("…");
  if (ts.isJsxExpression(node)) return literalCopy(node.expression);
  if (ts.isParenthesizedExpression(node)) return literalCopy(node.expression);
  if (ts.isConditionalExpression(node)) return literalCopy(node.whenTrue) ?? literalCopy(node.whenFalse);
  return null;
}

function findCopy(name: string, text: string) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, copy: string) => {
    if (hasLetter(copy)) {
      found.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${copy.trim()}`);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    if (ts.isJsxExpression(node) && ts.isJsxElement(node.parent)) {
      const copy = literalCopy(node.expression);
      if (copy !== null) report(node, copy);
    }
    if (ts.isJsxAttribute(node) && copyProps.has(node.name.getText(source))) {
      const copy = literalCopy(node.initializer);
      if (copy !== null) report(node, copy);
    }
    if (ts.isCallExpression(node) && /^set(Error|Notice)$/.test(node.expression.getText(source))) {
      const copy = literalCopy(node.arguments[0]);
      if (copy !== null) report(node, copy);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("the Places, Recovery, Plans and Settings screens take every visible word from the catalog", () => {
  expect(areaFiles.length).toBeGreaterThan(15);
  expect(areaFiles.flatMap((file) => findCopy(file, readFileSync(join(mobile, file), "utf8")))).toEqual([]);
});

test("the guard catches hard-coded copy in each form it scans and passes catalog lookups", () => {
  const flagged = [
    "<Text>Recent activity</Text>",
    "<Header title=\"Plans\" />",
    "<Row label={`${count} months`} />",
    "<Row detail={busy ? \"Moving…\" : t(\"x\")} />",
    "<Text>{\"Loose words\"}</Text>",
    "setError(\"Could not save.\")",
  ];
  for (const snippet of flagged) expect(findCopy("sample.tsx", `const view = ${snippet};`), snippet).toHaveLength(1);
  const clean = [
    "<Text>{t(\"places.now\")}</Text>",
    "<Header title={t(\"recovery.title\")} eyebrow={plan.title} />",
    "<Text>{`${percent}%`}</Text>",
    "<Text>💰</Text>",
    "<Icon name=\"checkmark\" />",
  ];
  for (const snippet of clean) expect(findCopy("sample.tsx", `const view = ${snippet};`), snippet).toEqual([]);
});
