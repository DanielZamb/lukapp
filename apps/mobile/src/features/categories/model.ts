import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../api";

export type CategorySelection = FunctionArgs<
  typeof api.accounting.createUserCategory
>["selection"];
export type CategoryStyle = CategorySelection["style"];
export type Category = FunctionReturnType<
  typeof api.accounting.listUserCategories
>[number];
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
      style: CategoryStyle;
    }
  | { kind: "restyle"; option: CategoryOption; style: CategoryStyle };
export const defaultCategoryStyle: CategoryStyle = {
  emoji: "✨",
  tone: "primary",
  color: "h270",
};
export function selectionKey(selection: CategorySelection) {
  return selection.kind === "preset"
    ? `preset:${selection.presetId}`
    : `custom:${selection.name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase().replace(/\s+/g, " ")}`;
}
