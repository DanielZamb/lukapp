import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const mobile = join(__dirname, "..");
const area = [
  "app/_layout.tsx", "app/index.tsx", "app/alerts.tsx", "app/level-unlocked.tsx", "app/oauth-callback.tsx",
  "src/features/Setup.tsx", "src/features/setup", "src/features/HomePlaceSetup.tsx",
  "src/features/TimeZonePicker.tsx", "src/features/timeZones.ts", "src/features/monthPace.ts",
  "src/features/useWorkspaceCalendar.ts", "src/features/currencySchema.ts",
  "src/features/attention", "src/features/levelDoor",
  "src/device-admission", "src/local-auth", "src/ui",
];
const copyProps = new Set([
  "title", "label", "placeholder", "detail", "eyebrow", "accessibilityLabel", "accessibilityHint", "buttonLabel",
]);
/** Visible text that is not copy. */
const allowed = new Set(["Lukapp"]);

function sources(path: string): string[] {
  const full = join(mobile, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => sources(join(path, name)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.ts$|\.testSupport\.ts$/.test(file));
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  if (ts.isConditionalExpression(node))
    return [literalText(node.whenTrue), literalText(node.whenFalse)].filter(Boolean).join(" ") || null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    return literalText(node.right);
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression);
  if (ts.isJsxExpression(node)) return node.expression ? literalText(node.expression) : null;
  return null;
}

function isCopy(text: string) {
  const trimmed = text.trim();
  return /\p{L}/u.test(trimmed) && !allowed.has(trimmed);
}

function hardCodedCopy(name: string, code: string): string[] {
  const source = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) =>
    found.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${JSON.stringify(text.trim())}`);
  const check = (node: ts.Node, value: ts.Node | undefined) => {
    const text = value && literalText(value);
    if (text && isCopy(text)) report(node, text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && isCopy(node.text)) report(node, node.text);
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
      check(node, node.expression);
    if ((ts.isJsxAttribute(node) || ts.isPropertyAssignment(node) || ts.isParameter(node) || ts.isBindingElement(node))
      && copyProps.has(node.name.getText(source)))
      check(node, node.initializer);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression.getText(source);
      const first = node.arguments?.[0];
      if (/toLocale(Date|Time)?String$/.test(callee)) report(node, `${callee}()`);
      if (/DateTimeFormat$/.test(callee) && first && ts.isStringLiteral(first) && first.text === "en")
        report(node, `${callee}("en")`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("the entry, Home, setup, access and shared UI files take every visible string from the catalog", () => {
  const files = area.flatMap(sources);
  expect(files.length).toBeGreaterThan(40);
  expect(files.flatMap((file) => hardCodedCopy(relative(mobile, file), readFileSync(file, "utf8")))).toEqual([]);
});

test("the scan catches each kind of hard-coded copy and passes catalog lookups", () => {
  const scan = (snippet: string) => hardCodedCopy("probe.tsx", snippet);
  for (const snippet of [
    `const a = <Text>Nothing waiting</Text>;`,
    `const a = <Header title="Alerts" />;`,
    `const a = <Field placeholder={busy ? "Saving" : "0"} />;`,
    `const option = { label: "Use them" };`,
    `const a = <Text>{"You're set"}</Text>;`,
    `const a = <Text>{date.toLocaleString()}</Text>;`,
    `const a = <Pressable accessibilityLabel={\`Drafts, \${count}\`} />;`,
    `function Screen({ buttonLabel = "Continue" }) {}`,
    `const month = new Intl.DateTimeFormat("en", { month: "long" });`,
  ]) expect(scan(snippet), snippet).toHaveLength(1);
  for (const snippet of [
    `const a = <Header title={t("home.alertsTitle")} />;`,
    `const a = <Text>{"🔔"} · {count}</Text>;`,
    `const a = <Image accessibilityLabel="Lukapp" />;`,
    `const a = <TextInput placeholder="0" />;`,
    `const key = new Intl.DateTimeFormat("en-US", { year: "numeric" });`,
  ]) expect(scan(snippet), snippet).toEqual([]);
});
