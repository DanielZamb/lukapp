import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { budgetAttention } from "./model";

const en = createTranslator("en");

type Evaluation = Parameters<typeof budgetAttention>[0];
const food = { category: { id: "food", name: "Food", emoji: "🍋" }, revisionId: "food-limit",
  limitMinorUnits: 100_00, consumptionMinorUnits: 150_00 };

test("no limits, spend below a limit, and spend exactly on the line have no alerts", () => {
  for (const jars of [[], [{ ...food, consumptionMinorUnits: 0 }], [{ ...food, consumptionMinorUnits: 100_00 }]]) {
    expect(budgetAttention({ currency: "COP", jars }, en)).toEqual({
      rows: [], home: null, bellLabel: "Alerts, nothing needs attention",
    });
  }
});

test("one category carries its look destination, spend and limit, and exact amount over", () => {
  expect(budgetAttention({ currency: "COP", jars: [food] }, en)).toEqual({
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
  expect(budgetAttention(input, en)).toEqual({
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
    limitMinorUnits: 1_000_25, consumptionMinorUnits: 1_100_75 }] }, en)).toMatchObject({
    rows: [{ detail: "USD 1,100.75 of USD 1,000.25" }],
    home: { detail: "USD 100.50 over" },
  });
});

test("Spanish alerts read as whole sentences with the stored category name and counted bell label", () => {
  const es = createTranslator("es");
  expect(budgetAttention({ currency: "COP", jars: [] }, es).bellLabel).toBe("Alertas, nada pendiente");
  expect(budgetAttention({ currency: "COP", jars: [food] }, es)).toEqual({
    rows: [{ id: "food", title: "🍋  Food se pasó del tope", detail: "COP 150 de COP 100",
      destination: { pathname: "/category-look", params: { categoryId: "food" } } }],
    home: { title: "Food se pasó del tope", detail: "COP 50 de más" },
    bellLabel: "Alertas, 1 categoría se pasó del tope",
  });
  const two = budgetAttention({ currency: "COP", jars: [food,
    { ...food, category: { id: "travel", name: "Viajes", emoji: "🚕" }, consumptionMinorUnits: 175_00 }] }, es);
  expect(two.home).toEqual({ title: "2 categorías se pasaron del tope", detail: "COP 125 de más en total" });
  expect(two.bellLabel).toBe("Alertas, 2 categorías se pasaron del tope");
});

test("a spend-nothing jar alerts as soon as anything is spent and names the zero limit in each language", () => {
  const zero = { ...food, category: { id: "delivery", name: "Domicilios", emoji: "🛵" }, limitMinorUnits: 0 };
  const es = createTranslator("es");
  for (const consumptionMinorUnits of [0, -20_00])
    expect(budgetAttention({ currency: "COP", jars: [{ ...zero, consumptionMinorUnits }] }, es).rows).toEqual([]);
  expect(budgetAttention({ currency: "COP", jars: [{ ...zero, consumptionMinorUnits: 35_00 }] }, es)).toEqual({
    rows: [{ id: "delivery", title: "🛵  Domicilios se pasó del tope", detail: "Sin gastos · llevas COP 35 gastados",
      destination: { pathname: "/category-look", params: { categoryId: "delivery" } } }],
    home: { title: "Domicilios se pasó del tope sin gastos", detail: "COP 35 de más" },
    bellLabel: "Alertas, 1 categoría se pasó del tope",
  });
  expect(budgetAttention({ currency: "COP", jars: [{ ...zero, consumptionMinorUnits: 35_00 }, food] }, en)).toEqual({
    rows: [
      { id: "food", title: "🍋  Food is over", detail: "COP 150 of COP 100",
        destination: { pathname: "/category-look", params: { categoryId: "food" } } },
      { id: "delivery", title: "🛵  Domicilios is over", detail: "Spend nothing · COP 35 spent",
        destination: { pathname: "/category-look", params: { categoryId: "delivery" } } },
    ],
    home: { title: "2 categories are over their limits", detail: "COP 85 over in total" },
    bellLabel: "Alerts, 2 over the limit",
  });
});
