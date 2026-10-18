import type { IntakeCandidate } from "./candidates";
import type { UserCategory } from "../../../../../src/accounting/categories/types";
import { defaultAccountingDate } from "../timeZones";

type DevSeedAction = { kind: "plant" | "ready" | "remove"; id: string };

export function devSeedAction(
  seed: string | string[] | undefined,
  seedId: string | string[] | undefined,
  dev = typeof __DEV__ !== "undefined" && __DEV__,
): DevSeedAction | null {
  if (
    !dev ||
    typeof seedId !== "string" ||
    !/^QA-DRAFTS-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(seedId)
  ) return null;
  if (seed === "1") return { kind: "plant", id: seedId };
  if (seed === "ready") return { kind: "ready", id: seedId };
  if (seed === "remove") return { kind: "remove", id: seedId };
  return null;
}

export function readySeedCandidate(input: {
  workspaceId: string;
  profileId: string;
  currency: "COP" | "USD";
  seedId: string;
  categoryId: string | string[] | undefined;
  categories: readonly Pick<UserCategory, "id" | "workspaceId" | "nature">[] | undefined;
  timeZone: string;
}, dev = typeof __DEV__ !== "undefined" && __DEV__): IntakeCandidate | null {
  if (
    !devSeedAction("ready", input.seedId, dev) ||
    !input.workspaceId.trim() || !input.profileId.trim() ||
    input.currency !== "COP" ||
    typeof input.categoryId !== "string" || !input.categoryId.trim() ||
    !input.categories?.some((category) =>
      category.id === input.categoryId && category.workspaceId === input.workspaceId &&
      category.nature === "Expense") ||
    !input.timeZone.trim()
  ) return null;
  let accountingDate: string;
  try {
    accountingDate = defaultAccountingDate(input.timeZone);
  } catch {
    return null;
  }
  const candidate = seedCandidate(input.workspaceId, input.profileId, "COP", input.seedId);
  return {
    ...candidate,
    suggestion: {
      ...candidate.suggestion,
      amountMinorUnits: 100,
      accountingDate,
      userCategoryIds: [input.categoryId],
      primaryUserCategoryId: input.categoryId,
    },
  };
}

export function seedCandidate(
  workspaceId: string,
  profileId: string,
  currency: "COP" | "USD",
  seedId = "seed-groceries",
): IntakeCandidate {
  const createdAt = Date.now();
  return {
    id: seedId,
    createdAt,
    expiresAt: createdAt + 2 * 24 * 60 * 60 * 1000,
    workspaceId,
    currency,
    suggestion: {
      direction: "out",
      description: `QA ${seedId}`,
      amountMinorUnits: 126400,
      accountingDate: "2026-10-17",
      financialAccountProfileId: profileId,
      userCategoryIds: [],
      primaryUserCategoryId: null,
    },
    parserVersion: "parser@test",
    consentVersion: "consent@test",
  };
}
