import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["apps/mobile/modules/notification-intake/**/*.test.ts"] } });
