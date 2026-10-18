import type { IntakeCandidate } from "./candidates";

type DevSeedAction = { kind: "plant" | "remove"; id: string };

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
  if (seed === "remove") return { kind: "remove", id: seedId };
  return null;
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
