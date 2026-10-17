import { spawnSync } from "node:child_process";

for (const args of [["test"], ["typecheck"]]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const diff = spawnSync("git", ["diff", "--check"], { stdio: "inherit" });
process.exit(diff.status ?? 1);
