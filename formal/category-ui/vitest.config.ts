import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["apps/mobile/vitest.setup.ts"],
    include: ["apps/mobile/src/category-ui-formal/extract.formal.ts", "apps/mobile/src/category-ui-formal/crud.formal.ts"],
    testTimeout: 240_000,
    fileParallelism: false,
    reporters: ["default"],
  },
});
