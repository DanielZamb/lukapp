import { z } from "zod";
import { nativeCaptureSchema, type NativeCapture } from "../../../modules/notification-intake";
import { calendarDate } from "../timeZones";
import type { IntakeCandidate } from "./candidates";
import { suggest } from "./suggest";

/** Parser version recorded for candidates suggested from the kept notification text. */
export const TEXT_SUGGESTION_VERSION = "suggest-v2";

/**
 * The starting values for a candidate. With the notification text, the
 * suggestion comes from suggest.ts; without it (older consent or older APK),
 * from the native parser's fields as before. A bare "$" takes the source
 * mapping's currency, since the person chose that currency for this app.
 */
export function suggestionFor(capture: NativeCapture, mapping: SourceMapping) {
  if (!capture.text) {
    return { direction: capture.direction, description: capture.description, amountMinorUnits: capture.amountMinorUnits,
      currency: capture.currency, parserVersion: capture.parserVersion };
  }
  const result = suggest({ text: capture.text });
  const amount = result.sensitive ? null : result.amount;
  return {
    direction: result.direction?.value ?? null,
    description: result.counterparty?.value ?? capture.description,
    amountMinorUnits: amount?.minor ?? null,
    currency: amount ? amount.currency ?? mapping.currency : null,
    parserVersion: TEXT_SUGGESTION_VERSION,
  };
}

