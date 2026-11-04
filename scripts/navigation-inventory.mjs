import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [sourceArg = '.', outputArg] = process.argv.slice(2);
const root = resolve(sourceArg);
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
const roots = ['apps/mobile/app', 'apps/mobile/src'];
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|testSupport)\.tsx?$/.test(entry.name)) files.push(path);
  }
}
roots.forEach(path => walk(resolve(root, path)));
const navigation = [];
const localTransitions = [];
const stateTypes = [];
const presentations = [];
const guards = [];
const routeParameters = [];
const sourceHashes = {};
const methods = new Set(['push', 'replace', 'back', 'navigate', 'dismiss', 'dismissAll', 'dismissTo', 'goBack', 'reset', 'dispatch']);
const literal = node => node && (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) ? node.text : null;
function property(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  const match = node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText().replaceAll(/['"]/g, '') === name);
  return match && ts.isPropertyAssignment(match) ? match.initializer : undefined;
}
function route(value) {
  if (!value || !/^(\/|\.\/)/.test(value)) return null;
  return value.startsWith('./') ? `/${value.slice(2)}` : value;
}
function owner(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return current.name.getText();
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isVariableDeclaration(current)) return current.name.getText();
  }
  return null;
}
for (const absolute of files.sort()) {
  const file = relative(root, absolute);
  const text = readFileSync(absolute, 'utf8');
  sourceHashes[file] = createHash('sha256').update(text).digest('hex');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = node => ({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
  const expression = node => node.getText(ast).replaceAll(/\s+/g, ' ').slice(0, 300);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast);
      if (ts.isPropertyAccessExpression(node.expression) && methods.has(node.expression.name.text)) {
        const receiver = node.expression.expression.getText(ast);
        if (/^(router|navigation)$/.test(receiver) || callee.startsWith('CommonActions.')) {
          const argument = node.arguments[0];
          const target = literal(argument) ?? literal(property(argument, 'pathname'));
          const params = property(argument, 'params');
          const routeNames = [];
          function names(child) {
            if (ts.isPropertyAssignment(child) && child.name.getText(ast) === 'name') {
              const value = literal(child.initializer);
              if (value) routeNames.push(value === 'index' ? '/' : `/${value}`);
            }
            ts.forEachChild(child, names);
          }
          if (argument) names(argument);
          navigation.push({ ...at(node), owner: owner(node), operation: node.expression.name.text,
            destination: route(target), dynamicDestination: !!argument && !target && routeNames.length === 0,
            parameterNames: params && ts.isObjectLiteralExpression(params) ? params.properties.map(p => p.name?.getText(ast)).filter(Boolean) : [],
            resetRoutes: routeNames, expression: expression(node) });
        }
      }
      if (/^set(?:Step|Stage|Screen|Mode|Phase|Editing|Detail|Creating|Batch|.*Open)$/.test(callee)) {
        const argument = node.arguments[0];
        localTransitions.push({ ...at(node), setter: callee, owner: owner(node),
          state: literal(property(argument, 'kind')) ?? literal(argument), expression: expression(node) });
      }
      if (['usePreventRemove', 'useLocalSearchParams'].includes(callee) ||
          callee === 'BackHandler.addEventListener' || (callee.endsWith('.addListener') && literal(node.arguments[0]) === 'beforeRemove')) {
        guards.push({ ...at(node), kind: callee, expression: expression(node) });
      }
      if (callee === 'useLocalSearchParams') {
        routeParameters.push({ ...at(node), parameters: node.typeArguments?.map(argument => expression(argument)) ?? [] });
      }
    }
    if (ts.isTypeAliasDeclaration(node) && /(Step|Screen|Stage|Mode|Route|Flow|State|Snapshot)$/.test(node.name.text)) {
      const variants = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      const states = variants.flatMap(variant => {
        if (ts.isLiteralTypeNode(variant)) return literal(variant.literal) ?? [];
        if (!ts.isTypeLiteralNode(variant)) return [];
        const discriminant = variant.members.find(member => ts.isPropertySignature(member) && ['kind', 'stage', 'screen'].includes(member.name.getText(ast)));
        if (!discriminant || !ts.isPropertySignature(discriminant) || !discriminant.type) return [];
        const types = ts.isUnionTypeNode(discriminant.type) ? discriminant.type.types : [discriminant.type];
        return types.flatMap(type => ts.isLiteralTypeNode(type) ? literal(type.literal) ?? [] : []);
      });
      if (states.length) stateTypes.push({ ...at(node), name: node.name.text, states: [...new Set(states)] });
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(ast);
      if (/Modal$|Sheet$/.test(name)) presentations.push({ ...at(node), component: name,
        callbacks: node.attributes.properties.filter(ts.isJsxAttribute).filter(attr => /^on|visible|enablePanDownToClose|stackBehavior/.test(attr.name.getText(ast))).map(expression) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const appFiles = files.map(file => relative(root, file)).filter(file => file.startsWith('apps/mobile/app/'));
const routes = appFiles.filter(file => !file.endsWith('/_layout.tsx')).map(file => ({
  path: file.replace('apps/mobile/app/', '/').replace(/\.tsx?$/, '').replace(/\/index$/, '/'), file,
  parameters: routeParameters.filter(item => item.file === file),
  operations: navigation.filter(item => item.file === file),
  guards: guards.filter(item => item.file === file && item.kind !== 'useLocalSearchParams'),
}));
const inventory = {
  schemaVersion: 1,
  source: { root, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes },
  scope: 'Production mobile app and src TypeScript/TSX. Test files and testSupport files are excluded. Static calls are evidence of wiring, not runtime acceptance.',
  routes, navigation, stateTypes, localTransitions, presentations, guards,
  limits: ['Dynamic router destinations require manual resolution.', 'Calls through callbacks or custom navigation helpers require manual tracing.', 'A cycle is not automatically a defect.', 'Union variants and setters are candidates for flow states, not an automatically proven state machine.'],
};
const json = `${JSON.stringify(inventory, null, 2)}\n`;
if (outputArg) {
  mkdirSync(dirname(resolve(outputArg)), { recursive: true });
  writeFileSync(resolve(outputArg), json);
  console.log(JSON.stringify({ routes: routes.length, navigationOperations: navigation.length, stateTypes: stateTypes.length, localTransitions: localTransitions.length, presentations: presentations.length, output: resolve(outputArg) }));
} else process.stdout.write(json);
