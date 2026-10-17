import type { Actor } from "../types";

export type CategoryNature = "Expense" | "Income";
export type NatureAnswer = "spend" | "receive" | "stillMine" | "payDebt";
export type CategoryStyle = {
  emoji: string;
  tone: "primary" | "positive" | "warning";
};
export type CategorySelection =
  | { kind: "preset"; presetId: string; style: CategoryStyle }
  | {
      kind: "custom";
      name: string;
      answer: NatureAnswer;
      style: CategoryStyle;
    };
export type CategoryClassification =
  | { kind: "preset"; concept: string }
  | { kind: "lexicon"; concept: string; version: string }
  | { kind: "fallback"; version: string };
export type UserCategory = {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  nature?: CategoryNature;
  natureSource: "preset" | "answered" | "lexiconConfirmed" | "legacy";
  classification: CategoryClassification;
  defaultPostingAccountCode?: string;
  style: CategoryStyle;
};
export type CreateCategoryInput = {
  actor: Actor;
  workspaceId: string;
  selection: CategorySelection;
};
export type CreateCategoryResult =
  | { kind: "category"; category: UserCategory }
  | {
      kind: "accountSetupRequired";
      answer: "stillMine" | "payDebt";
      name: string;
    };
