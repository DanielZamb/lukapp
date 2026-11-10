import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { listCategoryPresets, resolveCategoryAccount } from "../../../../../src/accounting/categories/policy";
import { starterCategories } from "./looks";
import { suggestedCategoryName } from "./suggestedNames";

const es = createTranslator("es");
const en = createTranslator("en");

test("English keeps the built-in names and Spanish suggests Colombian ones", () => {
  expect(starterCategories.map((starter) => suggestedCategoryName(en, starter.key, starter.name)))
    .toEqual(starterCategories.map((starter) => starter.name));
  expect(starterCategories.map((starter) => suggestedCategoryName(es, starter.key, starter.name))).toEqual([
    "Mercado", "Transporte", "Restaurantes", "Hogar", "Salud", "Diversión",
    "Compras", "Servicios", "Familia", "Educación", "Mascotas", "Otros",
  ]);
  expect(suggestedCategoryName(es, "unknown-preset", "Server name")).toBe("Server name");
});

test("every server preset has a Spanish suggestion", () => {
  for (const preset of listCategoryPresets())
    expect(suggestedCategoryName(es, preset.id, "")).not.toBe("");
});

test("a starter that is not a preset posts to the same account under either language's name", () => {
  const presetNames = new Set(listCategoryPresets().map((preset) => preset.name));
  for (const starter of starterCategories.filter((item) => !presetNames.has(item.name)))
    for (const template of ["co-puc-personal@1", "us-gaap-personal@1"])
      expect(resolveCategoryAccount(suggestedCategoryName(es, starter.key, starter.name), "Expense", template))
        .toEqual(resolveCategoryAccount(starter.name, "Expense", template));
});
