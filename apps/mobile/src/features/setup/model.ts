import type {
  FlowAnswer,
  CategoryPreset,
  CategorySelection,
  CategoryStyle,
} from "../categories/model";
import type { Translator } from "../../../../../src/i18n";
import { parseMoney } from "../money";

export type SetupCategory = {
  name: string;
  style: CategoryStyle;
} & (
  /** `starterName` is the built-in English name the server's presets are matched by; `name` is what the person saw. */
  | { source: "starter"; starterName?: string }
  | { source: "custom"; answer: FlowAnswer }
);
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
        ? presets.find((preset) => preset.name === (category.starterName ?? category.name))
        : undefined;
    return preset
      ? {
          kind: "preset", presetId: preset.id, style: category.style,
          ...(category.name === preset.name ? {} : { name: category.name }),
        }
      : {
          kind: "custom",
          name: category.name,
          answer: category.source === "custom" ? category.answer : "spend",
          style: category.style,
        };
  });
}
export function startingAmount(text: string, currency: string, { t }: Translator) {
  const minorUnits = text.trim() ? parseMoney(text, currency) : 0;
  if (minorUnits < 0) throw new Error(t("setup.startingNegative"));
  return minorUnits;
}
