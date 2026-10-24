import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["formal/accounting-replay/projection.test.ts"],
    environment: "edge-runtime",
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
