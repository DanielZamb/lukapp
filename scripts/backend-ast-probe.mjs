import { createVitest } from "vitest/node";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { analyzeFile } from "./crap.mjs";
import { coverageFormat, sha256, manifest } from "./backend-scope.mjs";
const directory = "quality/backend/ast-remapping/representative";
mkdirSync(directory, { recursive: true });
const file = "src/savingsRecovery/commands.ts";
const inputs = manifest();
writeFileSync(`${directory}/manifest-before.json`, JSON.stringify(inputs, null, 2) + "\n");
const ctx = await createVitest("test", { config: "vitest.config.ts", watch: false, maxWorkers: 1,
  include: ["convex/savingsRecovery.test.ts"], reporters: ["default"], coverage: {
    enabled: true, provider: "v8", include: [file], reporter: ["json"], reportsDirectory: directory,
    processingConcurrency: 1, experimentalAstAwareRemapping: true,
  } });
try {
  await ctx.initCoverageProvider();
  const provider = ctx.coverageProvider, raw = [], conversions = [];
  const receive = provider.onAfterSuiteRun.bind(provider);
  provider.onAfterSuiteRun = meta => { raw.push(meta); return receive(meta); };
  const convert = provider.v8ToIstanbul.bind(provider);
  provider.v8ToIstanbul = async (...args) => { conversions.push(args); return convert(...args); };
  await ctx.start();
  const coverage = JSON.parse(readFileSync(`${directory}/coverage-final.json`));
  const source = readFileSync(file, "utf8"), rows = analyzeFile(file, source, coverage[resolve(file)], coverageFormat.format);
  writeFileSync(`${directory}/raw-v8.json.gz`, gzipSync(JSON.stringify(raw)));
  writeFileSync(`${directory}/conversion-inputs.json.gz`, gzipSync(JSON.stringify(conversions)));
  writeFileSync(`${directory}/source.ts.txt`, source);
  const result = { coverageFormat, providerVersion: provider.version, resolvedOption: provider.options.experimentalAstAwareRemapping,
    sourceHash: sha256(source), beforeDigest: inputs.digest, afterDigest: manifest().digest,
    files: ctx.state.getFiles().map(file => ({ file: file.filepath, state: file.result?.state, tests: file.tasks.length })),
    errors: [...ctx.state.errorsSet].map(error => String(error)), rows, mappingFailures: rows.mappingFailures, assignments: rows.assignments };
  writeFileSync(`${directory}/analysis.json`, JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.errors.length || result.files.some(file => file.state !== "pass") ? 1 : 0;
} finally { await ctx.close(); }
