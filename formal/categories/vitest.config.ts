import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["formal/categories/**/*.test.ts"],
    environment: "edge-runtime",
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
