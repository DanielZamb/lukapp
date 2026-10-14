import { test, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import * as accounting from "../../../convex/accounting";
import * as budget from "../../../convex/budget";
import * as savingsRecovery from "../../../convex/savingsRecovery";
import { operations } from "../../../src/access/protocol";
import { z } from "zod";

const destination = new URL("../src/dev/public-contract.json", import.meta.url);
const modules = { accounting, budget, savingsRecovery };
const objectSchema = z.object({ type: z.literal("object"), value: z.record(z.string(), z.json()) }).strict();

test("development public contract matches current registered financial validators", () => {
  const contract: Record<string, { kind: "mutation" | "query"; args: z.infer<ReturnType<typeof z.json>> }> = {};
  for (const [module, definitions] of Object.entries(modules)) {
    for (const [name, definition] of Object.entries(definitions)) {
      const operation = operations.find(candidate => candidate === module + "." + name);
      if (!operation) continue;
      if (!("exportArgs" in definition) || typeof definition.exportArgs !== "function") throw new Error("Registered validator export required");
      const args = objectSchema.parse(JSON.parse(z.string().parse(definition.exportArgs())));
      expect(args.value.access).toBeDefined();
      delete args.value.access;
      contract[operation] = { kind: "isMutation" in definition ? "mutation" : "query", args };
    }
  }
  expect(Object.keys(contract).sort()).toEqual(operations.filter(operation => !operation.startsWith("devices.")).sort());
  const text = JSON.stringify(contract, null, 2) + "\n";
  if (process.env.F03_UPDATE_PUBLIC_CONTRACT === "1") writeFileSync(destination, text);
  else expect(readFileSync(destination, "utf8")).toBe(text);
});
