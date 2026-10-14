import { sha256 } from "./backend-scope.mjs";

export function analyzeMutation(report, files, hashes, minimum) {
  const mutants = Object.entries(report.files ?? {}).flatMap(([file, result]) => result.mutants.map(mutant => ({ file, ...mutant })));
  const counts = {};
  for (const mutant of mutants) counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
  const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0);
  const score = mutants.length ? 100 * detected / mutants.length : 0;
  const mismatchedSources = files.filter(file => !report.files?.[file] || sha256(report.files[file].source) !== hashes[file]);
  const unexpectedFiles = Object.keys(report.files ?? {}).filter(file => !files.includes(file));
  const invalidStatuses = mutants.filter(mutant => !["Killed", "Survived", "NoCoverage", "Timeout", "CompileError", "Ignored"].includes(mutant.status));
  return { files, counts, generated: mutants.length,
    executed: (counts.Killed ?? 0) + (counts.Survived ?? 0) + (counts.Timeout ?? 0) + (counts.RuntimeError ?? 0),
    reused: 0, score, mismatchedSources, unexpectedFiles, invalidStatuses,
    mutants, passed: files.length > 0 && (counts.Killed ?? 0) > 0 && score >= minimum && !mismatchedSources.length && !unexpectedFiles.length && !invalidStatuses.length };
}
