import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, openSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { areaFor, manifest, policy, sha256 } from "./backend-scope.mjs";
import { reportCrap } from "./crap.mjs";
import { checkSuites, regressionSuites, checkPreflight, sandboxHashes, instrumentationFor } from "./backend-suites.mjs";
import { analyzeMutation } from "./backend-mutation.mjs";

export function parseArguments(args) {
  const mode = args[0] ?? "all";
  const area = args[1];
  if (!["all", "coverage", "mutation", "verify"].includes(mode) ||
    args.length > 2 || (["all", "coverage"].includes(mode) && args.length > 1) ||
    (mode === "verify" && (args.length !== 2 || !area)) ||
    (mode === "mutation" && area !== undefined && !policy.areas.includes(area))) throw new Error("Usage: pnpm quality:backend [all|coverage|mutation [area]|verify <run directory>]");
  return { mode, area };
}
export function checkStages(mode, area, stages) {
  const expected = mode === "all" && area === undefined ? ["coverage-crap", ...policy.areas] :
    mode === "coverage" && area === undefined ? ["coverage-crap"] :
    mode === "mutation" && area === undefined ? policy.areas :
    mode === "mutation" && policy.areas.includes(area) ? [area] : undefined;
  const names = Array.isArray(stages) ? stages.map(stage => stage.name) : [];
  const missing = (expected ?? []).filter(name => !names.includes(name));
  const unexpected = names.filter(name => !expected?.includes(name));
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  return { valid: expected !== undefined && Array.isArray(stages) && !missing.length && !unexpected.length && !duplicates.length,
    expected: expected ?? [], missing, unexpected, duplicates, invalidRequest: expected === undefined };
}
export function mutationConfig(base, files, compilerConfigurations, reportPath) {
  return { ...base, mutate: files, ignorePatterns: [...base.ignorePatterns, ...compilerConfigurations.filter(file => !file.split("/").includes("node_modules")).map(file => `!${file}`)],
    jsonReporter: { fileName: reportPath } };
}
export async function prepareMutationStage(inputs, selection, base, reportPath) {
  const instrumentation = instrumentationFor(inputs, selection);
  const config = mutationConfig(base, instrumentation.files, Object.keys(inputs.files), reportPath);
  const bound = { ...inputs, instrumentation };
  bound.sandboxHashes = await sandboxHashes(bound, config);
  return { config, inputs: bound };
}
export function checkRegression(regression, inputs = manifest()) {
  const suites = checkSuites([...inputs.mutationTests.selected, ...inputs.mutationTests.excluded], regressionSuites(regression));
  const loadAssertions = (regression.testResults ?? []).filter(result => result.name.endsWith("/convex/budgetCapacity.load.test.ts"))
    .flatMap(result => result.assertionResults).filter(result => result.title === policy.mandatoryLoadTest);
  return { total: regression.numTotalTests, passed: regression.numPassedTests, pending: regression.numPendingTests, loadAssertions, suites,
    regressionPassed: suites.passed && regression.success === true && regression.numTotalTests > 0 && regression.numPassedTests === regression.numTotalTests &&
      loadAssertions.length === 1 && loadAssertions[0].status === "passed" };
}
export function verifyReceipt(area) {
  const receipt = JSON.parse(readFileSync(join(area, "receipt.json"), "utf8"));
  const current = manifest();
  const changed = Object.keys({ ...receipt.manifest.files, ...current.files }).filter(file => receipt.manifest.files[file] !== current.files[file]);
  const invalidArtifacts = Object.entries(receipt.artifacts).filter(([file, hash]) => sha256(readFileSync(join(area, file))) !== hash).map(([file]) => file);
  const stageCompleteness = checkStages(receipt.mode, receipt.area, receipt.stages);
  const formatMatches = receipt.mode === "mutation" || JSON.stringify(receipt.coverageFormat) === JSON.stringify(current.coverageFormat);
  const stageChecks = [];
  if (formatMatches && stageCompleteness.valid && !changed.length && !invalidArtifacts.length) for (const stage of receipt.stages) {
    if (stage.name === "coverage-crap") {
      const coverage = JSON.parse(gunzipSync(readFileSync(join(area, "coverage-final.json.gz"))));
      const regression = JSON.parse(readFileSync(join(area, "regression.json"), "utf8"));
      stageChecks.push({ name: stage.name, passed: stage.exitStatus === 0 && reportCrap(coverage, receipt.coverageFormat?.format ?? "legacy").passed && checkRegression(regression).regressionPassed });
    } else {
      const report = JSON.parse(gunzipSync(readFileSync(join(area, `${stage.name}-mutation.json.gz`))));
      const files = current.mutationFiles.filter(file => areaFor(file) === stage.name);
      const result = analyzeMutation(report, files, current.files, policy.mutationScoreMinimum);
      const preflightName = `${stage.name}-preflight.json`;
      const evidence = receipt.artifacts[preflightName] ? JSON.parse(readFileSync(join(area, preflightName), "utf8")) : undefined;
      const bindingName = `${stage.name}-preflight-inputs.json`, configName = `${stage.name}-stryker.json`;
      const binding = receipt.artifacts[bindingName] ? JSON.parse(readFileSync(join(area, bindingName), "utf8")) : {};
      const config = receipt.artifacts[configName] ? JSON.parse(readFileSync(join(area, configName), "utf8")) : {};
      const { instrumentation, sandboxHashes: expectedHashes, ...boundManifest } = binding.inputs ?? {};
      const bound = { ...current, instrumentation, sandboxHashes: expectedHashes };
      const preflight = checkPreflight(evidence, bound, config.mutate, stage.name);
      if (JSON.stringify(boundManifest) !== JSON.stringify(current)) preflight.passed = false;
      if (receipt.mode === "all" && evidence) {
        const regression = JSON.parse(readFileSync(join(area, "regression.json"), "utf8"));
        const expected = checkSuites(current.mutationTests.selected, regressionSuites(regression).filter(suite => current.mutationTests.selected.includes(suite.file)));
        if (!expected.passed || JSON.stringify(preflight.suites?.identities) !== JSON.stringify(expected.identities)) preflight.passed = false;
      }
      stageChecks.push({ name: stage.name, preflight, passed: stage.exitStatus === 0 && result.passed && preflight.passed });
    }
  }
  const passed = formatMatches && receipt.passed === true && !receipt.changedDuringRun && changed.length === 0 && invalidArtifacts.length === 0 &&
    stageCompleteness.valid && stageChecks.length === stageCompleteness.expected.length && stageChecks.every(stage => stage.passed);
  return { passed, formatMatches, fullGatePassed: passed && receipt.mode === "all", changed, invalidArtifacts, stageCompleteness, stageChecks, recordedPass: receipt.passed };
}
async function main(args) {
  const { mode, area } = parseArguments(args);
  if (mode === "verify") {
    const result = verifyReceipt(area);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
    return;
  }
  const dir = join("quality/backend/runs", new Date().toISOString().replace(/[:.]/g, "-") + "-" + mode + (area ? "-" + area : ""));
  mkdirSync(dir, { recursive: true });
  const before = manifest();
  const receipt = { startedAt: new Date().toISOString(), mode, area, command: process.argv.slice(1),
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    node: process.version, pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
    coverageFormat: before.coverageFormat, manifest: before, stages: [], artifacts: {}, passed: false };
  writeFileSync(join(dir, "manifest-before.json"), JSON.stringify(before, null, 2) + "\n");
  function retain(file, bytes) { writeFileSync(join(dir, file), bytes); receipt.artifacts[file] = sha256(bytes); }
  function execute(name, args, environment = {}) {
    console.log(`Running ${name}; receipt ${dir}; maximum ${policy.workers} workers`);
    writeFileSync(join(dir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    const logPath = join(dir, `${name}.log`);
    const log = openSync(logPath, "w");
    const result = spawnSync("pnpm", args, { stdio: ["ignore", log, log], env: { ...process.env, ...environment } });
    closeSync(log);
    retain(`${name}.log.gz`, gzipSync(readFileSync(logPath)));
    unlinkSync(logPath);
    return { exitStatus: result.status, signal: result.signal, error: result.error?.message };
  }
  let regressionAllowsMutation = mode === "mutation";
  let expectedIdentities;
  if (mode === "all" || mode === "coverage") {
    if (existsSync("coverage/coverage-final.json")) unlinkSync("coverage/coverage-final.json");
    const testReportPath = resolve(dir, "regression.json");
    const execution = execute("coverage", ["exec", "vitest", "run", "--coverage", "--maxWorkers=2", "--reporter=default", "--reporter=json", `--outputFile=${testReportPath}`], { LUKAPP_INSTRUMENTED_LOAD: "1" });
    const regression = existsSync(testReportPath) ? JSON.parse(readFileSync(testReportPath, "utf8")) : {};
    if (existsSync(testReportPath)) receipt.artifacts["regression.json"] = sha256(readFileSync(testReportPath));
    const regressionSummary = checkRegression(regression, before);
    regressionAllowsMutation = execution.exitStatus === 0 && regressionSummary.regressionPassed;
    expectedIdentities = checkSuites(before.mutationTests.selected, regressionSuites(regression).filter(suite => before.mutationTests.selected.includes(suite.file))).identities;
    const coverage = existsSync("coverage/coverage-final.json") ? JSON.parse(readFileSync("coverage/coverage-final.json", "utf8")) : {};
    retain("coverage-final.json.gz", gzipSync(JSON.stringify(coverage)));
    const crap = reportCrap(coverage, before.coverageFormat.format);
    retain("crap.json", JSON.stringify(crap, null, 2) + "\n");
    receipt.stages.push({ name: "coverage-crap", ...execution, passed: execution.exitStatus === 0 && crap.passed && regressionSummary.regressionPassed,
      regression: regressionSummary,
      loadTestTimeoutMs: 600000,
      functions: crap.functions.length, failures: crap.failures, missingFiles: crap.missingFiles });
    console.log(`CRAP ${crap.passed ? "PASS" : "FAIL"}; ${crap.functions.length} functions; ${crap.failures.length} failures`);
  }
  if ((mode === "all" || mode === "mutation") && regressionAllowsMutation) {
    for (const selectedArea of area ? [area] : policy.areas) {
      const base = JSON.parse(readFileSync("stryker.config.json", "utf8"));
      const reportPath = resolve(dir, `${selectedArea}-mutation.json`);
      const prepared = await prepareMutationStage(before, selectedArea, base, reportPath);
      const { config, inputs } = prepared;
      const files = inputs.instrumentation.files;
      const configPath = join(dir, `${selectedArea}-stryker.json`);
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
      receipt.artifacts[`${selectedArea}-stryker.json`] = sha256(readFileSync(configPath));
      const preflightName = `${selectedArea}-preflight.json`;
      const preflightOutput = resolve(dir, preflightName);
      const preflightInputs = `${selectedArea}-preflight-inputs.json`;
      retain(preflightInputs, JSON.stringify({ inputs, output: preflightOutput, expectedIdentities }, null, 2) + "\n");
      const execution = execute(selectedArea, ["exec", "stryker", "run", configPath], { LUKAPP_MUTATION_PREFLIGHT: resolve(dir, preflightInputs) });
      const evidence = existsSync(preflightOutput) ? JSON.parse(readFileSync(preflightOutput, "utf8")) : undefined;
      if (evidence) receipt.artifacts[preflightName] = sha256(readFileSync(preflightOutput));
      const preflight = checkPreflight(evidence, inputs, config.mutate, selectedArea);
      const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : { files: {} };
      const { mutants, ...analysis } = analyzeMutation(report, files, before.files, policy.mutationScoreMinimum);
      const stage = { name: selectedArea, ...execution, ...analysis, preflight, passed: execution.exitStatus === 0 && analysis.passed && preflight.passed };
      retain(`${selectedArea}-mutation.json.gz`, gzipSync(JSON.stringify(report)));
      if (existsSync(reportPath)) unlinkSync(reportPath);
      retain(`${selectedArea}-survivors.json`, JSON.stringify(mutants.filter(mutant => mutant.status !== "Killed"), null, 2) + "\n");
      receipt.stages.push(stage);
      console.log(`${selectedArea} ${stage.passed ? "PASS" : "FAIL"}; score ${stage.score}; counts ${JSON.stringify(stage.counts)}`);
      writeFileSync(join(dir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    }
  }
  const after = manifest();
  receipt.changedDuringRun = before.digest !== after.digest;
  receipt.inputChanges = Object.keys({ ...before.files, ...after.files }).filter(file => before.files[file] !== after.files[file]);
  receipt.finishedAt = new Date().toISOString();
  receipt.stageCompleteness = checkStages(mode, area, receipt.stages);
  receipt.passed = !receipt.changedDuringRun && receipt.stageCompleteness.valid && receipt.stages.every(stage => stage.passed);
  receipt.fullGatePassed = receipt.passed && mode === "all";
  receipt.artifacts["manifest-before.json"] = sha256(readFileSync(join(dir, "manifest-before.json")));
  writeFileSync(join(dir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(`Receipt: ${dir}/receipt.json; ${receipt.passed ? "PASS" : "FAIL"}`);
  process.exitCode = receipt.passed ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/backend-quality.mjs")) main(process.argv.slice(2));
