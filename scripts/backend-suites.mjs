import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { relative, resolve } from "node:path";
import { sha256 } from "./backend-scope.mjs";

export async function sandboxHashes(inputs) {
  const require = createRequire(import.meta.resolve("@stryker-mutator/core"));
  const { disableTypeChecks } = await import(pathToFileURL(require.resolve("@stryker-mutator/instrumenter")));
  const hashes = {};
  for (const file of Object.keys(inputs.files).filter(file => !inputs.mutationFiles.includes(file))) {
    const content = readFileSync(file, "utf8");
    // Stryker's unchanged default preprocessor runs before sandbox creation.
    // Dependency config files are symlinked, rather than preprocessed/copied.
    const expected = file.split("/").includes("node_modules") ? content :
      (await disableTypeChecks({ name: file, content }, { plugins: undefined })).content;
    hashes[file] = sha256(expected);
  }
  return hashes;
}
export function checkSandbox(inputs, root = process.cwd()) {
  const failures = [];
  for (const [file, hash] of Object.entries(inputs.files)) {
    const path = resolve(root, file);
    if (!existsSync(path)) failures.push({ file, reason: "missing-input" });
    else if (!inputs.mutationFiles.includes(file) && sha256(readFileSync(path)) !== (inputs.sandboxHashes?.[file] ?? hash)) failures.push({ file, reason: "changed-input" });
  }
  return { passed: failures.length === 0, failures };
}
export function checkSuites(selected, suites, runnerTests) {
  const failures = [];
  const identities = [];
  for (const file of selected) {
    const matches = suites.filter(suite => suite.file === file);
    if (matches.length !== 1) { failures.push({ file, reason: "missing-or-duplicate-suite" }); continue; }
    const suite = matches[0];
    if (suite.status !== "pass" || suite.errors?.length) failures.push({ file, reason: "failed-or-uncollected-suite" });
    if (!suite.tests.length) failures.push({ file, reason: "empty-suite" });
    for (const test of suite.tests) {
      identities.push(`${file}#${test.name}`);
      if (test.status !== "pass") failures.push({ file, name: test.name, reason: "failed-skipped-or-unexecuted-test" });
    }
  }
  for (const suite of suites) if (!selected.includes(suite.file)) failures.push({ file: suite.file, reason: "unexpected-suite" });
  if (new Set(identities).size !== identities.length) failures.push({ reason: "duplicate-test-identity" });
  if (runnerTests) {
    const reported = runnerTests.map(test => test.id).sort();
    if (JSON.stringify(reported) !== JSON.stringify([...identities].sort()) || runnerTests.some(test => test.status !== "success"))
      failures.push({ reason: "runner-test-identity-or-status-mismatch" });
  }
  return { passed: failures.length === 0, files: selected.length, tests: identities.length, identities: identities.sort(), failures };
}
export function snapshotSuites(files, root = process.cwd()) {
  return files.map(file => {
    const tests = [], errors = [];
    function walk(suite, names = []) {
      if (suite.result?.errors?.length || suite.result?.state !== "pass") errors.push({ name: suite.name, state: suite.result?.state ?? null,
        messages: suite.result?.errors?.map(error => error.message) ?? [] });
      for (const task of suite.tasks ?? []) {
        if (task.type === "suite") walk(task, [...names, task.name]);
        else if (task.type === "test") tests.push({ name: [...names, task.name].join(" ").trim(), status: task.result?.state ?? null });
      }
    }
    walk(file);
    return { file: relative(root, file.filepath).replaceAll("\\", "/"), status: file.result?.state ?? null, errors, tests };
  });
}
export function regressionSuites(report, root = process.cwd()) {
  return (report.testResults ?? []).map(suite => ({ file: relative(root, suite.name).replaceAll("\\", "/"),
    status: suite.status === "passed" ? "pass" : suite.status, errors: suite.message ? [suite.message] : [],
    tests: (suite.assertionResults ?? []).map(test => ({ name: test.fullName, status: test.status === "passed" ? "pass" : test.status })) }));
}
export function checkPreflight(evidence, inputs) {
  const failures = [];
  if (!evidence || evidence.inputDigest !== inputs.digest) return { passed: false, failures: [{ reason: "missing-or-unbound-preflight" }] };
  // Recalculate from retained observations; never trust the recorded pass flag.
  const sandbox = evidence.sandbox;
  if (!sandbox?.passed || sandbox.failures?.length) failures.push({ reason: "sandbox-input-failure" });
  const suites = checkSuites(inputs.mutationTests.selected, evidence.suites ?? [], evidence.runnerTests ?? []);
  if (evidence.status !== "complete" || !suites.passed) failures.push({ reason: "suite-preflight-failure" });
  if (evidence.expectedIdentities && JSON.stringify(suites.identities) !== JSON.stringify([...evidence.expectedIdentities].sort()))
    failures.push({ reason: "regression-preflight-identity-mismatch" });
  return { passed: failures.length === 0, suites, failures };
}
