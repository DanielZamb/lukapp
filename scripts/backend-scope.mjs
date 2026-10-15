import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { PATCHED_AST_COVERAGE_FORMAT } from "./backend-ast-coverage.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { matchesGlob, resolve, relative, isAbsolute, dirname, join } from "node:path";
import ts from "typescript";

const mapperRequire = createRequire(import.meta.resolve("@vitest/coverage-v8"));
const mapperFile = relative(process.cwd(), mapperRequire.resolve("ast-v8-to-istanbul"));
const mapperPackage = join(dirname(mapperFile), "../package.json");
export const coverageFormat = { format: PATCHED_AST_COVERAGE_FORMAT, provider: "@vitest/coverage-v8", version: "3.2.7", experimentalAstAwareRemapping: true,
  mapper: { package: "ast-v8-to-istanbul", version: "0.3.12", patch: "patches/ast-v8-to-istanbul@0.3.12.patch",
    patchSha256: "c8e3d35eb7cffd753590c123b728c6fdb22e41bd810f34db8c290103ab9e08ce",
    installedSha256: "a14ee93eecb5c0e8baadd5df5613c6afb012563fc3907b35f71ce51df68c4d06" } };
function validateMapper() {
  if (JSON.parse(readFileSync(mapperPackage)).version !== coverageFormat.mapper.version ||
    sha256(readFileSync(mapperFile)) !== coverageFormat.mapper.installedSha256 ||
    sha256(readFileSync(coverageFormat.mapper.patch)) !== coverageFormat.mapper.patchSha256)
    throw new Error("Patched coverage mapper identity mismatch");
}
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
export function importedInputs(seeds, root = process.cwd()) {
  const files = new Set(), configurations = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const file = queue.pop();
    if (files.has(file)) continue;
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) throw new Error(`Missing imported input: ${file}`);
    files.add(file);
    let directory = dirname(absolute);
    let config;
    while (directory.startsWith(resolve(root))) {
      for (const name of ["package.json", "tsconfig.json"]) {
        const candidate = join(directory, name);
        if (existsSync(candidate)) {
          if (name === "package.json") files.add(relative(root, candidate));
          else { configurations.add(relative(root, candidate)); config ??= candidate; }
        }
      }
      if (directory === resolve(root)) break;
      directory = dirname(directory);
    }
    const options = config ? ts.getParsedCommandLineOfConfigFile(config, {}, { ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(d) { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } }).options : {};
    for (const imported of ts.preProcessFile(readFileSync(absolute, "utf8"), true, true).importedFiles) {
      const resolved = ts.resolveModuleName(imported.fileName, absolute, { ...options, allowJs: true }, ts.sys).resolvedModule;
      if (resolved && !resolved.resolvedFileName.includes("/node_modules/")) {
        const local = relative(root, resolved.resolvedFileName);
        if (local.startsWith("../") || isAbsolute(local)) throw new Error(`Import outside checkout: ${local}`);
        queue.push(local);
      } else if (!resolved && imported.fileName.startsWith(".")) throw new Error(`Unresolved local import ${imported.fileName} in ${file}`);
    }
  }
  return { files: [...files].sort(), configurations: [...configurations].sort() };
}
export function manifest() {
  validateMapper();
  const installedCoverageVersion = JSON.parse(readFileSync(new URL(import.meta.resolve("@vitest/coverage-v8/package.json")), "utf8")).version;
  if (installedCoverageVersion !== coverageFormat.version) throw new Error(`Coverage format requires pinned ${coverageFormat.version}; installed ${installedCoverageVersion}`);
  const tracked = trackedFiles();
  const tests = tracked.filter(file => /^(src|convex)\/.*\.test\.ts$/.test(file));
  const excludedTests = tests.filter(file => policy.mutationTestExclusions.includes(file));
  const selectedTests = tests.filter(file => !excludedTests.includes(file));
  const imports = importedInputs(selectedTests);
  const compilerConfigurations = compilerConfigurationFiles([...new Set([
    ...tracked.filter(file => file === "tsconfig.json" || /^(src|convex)\/(.*\/)?tsconfig\.json$/.test(file)), ...imports.configurations])]);
  const files = [...new Set([...tracked.filter(file => /^(src|convex)\/.*\.(ts|js)$/.test(file) ||
    ["scripts/fixtures/backend-quality/ast-remapping/fixture/nested.ts", "scripts/fixtures/backend-quality/ast-remapping/fixture/nested.test.ts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "vitest.config.ts", "vitest.mutation.config.ts", "stryker.config.json", "quality/backend/policy.json"].includes(file) || /^scripts\/.*\.(mjs|test\.mjs)$/.test(file)),
    ...imports.files, ...compilerConfigurations, mapperFile, mapperPackage, coverageFormat.mapper.patch])].sort();
  const hashes = Object.fromEntries(files.map(file => [file, sha256(readFileSync(file))]));
  return { coverageFormat, algorithm: "sha256", digest: sha256(JSON.stringify(hashes)), files: hashes, compilerConfigurations,
    importedInputs: imports.files, mutationFiles: backendFiles(),
    mutationTests: { selected: selectedTests, excluded: excludedTests, selectedCount: selectedTests.length, excludedCount: excludedTests.length }, policy };
}
