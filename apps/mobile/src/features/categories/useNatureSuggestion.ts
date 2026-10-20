import { useQuery } from "convex/react";
import { api } from "../api";
import { categoryNameKey, type NatureAnswer } from "./model";

export function useNatureSuggestion(name: string, direction?: "in" | "out") {
  const allowed: NatureAnswer[] = direction === "out"
    ? ["spend", "stillMine", "payDebt"]
    : direction === "in"
      ? ["receive", "stillMine", "payDebt"]
      : ["spend", "receive", "stillMine", "payDebt"];
  const key = categoryNameKey(name);
  const suggestion = useQuery(api.accounting.suggestCategoryNature,
    key ? { name: key, ...(direction ? { direction } : {}) } : "skip");
  const suggested = suggestion?.suggested;
  return { allowed, suggested: suggested && allowed.includes(suggested) ? suggested : null };
}
