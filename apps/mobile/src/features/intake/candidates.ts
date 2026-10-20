import { z } from "zod";
import * as SecureStore from "expo-secure-store";
import {
  runLocalInputWrite,
  type LocalInputLease,
} from "../../local-auth/localInput";
import type { IntakeSuggestion } from "../../../../../src/notificationIntake/types";
import { isReadyCandidate } from "./ready";

export { isReadyCandidate };

export const INTAKE_CANDIDATE_TTL_MS = 15 * 24 * 60 * 60 * 1000;
export const INTAKE_PRIORITY_MS = 3 * 24 * 60 * 60 * 1000;

export type IntakeCandidateId = string;

export type StoredSuggestion = {
  direction: "in" | "out";
  description: string;
  amountMinorUnits: number;
  accountingDate: string;
  financialAccountProfileId: string;
  userCategoryIds: string[];
  primaryUserCategoryId: string | null;
};

export type IntakeCandidate = {
  id: IntakeCandidateId;
  createdAt: number;
  expiresAt: number;
  workspaceId: string;
  currency: "COP" | "USD";
  suggestion: StoredSuggestion;
  parserVersion: string;
  consentVersion: string;
  error?: string;
};

export type IntakeDocument = {
  v: 1;
  candidates: IntakeCandidate[];
};

const suggestionSchema = z.object({
  direction: z.enum(["in", "out"]),
  description: z.string(),
  amountMinorUnits: z.number().int(),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  financialAccountProfileId: z.string(),
  userCategoryIds: z.array(z.string()),
  primaryUserCategoryId: z.string().nullable(),
});

const documentSchema = z.object({
  v: z.literal(1),
  candidates: z.array(
    z.object({
      id: z.string().min(1),
      createdAt: z.number().int().nonnegative(),
      expiresAt: z.number().int().nonnegative(),
      workspaceId: z.string().min(1),
      currency: z.enum(["COP", "USD"]),
      suggestion: suggestionSchema,
      parserVersion: z.string(),
      consentVersion: z.string(),
      error: z.string().optional(),
    }),
  ),
});

export function intakeStorageKey(subject: string) {
  return `u08.intake.${subject}`;
}

export function clearIntakeCandidates(subject: string) {
  return SecureStore.deleteItemAsync(intakeStorageKey(subject));
}

export async function readIntakeRaw(subject: string): Promise<unknown> {
  const raw = await SecureStore.getItemAsync(intakeStorageKey(subject));
  return raw === null ? null : JSON.parse(raw);
}

export function writeIntakeDocument(subject: string, document: IntakeDocument) {
  return SecureStore.setItemAsync(
    intakeStorageKey(subject),
    JSON.stringify(document),
  );
}

export function parseIntakeDocument(raw: unknown, now: number) {
  if (raw === null || raw === undefined)
    return { document: { v: 1 as const, candidates: [] }, dirty: false };
  const document = documentSchema.parse(raw);
  const candidates = document.candidates.filter((row) => row.expiresAt > now);
  return {
    document: { v: 1 as const, candidates },
    dirty: candidates.length !== document.candidates.length,
  };
}

export function isPriorityCandidate(
  candidate: IntakeCandidate,
  now: number,
  currency?: string,
) {
  return (
    !isReadyCandidate(candidate, currency) ||
    candidate.expiresAt - now <= INTAKE_PRIORITY_MS
  );
}

export function suggestionOf(candidate: IntakeCandidate): IntakeSuggestion {
  return {
    direction: candidate.suggestion.direction,
    description: candidate.suggestion.description,
    amount: {
      currency: candidate.currency,
      minorUnits: Math.abs(candidate.suggestion.amountMinorUnits),
    },
    accountingDate: candidate.suggestion.accountingDate,
    financialAccountProfileId: candidate.suggestion.financialAccountProfileId,
    userCategoryIds: [...candidate.suggestion.userCategoryIds],
    primaryUserCategoryId: candidate.suggestion.primaryUserCategoryId,
  };
}

export function acceptIn(
  document: IntakeDocument,
  candidate: IntakeCandidate,
  now: number,
) {
  const candidates = document.candidates.filter((row) => row.expiresAt > now);
  return {
    v: 1 as const,
    candidates: [...candidates.filter((row) => row.id !== candidate.id), candidate],
  };
}

export function consumeIn(document: IntakeDocument, id: IntakeCandidateId) {
  return {
    v: 1 as const,
    candidates: document.candidates.filter((row) => row.id !== id),
  };
}

export function failIn(
  document: IntakeDocument,
  id: IntakeCandidateId,
  error: string,
) {
  return {
    v: 1 as const,
    candidates: document.candidates.map((row) =>
      row.id === id ? { ...row, error } : row,
    ),
  };
}

export function viewInbox(
  document: IntakeDocument,
  workspaceId: string,
  now: number,
  currency: string,
) {
  const live = document.candidates.filter(
    (row) => row.expiresAt > now && row.workspaceId === workspaceId,
  );
  const nowRows = live.filter((row) => isPriorityCandidate(row, now, currency));
  const waitRows = live.filter((row) => !isPriorityCandidate(row, now, currency));
  return {
    now: nowRows,
    wait: waitRows,
    ready: live.filter((row) => isReadyCandidate(row, currency)),
    count: live.length,
  };
}

export async function mutateIntakeDocument<T>(
  lease: LocalInputLease,
  subject: string,
  mutate: (
    document: IntakeDocument,
    now: number,
    dirty: boolean,
  ) => { document: IntakeDocument; result: T; write: boolean },
): Promise<T> {
  let completed = false;
  let result!: T;
  await runLocalInputWrite(lease, async () => {
    const now = Date.now();
    const parsed = parseIntakeDocument(await readIntakeRaw(subject), now);
    const next = mutate(parsed.document, now, parsed.dirty);
    if (next.write) await writeIntakeDocument(subject, next.document);
    result = next.result;
    completed = true;
  });
  if (!completed) throw new Error("Intake mutation did not complete");
  return result;
}
