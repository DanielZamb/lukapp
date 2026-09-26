import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    environmentMatchGlobs: [["convex/**", "edge-runtime"]],
  },
});

