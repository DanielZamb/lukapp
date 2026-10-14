import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { matchesGlob } from "node:path";
import { analyzeFile } from "./crap.mjs";
import { backendFiles, sha256, policy } from "./backend-scope.mjs";

const ref = process.argv[2];
const commit = ref ? execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim() : undefined;
const files = ref ? execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { encoding: "utf8" }).trim().split("\n")
  .filter(file => policy.include.some(pattern => matchesGlob(file, pattern)) && !policy.exclude.some(pattern => matchesGlob(file, pattern))) : backendFiles();
const hashes = {};
const functions = files.flatMap(file => {
  const bytes = ref ? execFileSync("git", ["show", `${commit}:${file}`]) : readFileSync(file);
  hashes[file] = sha256(bytes);
  return analyzeFile(file, bytes.toString(), undefined)
    .map(({ function: name, line, complexity }) => ({ file, function: name, line, complexity,
      minimumCrapAtFullCoverage: complexity, threshold: policy.maximumFunctionCrap, sourceSha256: hashes[file] }));
});
const failures = functions.filter(row => row.complexity > policy.maximumFunctionCrap);
console.log(JSON.stringify(ref ? { advisoryOnly: true, commit, sourceHashes: hashes, functions, failures } : { failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
