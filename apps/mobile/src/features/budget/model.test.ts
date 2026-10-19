import { expect, test } from "vitest";
import { compactAmount, jarPresentation, monthLabel, nextAction, type BudgetJar } from "./model";

function jar(name: string, limitMinorUnits: number, consumptionMinorUnits: number): BudgetJar {
  return { category: { id: name, name, emoji: "🛒" }, limitMinorUnits, consumptionMinorUnits };
}

test("the most-over jar wins by amount, ahead of any hot jar", () => {
  const jars = [jar("Hot", 1000, 950), jar("Higher ratio", 100, 300), jar("Most over", 1000, 1500)];
  expect(nextAction(jars, "2026-10")).toEqual({ kind: "edit", label: "Open Most over", jar: jars[2] });
  expect(jars.map((jar) => jar.category.id)).toEqual(["Hot", "Higher ratio", "Most over"]);
});

test("the hottest jar wins by ratio at or above 80%, including exactly spent", () => {
  const jars = [jar("Large", 10000, 8000), jar("Hotter", 1000, 900)];
  expect(nextAction(jars, "2026-10")).toEqual({ kind: "edit", label: "Hotter hit 80%", jar: jars[1] });
  expect(nextAction([jars[0]], "2026-10")).toEqual({ kind: "edit", label: "Large hit 80%", jar: jars[0] });
  const spent = jar("Spent", 1000, 1000);
  expect(nextAction([...jars, spent], "2026-10")).toEqual({ kind: "edit", label: "Spent hit 80%", jar: spent });
});

test("cool jars open the first category and empty months create a limit", () => {
  const first = jar("Food", 1000, 799);
  expect(nextAction([first, jar("Travel", 1000, 0)], "2027-01")).toEqual({ kind: "edit", label: "Change January's limit", jar: first });
  expect(nextAction([], "2027-01")).toEqual({ kind: "add", label: "Set a January limit" });
  expect(monthLabel("2027-01")).toBe("January 2027");
});

test.each([
  [0, "0"], [123, "1.23"], [99_999, "999.99"], [100_000, "1K"], [125_000, "1.3K"],
  [35_400_000, "354K"], [22_800_000, "228K"], [41_300_000, "413K"],
  [100_000_000, "1M"], [110_000_000, "1.1M"], [123_000_000, "1.23M"],
  [1_234_000_000, "12M"], [-35_400_000, "−354K"], [-123, "−1.23"],
])("compact minor-unit amount %s is %s without a currency symbol", (minor, expected) => {
  expect(compactAmount(minor)).toBe(expected);
});

test.each([
  [0, { over: false, amount: 1000, fill: 1 }], [500, { over: false, amount: 500, fill: 0.5 }],
  [1000, { over: false, amount: 0, fill: 0 }], [1500, { over: true, amount: 500, fill: 0 }],
  [-1500, { over: false, amount: 2500, fill: 1 }],
])("jar remaining fill follows consumption %s", (consumed, expected) => {
  expect(jarPresentation(jar("Food", 1000, consumed))).toEqual(expected);
});
