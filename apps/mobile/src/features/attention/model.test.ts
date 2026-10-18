import { expect, test } from "vitest";
import { budgetAttention } from "./model";

type Evaluation = Parameters<typeof budgetAttention>[0];
const food = { category: { id: "food", name: "Food", emoji: "🍋" }, revisionId: "food-limit",
  limitMinorUnits: 100_00, consumptionMinorUnits: 150_00 };

test("no limits, spend below a limit, and spend exactly on the line have no alerts", () => {
  for (const jars of [[], [{ ...food, consumptionMinorUnits: 0 }], [{ ...food, consumptionMinorUnits: 100_00 }]]) {
    expect(budgetAttention({ currency: "COP", jars })).toEqual({
      rows: [], home: null, bellLabel: "Alerts, nothing needs attention",
    });
  }
});

test("one category carries its look destination, spend and limit, and exact amount over", () => {
  expect(budgetAttention({ currency: "COP", jars: [food] })).toEqual({
    rows: [{ id: "food", title: "🍋  Food is over", detail: "COP 150 of COP 100",
      destination: { pathname: "/category-look", params: { categoryId: "food" } } }],
    home: { title: "Food is over its limit", detail: "COP 50 over" },
    bellLabel: "Alerts, 1 over the limit",
  });
});

test("many categories sort by amount over, exclude holding limits, and sum only the excess", () => {
  const input: Evaluation = { currency: "COP", jars: [
    food,
    { ...food, category: { id: "clothes", name: "Clothes", emoji: "👕" }, consumptionMinorUnits: 90_00 },
    { ...food, category: { id: "travel", name: "Travel", emoji: "🚕" }, consumptionMinorUnits: 175_00 },
  ] };
  expect(budgetAttention(input)).toEqual({
    rows: [
      { id: "travel", title: "🚕  Travel is over", detail: "COP 175 of COP 100",
        destination: { pathname: "/category-look", params: { categoryId: "travel" } } },
      { id: "food", title: "🍋  Food is over", detail: "COP 150 of COP 100",
        destination: { pathname: "/category-look", params: { categoryId: "food" } } },
    ],
    home: { title: "2 categories are over their limits", detail: "COP 125 over in total" },
    bellLabel: "Alerts, 2 over the limit",
  });
  expect(input.jars.map((jar) => jar.category.id)).toEqual(["food", "clothes", "travel"]);
});

test("currency-code formatting retains cents and groups thousands", () => {
  expect(budgetAttention({ currency: "USD", jars: [{ ...food,
    limitMinorUnits: 1_000_25, consumptionMinorUnits: 1_100_75 }] })).toMatchObject({
    rows: [{ detail: "USD 1.100,75 of USD 1.000,25" }],
    home: { detail: "USD 100,50 over" },
  });
});
