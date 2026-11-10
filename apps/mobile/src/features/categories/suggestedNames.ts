import type { MessageKey, Translator } from "../../../../../src/i18n";

const keys: Record<string, MessageKey> = {
  groceries: "categories.suggestedGroceries",
  dining: "categories.suggestedDining",
  transport: "categories.suggestedTransport",
  health: "categories.suggestedHealth",
  rent: "categories.suggestedRent",
  education: "categories.suggestedEducation",
  clothing: "categories.suggestedClothing",
  entertainment: "categories.suggestedEntertainment",
  pets: "categories.suggestedPets",
  digital: "categories.suggestedDigital",
  fuel: "categories.suggestedFuel",
  salary: "categories.suggestedSalary",
  freelance: "categories.suggestedFreelance",
  rentalIncome: "categories.suggestedRentalIncome",
  gifts: "categories.suggestedGifts",
  home: "categories.suggestedHome",
  fun: "categories.suggestedFun",
  shopping: "categories.suggestedShopping",
  bills: "categories.suggestedBills",
  family: "categories.suggestedFamily",
  other: "categories.suggestedOther",
};

/**
 * The name the app suggests for a built-in category, in the person's language.
 * It is only a suggestion: once the category is created the name is theirs and
 * is never translated again. `id` is a preset id or a starter key.
 */
export function suggestedCategoryName({ t, language }: Pick<Translator, "t" | "language">, id: string, fallback: string): string {
  const key = keys[id];
  return key && language !== "en" ? t(key) : fallback;
}