const text = z.string().min(1).max(256);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z.enum(["COP", "USD"]);
export const reviewSchema = z.object({
  direction: z.enum(["in", "out"]).nullable(), description: z.string().max(1024),
  amountMinorUnits: integer.nullable(), accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  financialAccountProfileId: text, userCategoryIds: z.array(text).max(3),
  primaryUserCategoryId: text.nullable(),
}).strict();
const suggestionSchema = reviewSchema.omit({ amountMinorUnits: true }).extend({
  direction: z.enum(["in", "out"]),
  amount: z.object({ currency, minorUnits: integer.positive() }).strict(),
}).strict();
const confirmedSchema = suggestionSchema.extend({
  description: z.string().max(1024).refine((value) => value.trim().length > 0),
  accountingDate: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value),
});
const evidenceSchema = reviewSchema.omit({ amountMinorUnits: true }).extend({
  amount: z.object({ currency: currency.nullable(), minorUnits: integer.nullable() }).strict(),
}).strict();
const originalSchema = reviewSchema.extend({ currency: currency.nullable() }).strict();
export const commandSchema = z.object({
  workspaceId: text, candidateId: text, confirmed: suggestionSchema, suggestion: evidenceSchema,
  parserVersion: text, consentVersion: text,
}).strict();
const resultSchema = z.object({
  posted: z.object({ id: text, description: z.string(), amount: z.object({ currency: z.string(), minorUnits: z.number().int() }), replay: z.boolean() }),
  receipt: z.object({ id: text, workspaceId: text, journalEntryId: text, idempotencyKey: text,
    suggestion: evidenceSchema, changedFields: z.array(z.string()), parserVersion: text,
    consentVersion: text, actorId: text, confirmedAt: integer }), replay: z.boolean(),
});
export const outcomeSchema = z.discriminatedUnion("ok", [
  z.object({ candidateId: text, ok: z.literal(true), result: resultSchema }).strict(),
  z.object({ candidateId: text, ok: z.literal(false), error: z.string() }).strict(),
]);
export const mappingSchema = z.object({
  sourceSelectionId: z.string().regex(/^[!-~]{1,64}$/), packageName: z.string().max(255).regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/),
  workspaceId: text, financialAccountProfileId: text, currency,
  timeZone: text.refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }),
}).strict();
export type SourceMapping = z.infer<typeof mappingSchema>;
const identity = { id: text, digest: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: integer, recordRevision: integer };
const activeSchema = z.object({
  ...identity, kind: z.literal("active"), createdAt: integer, workspaceId: text, currency,
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("native"), capture: nativeCaptureSchema, mapping: mappingSchema, accountingDate: text }).strict(),
    z.object({ kind: z.literal("legacy") }).strict(),
  ]),
  originalSuggestion: originalSchema, review: reviewSchema, reviewAmountText: z.string().max(256).nullable().default(null),
  parserVersion: text, consentVersion: text,
  status: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("review"), error: z.string().optional(), currencyReviewed: z.boolean() }).strict(),
    z.object({ kind: z.literal("submitting"), command: commandSchema, startedAt: integer }).strict(),
    z.object({ kind: z.literal("outcome"), command: commandSchema, outcome: outcomeSchema, receivedAt: integer }).strict(),
  ]),
}).strict();
const terminalSchema = z.object({ ...identity, kind: z.literal("terminal"), reason: z.enum(["confirmed", "deleted"]) }).strict();
const configureSchema = z.object({
  expectedEpoch: z.string().regex(/^[A-Za-z0-9_-]{22}$/), mutationId: z.uuid(), consentVersion: z.string().regex(/^[!-~]{1,64}$/),
  sources: z.array(z.object({ packageName: text, sourceSelectionId: text }).strict()).max(16),
}).strict();
export const stateSchema = z.object({
  v: z.literal(3), records: z.array(z.discriminatedUnion("kind", [activeSchema, terminalSchema])).max(512),
  mappings: z.array(mappingSchema).max(64), activeSelectionIds: z.array(text).max(16),
  pendingConfigure: configureSchema.nullable(),
  legacyMigration: z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable().default(null),
}).strict().superRefine((state, ctx) => {
  for (const ids of [state.records.map((r) => r.id), state.mappings.map((m) => m.sourceSelectionId), state.activeSelectionIds]) {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate identity" });
  }
  if (state.activeSelectionIds.some((id) => !state.mappings.some((m) => m.sourceSelectionId === id)))
    ctx.addIssue({ code: "custom", message: "Missing active mapping" });
});
export type CandidateState = z.infer<typeof stateSchema>;
export type CandidateRecord = CandidateState["records"][number];
export type ActiveCandidate = z.infer<typeof activeSchema>;
export const emptyState = (): CandidateState => ({ v: 3, records: [], mappings: [], activeSelectionIds: [], pendingConfigure: null, legacyMigration: null });
export function utf8Bytes(value: string) {
  let size = 0;
  for (const c of value) { const n = c.codePointAt(0) ?? 0; size += n <= 127 ? 1 : n <= 2047 ? 2 : n <= 65535 ? 3 : 4; }
  return size;
}
export function serializeState(state: CandidateState) {
  if (state.records.length > 512 || state.mappings.length > 64 || state.activeSelectionIds.length > 16)
    throw new Error("CAPACITY_EXCEEDED");
  const value = JSON.stringify(stateSchema.parse(state));
  if (utf8Bytes(value) > 1_048_576) throw new Error("CAPACITY_EXCEEDED");
  return value;
}
export function parseState(value: string | null): CandidateState {
  if (value === null) return emptyState();
  const raw: unknown = JSON.parse(value);
  const version = z.object({ v: z.number() }).parse(raw).v;
  if (version === 2) {
    const old = z.object({ v: z.literal(2), records: z.array(z.unknown()) }).passthrough().parse(raw);
    const records = old.records.map((record) => {
      const row = z.object({ kind: z.enum(["active", "terminal"]) }).passthrough().parse(record);
      if (row.kind === "terminal") return record;
      const active = z.object({ currency, originalSuggestion: reviewSchema }).passthrough().parse(row);
      return { ...active, originalSuggestion: { ...active.originalSuggestion, currency: active.currency } };
    });
    return stateSchema.parse({ ...old, v: 3, records });
  }
  return stateSchema.parse(raw);
}
export function prune(state: CandidateState, now: number): CandidateState {
  return { ...state, records: state.records.filter((r) => r.expiresAt > now) };
}
export function ingest(state: CandidateState, capture: NativeCapture, mapping: SourceMapping, digest: string): CandidateState {
  const prior = state.records.find((r) => r.id === capture.captureId);
  if (prior) {
    if (prior.digest !== digest) throw new Error("CAPTURE_CONFLICT");
    return state;
  }
  const accountingDate = calendarDate(new Date(capture.notificationAt), mapping.timeZone);
  const { currency: suggestedCurrency, parserVersion, ...suggested } = suggestionFor(capture, mapping);
  const suggestion = { ...suggested, description: suggested.description.slice(0, 1024),
    accountingDate, financialAccountProfileId: mapping.financialAccountProfileId, userCategoryIds: [], primaryUserCategoryId: null };
  // Without a suggested amount there is no suggested currency to review yet.
  const currencyKnown = suggestedCurrency !== null || (!!capture.text && suggested.amountMinorUnits === null);
  const row: ActiveCandidate = {
    id: capture.captureId, digest, expiresAt: capture.expiresAt, createdAt: capture.capturedAt, recordRevision: 0,
    kind: "active", workspaceId: mapping.workspaceId, currency: suggestedCurrency ?? mapping.currency,
    origin: { kind: "native", capture, mapping, accountingDate }, originalSuggestion: { ...suggestion, currency: suggestedCurrency }, review: suggestion, reviewAmountText: null,
    parserVersion, consentVersion: capture.consentVersion,
    status: { kind: "review", currencyReviewed: currencyKnown,
      ...(currencyKnown ? {} : { error: "Review unresolved currency" }) },
  };
  const next = { ...state, records: [...state.records, row] };
  serializeState(next);
  return next;
}
export function terminal(row: ActiveCandidate, reason: "confirmed" | "deleted"): CandidateRecord {
  return { kind: "terminal", id: row.id, digest: row.digest, recordRevision: row.recordRevision + 1, expiresAt: row.expiresAt, reason };
}
/** The kept notification, for showing the person where a suggestion came from. Never part of a confirmation. */
export function notificationOf(row: ActiveCandidate): { text: string; packageName: string; at: number } | null {
  if (row.origin.kind !== "native") return null;
  return { text: row.origin.capture.text, packageName: row.origin.mapping.packageName, at: row.origin.capture.notificationAt };
}
export function projectCandidate(row: ActiveCandidate): IntakeCandidate {
  const notification = notificationOf(row);
  return { id: row.id, createdAt: row.createdAt, expiresAt: row.expiresAt, workspaceId: row.workspaceId, ...(notification ? { notification } : {}),
    currency: row.currency, suggestion: row.review, reviewAmountText: row.reviewAmountText, parserVersion: row.parserVersion, consentVersion: row.consentVersion,
    ...(row.status.kind === "review" ? (row.status.error ? { error: row.status.error } : {}) : { error: "Confirmation pending. Open to retry." }) };
}
export function evidenceFor(row: ActiveCandidate) {
  const { amountMinorUnits, currency, ...rest } = row.originalSuggestion;
  return { ...rest, amount: { currency, minorUnits: amountMinorUnits } };
}
export function commandFor(row: ActiveCandidate) {
  const { amountMinorUnits, ...review } = row.review;
  return commandSchema.parse({ workspaceId: row.workspaceId, candidateId: row.id,
    confirmed: confirmedSchema.parse({ ...review, amount: { currency: row.currency, minorUnits: amountMinorUnits } }),
    suggestion: evidenceFor(row), parserVersion: row.parserVersion, consentVersion: row.consentVersion });
}
