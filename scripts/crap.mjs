import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const coveragePath = "coverage/coverage-summary.json";
const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listFiles(path);
    }
    return path.endsWith(".ts") &&
      !path.endsWith(".test.ts") &&
      !path.endsWith("convexHarness.ts") &&
      !path.endsWith("types.ts") &&
      !path.endsWith("index.ts")
      ? [path]
      : [];
  });
}

function complexity(source) {
  const decisions = source.match(
    /\b(if|for|while|case|catch)\b|\?|\|\||&&|\?\?/g,
  );
  return 1 + (decisions?.length ?? 0);
}

function crapScore(comp, covPercent) {
  const uncovered = 1 - covPercent / 100;
  return comp * comp * uncovered ** 3 + comp;
}

const files = listFiles("src/accounting");
const rows = files.map((file) => {
  const source = readFileSync(file, "utf8");
  const abs = join(process.cwd(), file);
  const fileCov = coverage[abs] ?? coverage[file];
  const statements = fileCov?.statements?.pct ?? 0;
  const branches = fileCov?.branches?.pct ?? 0;
  const cov = Math.min(statements, branches);
  const comp = complexity(source);
  return {
    file,
    complexity: comp,
    coverage: cov,
    crap: Number(crapScore(comp, cov).toFixed(2)),
  };
});

rows.sort((a, b) => b.crap - a.crap);
const project = {
  files: rows.length,
  maxCrap: rows[0]?.crap ?? 0,
  avgCrap: Number(
    (rows.reduce((sum, row) => sum + row.crap, 0) / rows.length).toFixed(2),
  ),
};

console.log(JSON.stringify({ project, files: rows }, null, 2));
console.log(
  `\nProject CRAP: avg ${project.avgCrap}, max ${project.maxCrap} (${rows[0]?.file ?? "none"})`,
);
