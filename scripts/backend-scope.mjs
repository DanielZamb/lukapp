import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { matchesGlob, resolve, relative, isAbsolute } from "node:path";
import ts from "typescript";

export const policy = JSON.parse(readFileSync("quality/backend/policy.json", "utf8"));
export function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
}
export function backendFiles() {
  return trackedFiles().filter(file => policy.include.some(pattern => matchesGlob(file, pattern)) &&
    !policy.exclude.some(pattern => matchesGlob(file, pattern)));
}
export function areaFor(file) {
  if (file.startsWith("src/accounting/")) return "accounting";
  if (file.startsWith("src/budget/")) return "budget";
  if (file.startsWith("src/savingsRecovery/")) return "recovery";
  if (file.startsWith("src/access/") || /^(convex\/(lib\/(owner|clerk|deviceAccess|providerWork)|devices|clerkProvider|clerkWebhook|providerWork|authConnection|deviceValidators|providerValidators)\.ts)$/.test(file)) return "auth";
  return "convex";
}
export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
export function compilerConfigurationFiles(seeds, root = process.cwd()) {
  const files = new Set();
  for (const seed of seeds) {
    const config = ts.getParsedCommandLineOfConfigFile(resolve(root, seed), {}, {
      ...ts.sys, getCurrentDirectory: () => root, readDirectory: () => [],
      readFile(file) {
        const text = ts.sys.readFile(file);
        if (text !== undefined) {
          const path = relative(root, file);
          if (path === ".." || path.startsWith("../") || isAbsolute(path)) throw new Error(`Compiler configuration outside checkout: ${file}`);
          files.add(path);
        }
        return text;
      },
      onUnRecoverableConfigFileDiagnostic(diagnostic) { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")); },
    });
    const errors = config.errors.filter(diagnostic => diagnostic.code !== 18003);
    if (errors.length) throw new Error(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
  }
  return [...files].sort();
}
export function manifest() {
  const tracked = trackedFiles();
  const compilerConfigurations = compilerConfigurationFiles(tracked.filter(file => file === "tsconfig.json" || /^(src|convex)\/(.*\/)?tsconfig\.json$/.test(file)));
  const files = [...new Set([...tracked.filter(file => /^(src|convex)\/.*\.(ts|js)$/.test(file) ||
    ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "vitest.config.ts", "vitest.mutation.config.ts", "stryker.config.json", "quality/backend/policy.json"].includes(file) || /^scripts\/.*\.(mjs|test\.mjs)$/.test(file)),
    ...compilerConfigurations])].sort();
  const hashes = Object.fromEntries(files.map(file => [file, sha256(readFileSync(file))]));
  const tests = files.filter(file => file.endsWith(".test.ts"));
  const excludedTests = tests.filter(file => policy.mutationTestExclusions.includes(file));
  const selectedTests = tests.filter(file => !excludedTests.includes(file));
  return { algorithm: "sha256", digest: sha256(JSON.stringify(hashes)), files: hashes, compilerConfigurations, mutationFiles: backendFiles(),
    mutationTests: { selected: selectedTests, excluded: excludedTests, selectedCount: selectedTests.length, excludedCount: excludedTests.length }, policy };
}
