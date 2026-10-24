import { useQuery } from "convex/react";
import { api } from "../api";
import { categoryNameKey, type NatureAnswer } from "./model";

export function useNatureSuggestion(name: string) {
  const allowed: NatureAnswer[] = ["spend", "receive", "stillMine", "payDebt"];
  const key = categoryNameKey(name);
  const suggestion = useQuery(api.accounting.suggestCategoryNature,
    key ? { name: key } : "skip");
  const suggested = suggestion?.suggested;
  return { allowed, suggested: suggested && allowed.includes(suggested) ? suggested : null };
}
