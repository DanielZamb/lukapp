import { createVitest } from "vitest/node";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeFile } from "./crap.mjs";
import { sha256 } from "./backend-scope.mjs";

const directory = "quality/backend/ast-remapping";
const file = `${directory}/fixture/nested.ts`;
const source = readFileSync(file, "utf8");
const summary = { sourceHash: sha256(source), fixture: file, experiments: [] };
for (const ast of [false, true]) {
  const label = ast ? "ast" : "legacy";
  const output = `${directory}/${label}`;
  mkdirSync(output, { recursive: true });
  const ctx = await createVitest("test", { config: false, watch: false, maxWorkers: 1,
    include: [`${directory}/fixture/nested.test.ts`], reporters: ["default"], coverage: {
      enabled: true, provider: "v8", include: [file], reporter: ["json"], reportsDirectory: output,
      processingConcurrency: 1, experimentalAstAwareRemapping: ast,
    } });
  try {
    await ctx.initCoverageProvider();
    const provider = ctx.coverageProvider;
    const raw = [], conversions = [];
    const receive = provider.onAfterSuiteRun.bind(provider);
    provider.onAfterSuiteRun = meta => { raw.push(meta); return receive(meta); };
    const convert = provider.v8ToIstanbul.bind(provider);
    provider.v8ToIstanbul = async (filename, wrapperLength, sources, functions) => {
      conversions.push({ filename, wrapperLength, sources, functions });
      return convert(filename, wrapperLength, sources, functions);
    };
    await ctx.start();
    writeFileSync(`${output}/raw-v8.json`, JSON.stringify(raw, null, 2) + "\n");
    writeFileSync(`${output}/conversion-inputs.json`, JSON.stringify(conversions, null, 2) + "\n");
    const coverage = JSON.parse(readFileSync(`${output}/coverage-final.json`));
    const data = coverage[resolve(file)];
    let rows, reporterError;
    try { rows = analyzeFile(file, source, data, ast ? "vitest-v8-3.2.7-ast-v1" : "legacy"); } catch (error) { reporterError = error.stack; }
    const result = { label, resolvedOption: provider.options.experimentalAstAwareRemapping ?? false,
      version: provider.version, files: ctx.state.getFiles().map(file => ({ file: file.filepath, state: file.result?.state })),
      errors: [...ctx.state.errorsSet].map(error => String(error)), rows, reporterError, fnMap: data.fnMap, f: data.f, branchMap: data.branchMap, b: data.b };
    writeFileSync(`${output}/analysis.json`, JSON.stringify(result, null, 2) + "\n");
    summary.experiments.push(result);
  } finally { await ctx.close(); }
}
writeFileSync(`${directory}/comparison.json`, JSON.stringify(summary, null, 2) + "\n");
