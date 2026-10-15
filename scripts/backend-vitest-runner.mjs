import { readFileSync, writeFileSync } from "node:fs";
import { strykerPlugins as installedPlugins, strykerValidationSchema } from "@stryker-mutator/vitest-runner";
import { checkSandbox, snapshotSuites, checkPreflight } from "./backend-suites.mjs";
export { strykerValidationSchema };
const installed = installedPlugins.find(plugin => plugin.name === "vitest");
export function guardRunner(runner, inputs, output, expectedIdentities) {
  const dryRun = runner.dryRun.bind(runner);
  runner.dryRun = async options => {
    const configured = runner.options?.mutate;
    const sandbox = checkSandbox(inputs, process.cwd(), configured);
    const evidence = { instrumentation: inputs.instrumentation, configured, inputDigest: inputs.digest, sandbox, expectedIdentities, status: "error", suites: [], runnerTests: [] };
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (!sandbox.passed) return { status: "error", errorMessage: `Backend sandbox inputs missing/changed: ${JSON.stringify(sandbox.failures)}` };
    try {
      const result = await dryRun(options);
      evidence.status = result.status;
      evidence.suites = snapshotSuites(runner.ctx.state.getFiles());
      evidence.runnerTests = result.tests ?? [];
      evidence.check = checkPreflight(evidence, inputs, configured, inputs.instrumentation?.selection);
      writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
      if (!evidence.check.passed) return { status: "error", errorMessage: `Backend selected-suite preflight failed: ${JSON.stringify(evidence.check)}` };
      return result;
    } catch (error) {
      evidence.error = error.stack ?? String(error);
      writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
      throw error;
    }
  };
  return runner;
}
function factory(injector) {
  const { inputs, output, expectedIdentities } = JSON.parse(readFileSync(process.env.LUKAPP_MUTATION_PREFLIGHT, "utf8"));
  return guardRunner(installed.factory(injector), inputs, output, expectedIdentities);
}
factory.inject = installed.factory.inject;
export const strykerPlugins = [{ ...installed, name: "backend-vitest", factory }];
