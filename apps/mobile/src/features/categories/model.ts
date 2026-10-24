import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../api";

export type CategorySelection = FunctionArgs<
  typeof api.accounting.createUserCategory
>["selection"];
export type NatureAnswer = Extract<CategorySelection, { kind: "custom" }>["answer"];
export type FlowAnswer = Extract<NatureAnswer, "spend" | "receive">;
export type AccountSetupRequest = {
  name: string;
  answer: Exclude<NatureAnswer, FlowAnswer>;
  style: CategorySelection["style"];
};
export type CategoryStyle = CategorySelection["style"];
export type Category = FunctionReturnType<
  typeof api.accounting.listUserCategories
>[number];
export type CategoryNature = NonNullable<Category["nature"]>;
export type CategoryPreset = FunctionReturnType<
  typeof api.accounting.listCategoryPresets
>[number];
export type CategoryOption = {
  key: string;
  name: string;
  style: CategoryStyle;
  selected: boolean;
};
export type CategoryEditor =
  | { kind: "preset"; preset: CategoryPreset; style: CategoryStyle }
  | {
      kind: "custom";
      name: string;
      answer: NatureAnswer | null;
      style: CategoryStyle;
    }
  | { kind: "restyle"; option: CategoryOption; style: CategoryStyle };
export type EditableCategory = Extract<CategoryEditor, { kind: "custom" }> | {
  kind: "edit"; category: Category; name: string; style: CategoryStyle;
};
export const defaultCategoryStyle: CategoryStyle = {
  emoji: "✨",
  tone: "primary",
  color: "h270",
};
export function categoryNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}
export function selectionKey(selection: CategorySelection) {
  return selection.kind === "preset"
    ? `preset:${selection.presetId}`
    : `custom:${categoryNameKey(selection.name)}`;
}
