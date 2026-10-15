import { readFileSync, writeFileSync, mkdirSync, symlinkSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { parseAstAsync } from "vitest/node";
import { createHash } from "node:crypto";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const output = "quality/backend/mapper-diagnosis";
const require = createRequire(import.meta.resolve("@vitest/coverage-v8"));
const mapperPath = require.resolve("ast-v8-to-istanbul");
const original = readFileSync(mapperPath, "utf8");
let corrected = original.replace('let nextIgnore = false;', 'let nextIgnore = false;\n\tconst flattenedLogicalNodes = new WeakSet();');
corrected = corrected.replace('if (isSkipped(node)) return;', 'if (isSkipped(node) || flattenedLogicalNodes.has(node)) return;');
corrected = corrected.replace('setSkipped(child);\n\t\t\t\t\t\t\t\tif (getIgnoreHint(child)', 'flattenedLogicalNodes.add(child);\n\t\t\t\t\t\t\t\tif (getIgnoreHint(child)');
if (corrected === original || !corrected.includes('flattenedLogicalNodes.add(child)')) throw new Error("Patch did not apply");
writeFileSync(`${output}/mapper-original.mjs.txt`, original);
writeFileSync(`${output}/mapper-corrected.mjs.txt`, corrected);
const temporary = mkdtempSync(join(tmpdir(), "lukapp-mapper-diagnosis-"));
symlinkSync(resolve(dirname(mapperPath), "../.."), join(temporary, "node_modules"));
writeFileSync(join(temporary, "original.mjs"), original);
writeFileSync(join(temporary, "corrected.mjs"), corrected);
const originalMapper = (await import(pathToFileURL(join(temporary, "original.mjs")))).default;
const correctedMapper = (await import(pathToFileURL(join(temporary, "corrected.mjs")))).default;
const datasets = [
  { name: "representative-before", inputs: JSON.parse(gunzipSync(readFileSync("quality/backend/ast-remapping/representative/conversion-inputs.json.gz"))), retained: "quality/backend/ast-remapping/representative/coverage-final.json" },
  { name: "representative-after", inputs: JSON.parse(gunzipSync(readFileSync("quality/backend/ast-remapping/representative-after-regression/conversion-inputs.json.gz"))), retained: "quality/backend/ast-remapping/representative-after-regression/coverage-final.json" },
  { name: "tiny", inputs: JSON.parse(readFileSync("quality/backend/ast-remapping/ast/conversion-inputs.json")).map(x => [x.filename, x.wrapperLength, x.sources, x.functions]), retained: "quality/backend/ast-remapping/ast/coverage-final.json" },
];
function semantic(coverage, kind) {
  const map = coverage[{ f: "fnMap", s: "statementMap", b: "branchMap" }[kind]];
  return Object.fromEntries(Object.entries(map).map(([id, entry]) => {
    const location = kind === "f" ? { decl: entry.decl, loc: entry.loc } : entry;
    return [JSON.stringify(location), coverage[kind][id]];
  }));
}
const summary = { installedPath: mapperPath, originalHash: hash(original), correctedHash: hash(corrected), runs: [] };
for (const dataset of datasets) {
  const generated = [];
  for (const mapper of [originalMapper, correctedMapper]) {
    const report = {};
    for (const [filename, wrapperLength, sources, functions] of dataset.inputs) {
      const ast = await parseAstAsync(sources.source);
      Object.assign(report, await mapper({ code: sources.source, sourceMap: sources.sourceMap?.sourcemap, ast,
        coverage: { functions, url: filename }, wrapperLength,
        ignoreNode(node, type) {
          if (type === "statement" && node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name.startsWith("__vite_ssr_import_")) return true;
          if (type === "statement" && node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression" && node.expression.left.type === "MemberExpression" && node.expression.left.object.type === "Identifier" && node.expression.left.object.name === "__vite_ssr_exports__") return true;
          if (type === "statement" && node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name === "__vite_ssr_export_default__") return true;
          return false;
        },
      }));
    }
    generated.push(report);
  }
  const retained = JSON.parse(readFileSync(dataset.retained));
  const first = Object.values(generated[0])[0], second = Object.values(generated[1])[0];
  const result = { dataset: dataset.name, inputHash: hash(JSON.stringify(dataset.inputs)), originalReproducesRetained: JSON.stringify(generated[0]) === JSON.stringify(retained),
    counts: { original: { functions: Object.keys(first.f).length, statements: Object.keys(first.s).length, branches: Object.keys(first.b).length },
      corrected: { functions: Object.keys(second.f).length, statements: Object.keys(second.s).length, branches: Object.keys(second.b).length } }, counterChanges: {} };
  for (const kind of ["f", "s", "b"]) {
    const before = semantic(first, kind), after = semantic(second, kind);
    result.counterChanges[kind] = { changedOrMissing: Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({ location: JSON.parse(key), before: before[key], after: after[key] })),
      added: Object.keys(after).filter(key => !(key in before)).map(key => ({ location: JSON.parse(key), count: after[key] })) };
  }
  writeFileSync(`${output}/${dataset.name}-original.json`, JSON.stringify(generated[0], null, 2) + "\n");
  writeFileSync(`${output}/${dataset.name}-corrected.json`, JSON.stringify(generated[1], null, 2) + "\n");
  summary.runs.push(result);
}
writeFileSync(`${output}/comparison.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
