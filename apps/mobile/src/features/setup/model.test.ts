import { expect, test } from "vitest";
import { setupSelections } from "./model";

test("a Spanish setup keeps each preset's identity and sends the names the person saw", () => {
  const presets = [{ id: "groceries", name: "Food", nature: "Expense" as const }];
  const style = { emoji: "🛒", tone: "primary" as const };
  expect(setupSelections([
    { name: "Comida", starterName: "Food", style, source: "starter" },
    { name: "Hogar", starterName: "Home", style, source: "starter" },
    { name: "Food", starterName: "Food", style, source: "starter" },
  ], presets)).toEqual([
    { kind: "preset", presetId: "groceries", style, name: "Comida" },
    { kind: "custom", name: "Hogar", answer: "spend", style },
    { kind: "preset", presetId: "groceries", style },
  ]);
});
