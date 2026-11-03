import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import base from "../vitest.config.ts";

const path = "apps/mobile/src/ui/SheetModal.tsx";
const baseline = execFileSync("git", ["show", `11433040f0ec0dd6eeb6590c2d98738aef244186:${path}`], { encoding: "utf8" });
const current = realpathSync(resolve(path));

export default defineConfig({
  ...base,
  plugins: [{ name: "sen98-sheet-owner-at-1143304", enforce: "pre", load: (id) => id === current ? baseline : undefined }],
  test: { ...base.test, include: ["apps/mobile/src/ui/SheetModal.closingParity.test.ts"], testNamePattern: "SEN-98 .*parity" },
});
