import type { IntakeCandidate } from "./candidates";
import type { UserCategory } from "../../../../../src/accounting/categories/types";
import { defaultAccountingDate } from "../timeZones";
import { addDiscardNotice, readDiscardNotices, type DiscardNotice } from "../localDiscardNotices";

type DevSeedAction = { kind: "plant" | "ready" | "discard" | "remove"; id: string };

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
  if (seed === "discard") return { kind: "discard", id: seedId };
  if (seed === "remove") return { kind: "remove", id: seedId };
  return null;
}

export async function seedDiscardNotices(
  subject: string,
  seedId: string,
  dev = typeof __DEV__ !== "undefined" && __DEV__,
): Promise<DiscardNotice[] | null> {
  if (!devSeedAction("discard", seedId, dev) ||
    seedId !== "QA-DRAFTS-20261018-D1" || !subject.trim()) return null;
  const fixtures: DiscardNotice[] = [
    { reason: "Missing amount or direction", time: Date.parse("2026-10-18T14:42:00Z") },
    { reason: "Security alert", time: Date.parse("2026-10-17T23:18:00Z") },
  ];
  const existing = await readDiscardNotices(subject);
  for (const notice of fixtures) {
    if (!existing.some((item) => item.reason === notice.reason && item.time === notice.time)) {
      await addDiscardNotice(subject, notice);
    }
  }
  return readDiscardNotices(subject);
}

export function readySeedCandidate(input: {
  workspaceId: string;
  profileId: string;
  currency: string;
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
