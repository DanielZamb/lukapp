import { defineConfig } from "vitest/config";
import { policy } from "./scripts/backend-scope.mjs";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environmentMatchGlobs: [["convex/**", "edge-runtime"]],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: policy.include,
      exclude: policy.exclude,
      reporter: ["text", "json-summary", "json"],
    },
  },
});

