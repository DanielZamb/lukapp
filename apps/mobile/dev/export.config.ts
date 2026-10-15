import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["dev/export-public-contract.ts"], environment: "node" } });
