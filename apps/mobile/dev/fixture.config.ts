import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["dev/fixture.ts"], environment: "node", testTimeout: 7200000 },
});
