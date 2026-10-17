import type { IntakeCandidate } from "./candidates";

export function shouldPlantDevSeed(
  seed: string | undefined,
  dev = typeof __DEV__ !== "undefined" && __DEV__,
) {
  return dev === true && seed === "1";
}

export function seedCandidate(
  workspaceId: string,
  profileId: string,
  currency: "COP" | "USD",
): IntakeCandidate {
  const createdAt = Date.now();
  return {
    id: "seed-groceries",
    createdAt,
    expiresAt: createdAt + 2 * 24 * 60 * 60 * 1000,
    workspaceId,
    currency,
    suggestion: {
      direction: "out",
      description: "Groceries",
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
