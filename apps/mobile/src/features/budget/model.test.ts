import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";

const en = createTranslator("en");
import { compactAmount, jarPresentation, monthLabel, nextAction, type BudgetJar } from "./model";

function jar(name: string, limitMinorUnits: number, consumptionMinorUnits: number): BudgetJar {
  return { category: { id: name, name, emoji: "🛒" }, limitMinorUnits, consumptionMinorUnits };
}

test("the most-over jar wins by amount, ahead of any hot jar", () => {
  const jars = [jar("Hot", 1000, 950), jar("Higher ratio", 100, 300), jar("Most over", 1000, 1500)];
  expect(nextAction(jars, "2026-10", en)).toEqual({ kind: "edit", label: "Open Most over", jar: jars[2] });
  expect(jars.map((jar) => jar.category.id)).toEqual(["Hot", "Higher ratio", "Most over"]);
});

test("the hottest jar wins by ratio at or above 80%, including exactly spent", () => {
  const jars = [jar("Large", 10000, 8000), jar("Hotter", 1000, 900)];
  expect(nextAction(jars, "2026-10", en)).toEqual({ kind: "edit", label: "Hotter hit 80%", jar: jars[1] });
  expect(nextAction([jars[0]], "2026-10", en)).toEqual({ kind: "edit", label: "Large hit 80%", jar: jars[0] });
  const spent = jar("Spent", 1000, 1000);
  expect(nextAction([...jars, spent], "2026-10", en)).toEqual({ kind: "edit", label: "Spent hit 80%", jar: spent });
});

test("cool jars open the first category and empty months create a limit", () => {
  const first = jar("Food", 1000, 799);
  expect(nextAction([first, jar("Travel", 1000, 0)], "2027-01", en)).toEqual({ kind: "edit", label: "Change January's limit", jar: first });
  expect(nextAction([], "2027-01", en)).toEqual({ kind: "add", label: "Set a January limit" });
  expect(monthLabel("2027-01")).toBe("January 2027");
});

test.each([
  [0, "0", "0"], [123, "1,23", "1.23"], [99_999, "999,99", "999.99"], [100_000, "1K", "1K"], [125_000, "1,3K", "1.3K"],
  [35_400_000, "354K", "354K"], [22_800_000, "228K", "228K"], [41_300_000, "413K", "413K"],
  [100_000_000, "1M", "1M"], [110_000_000, "1,1M", "1.1M"], [123_000_000, "1,23M", "1.23M"],
  [1_234_000_000, "12M", "12M"], [-35_400_000, "−354K", "−354K"], [-123, "−1,23", "−1.23"],
])("compact minor-unit amount %s reads %s in COP and %s in USD, in English, without a currency symbol", (minor, cop, usd) => {
  expect(compactAmount(minor, "COP", "en")).toBe(cop);
  expect(compactAmount(minor, "USD", "en")).toBe(usd);
});

test.each([
  [0, { status: "left", spendNothing: false, amount: 1000, fill: 1 }],
  [500, { status: "left", spendNothing: false, amount: 500, fill: 0.5 }],
  [1000, { status: "left", spendNothing: false, amount: 0, fill: 0 }],
  [1500, { status: "over", spendNothing: false, amount: 500, fill: 0 }],
  [-1500, { status: "left", spendNothing: false, amount: 2500, fill: 1 }],
])("jar remaining fill follows consumption %s", (consumed, expected) => {
  expect(jarPresentation(jar("Food", 1000, consumed))).toEqual(expected);
});

test("a spend-nothing jar is calm at zero or a net refund and over by everything spent, through every model function that takes a jar", async () => {
  const { postingBudgetImpact, batchPostingBudgetImpact } = await import("./postingImpact");
  const { budgetAttention } = await import("../attention/model");
  const zero = (consumptionMinorUnits: number) => jar("Delivery", 0, consumptionMinorUnits);
  const outputs = [0, 5_000_000, -5_000_000].map((consumed) => {
    const jars = [zero(consumed)];
    return {
      presentation: jarPresentation(jars[0]),
      action: nextAction(jars, "2026-10", en).label,
      impact: postingBudgetImpact({ jars, categoryIds: ["Delivery"], expenseMinorUnits: 2_000_000 }),
      alerts: budgetAttention({ currency: "COP", jars: jars.map((item) => ({ ...item, revisionId: "zero" })) }, en),
    };
  });
  expect(outputs).toEqual([
    { presentation: { status: "clear", spendNothing: true, amount: 0, fill: 0 }, action: "Change October's limit",
      impact: [{ category: { id: "Delivery", name: "Delivery", emoji: "🛒" }, overMinorUnits: 2_000_000 }],
      alerts: { rows: [], home: null, bellLabel: "Alerts, nothing needs attention" } },
    { presentation: { status: "over", spendNothing: true, amount: 5_000_000, fill: 0 }, action: "Open Delivery",
      impact: [{ category: { id: "Delivery", name: "Delivery", emoji: "🛒" }, overMinorUnits: 2_000_000 }],
      alerts: {
        rows: [{ id: "Delivery", title: "🛒  Delivery is over", detail: "Spend nothing · COP 50.000 spent",
          destination: { pathname: "/category-look", params: { categoryId: "Delivery" } } }],
        home: { title: "Delivery is over its spend-nothing limit", detail: "COP 50.000 over" },
        bellLabel: "Alerts, 1 over the limit",
      } },
    { presentation: { status: "clear", spendNothing: true, amount: 0, fill: 0 }, action: "Change October's limit",
      impact: [{ category: { id: "Delivery", name: "Delivery", emoji: "🛒" }, overMinorUnits: 2_000_000 }],
      alerts: { rows: [], home: null, bellLabel: "Alerts, nothing needs attention" } },
  ]);
  const numbers = (value: unknown): unknown[] => typeof value === "number" ? [value]
    : value && typeof value === "object" ? Object.values(value).flatMap(numbers) : [];
  expect(numbers(outputs).filter((value) => !Number.isFinite(value))).toEqual([]);
  expect(numbers({ broken: { ratio: 0 / 0 } })).toEqual([NaN]);
  expect(postingBudgetImpact({ jars: [zero(-5_000_000)], categoryIds: ["Delivery"], expenseMinorUnits: 7_000_000 }))
    .toEqual([{ category: { id: "Delivery", name: "Delivery", emoji: "🛒" }, overMinorUnits: 7_000_000 }]);
  expect(await batchPostingBudgetImpact([{ kind: "expense", payload: {
    workspaceId: "workspace", financialAccountProfileId: "cash", accountingDate: "2026-10-17", description: "Pizza",
    idempotencyKey: "pizza", amount: { currency: "COP", minorUnits: 1 }, userCategoryIds: ["Delivery"],
  } }], async () => ({ jars: [zero(0)] }))).toEqual([{ category: { id: "Delivery", name: "Delivery", emoji: "🛒" }, overMinorUnits: 1 }]);
});

test("spend-nothing jars never rank as hot and never displace a hot positive jar", () => {
  const hot = jar("Food", 1000, 900);
  expect(nextAction([jar("Delivery", 0, 0), hot, jar("Gifts", 0, -300)], "2026-10", en)).toEqual({ kind: "edit", label: "Food hit 80%", jar: hot });
  const over = jar("Delivery", 0, 50);
  expect(nextAction([hot, over], "2026-10", en)).toEqual({ kind: "edit", label: "Open Delivery", jar: over });
});
