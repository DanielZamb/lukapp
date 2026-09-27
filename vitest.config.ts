import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environmentMatchGlobs: [["convex/**", "edge-runtime"]],
    coverage: {
      provider: "v8",
      include: ["src/accounting/**/*.ts"],
      exclude: [
        "src/accounting/**/*.test.ts",
        "src/accounting/convexHarness.ts",
        "src/accounting/types.ts",
        "src/accounting/index.ts",
      ],
      reporter: ["text", "json-summary", "json"],
    },
  },
});

