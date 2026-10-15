import { defineConfig } from "vitest/config";
import { policy, coverageFormat } from "./scripts/backend-scope.mjs";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environmentMatchGlobs: [["convex/**", "edge-runtime"]],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      experimentalAstAwareRemapping: coverageFormat.experimentalAstAwareRemapping,
      reportOnFailure: true,
      include: policy.include,
      exclude: policy.exclude,
      reporter: ["text", "json-summary", "json"],
    },
  },
});

