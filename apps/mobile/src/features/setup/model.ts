import type {
  FlowAnswer,
  CategoryPreset,
  CategorySelection,
  CategoryStyle,
} from "../categories/model";
import { parseMoney } from "../money";

export type SetupCategory = {
  name: string;
  style: CategoryStyle;
} & ({ source: "starter" } | { source: "custom"; answer: FlowAnswer });
export type SetupSummary = {
  categories: SetupCategory[];
  currency: string;
  startingMinorUnits: number;
  purchaseAlertsConsent: boolean;
  wantsBudgets: boolean;
  firstCategoryId?: string;
};
export function setupSelections(
  categories: SetupCategory[],
  presets: CategoryPreset[],
): CategorySelection[] {
  return categories.map((category) => {
    const preset =
      category.source === "starter"
        ? presets.find((preset) => preset.name === category.name)
        : undefined;
    return preset
      ? { kind: "preset", presetId: preset.id, style: category.style }
      : {
          kind: "custom",
          name: category.name,
          answer: category.source === "custom" ? category.answer : "spend",
          style: category.style,
        };
  });
}
export function startingAmount(text: string) {
  const minorUnits = text.trim() ? parseMoney(text) : 0;
  if (minorUnits < 0) throw new Error("Enter zero or the amount you hold.");
  return minorUnits;
}
