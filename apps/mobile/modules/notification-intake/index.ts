import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { z } from "zod";

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
const id = z.string().regex(/^[!-~]{1,64}$/);
const packageName = z.string().max(255).regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/);
const epoch = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ownerScope = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const expectedEpoch = z.object({ expectedEpoch: epoch }).strict();
const mutation = expectedEpoch.extend({ mutationId: z.uuid() });
const controlResult = z.object({ epoch, changeSequence: integer }).strict();
const revisionResult = z.object({ epoch, revision: integer }).strict();
export const nativeCaptureSchema = z.object({
  captureId: id,
  sourceSelectionId: id,
  capturedAt: integer,
  expiresAt: integer,
  notificationAt: integer,
  direction: z.enum(["in", "out"]).nullable(),
  amountMinorUnits: integer.positive().nullable(),
  currency: z.enum(["COP", "USD"]).nullable(),
  description: z.string().refine((s) => utf8Bytes(s) <= 256),
  parserVersion: id,
  consentVersion: id,
  // The notification's title and body, kept under notification-disclosure@3 (API v3). Older captures have none.
  text: z.string().refine((s) => utf8Bytes(s) <= 640).default(""),
}).strict().refine((v) => v.expiresAt === v.capturedAt + 1_296_000_000);
export type NativeCapture = z.infer<typeof nativeCaptureSchema>;
const diagnosticHealthSchema = z.object({
  enabled: z.boolean(), state: z.enum(["disabled", "healthy", "corrupt", "key_unavailable", "storage_error"]),
  recordCount: integer.max(32), byteCount: integer.max(4_194_304), overflowCount: integer, errorCount: integer,
}).strict();
const diagnosticSummarySchema = z.object({
  id, captureId: id, sourceSelectionId: id, packageName, notificationAt: integer, capturedAt: integer, expiresAt: integer,
  parser: z.object({ outcome: z.enum(["pending", "discarded", "normalized", "needs_review"]), reasons: z.array(z.string()) }).strict(),
}).strict();
const diagnosticListSchema = z.object({ health: diagnosticHealthSchema, records: z.array(diagnosticSummarySchema).max(32) }).strict();
const diagnosticRecordSchema = diagnosticSummarySchema.extend({ snapshot: z.record(z.string(), z.unknown()) }).strict();
export type DiagnosticList = z.infer<typeof diagnosticListSchema>;
export type DiagnosticRecord = z.infer<typeof diagnosticRecordSchema>;
export const nativeStatusSchema = z.object({
  schemaVersion: z.literal(2), epoch, enabled: z.boolean(),
  access: z.enum(["granted", "not_granted"]),
  connection: z.enum(["connected", "disconnected", "unknown"]),
  changeSequence: integer, pendingCount: integer.max(512),
  gap: z.object({ since: integer, reason: z.enum(["overflow", "storage", "recovery"]), rejectedCount: integer }).strict().nullable(),
  lastConnectedAt: integer.nullable(), checkedAt: integer,
  notices: z.array(z.object({ id, kind: z.enum(["security", "ambiguous", "no_amount", "multiple_amounts", "overflow", "conflict"]), count: integer, firstAt: integer, lastAt: integer }).strict()).max(64),
  storageState: z.enum(["healthy", "corrupt", "key_unavailable"]),
  /** The disclosure the current sources were saved under ("" before any setup). API v3. */
  consentVersion: z.string().max(64).optional(),
  diagnostics: diagnosticHealthSchema.nullable().optional(),
}).strict();
export type NativeStatus = z.infer<typeof nativeStatusSchema>;
export type IntakeEpoch = string;
export type CandidateRevision = number;
export type CaptureCursor = string;
export type MutationId = string;
export type NotificationIntakeErrorCode = "EPOCH_MISMATCH" | "REVISION_MISMATCH" | "OWNER_MISMATCH" | "CAPACITY_EXCEEDED" | "CORRUPT_STATE" | "INVALID_INPUT" | "UNSUPPORTED";
export type UnsupportedStatus = { supported: false; reason: "platform" | "native_module_missing" | "native_api_incompatible" };
const configureSchema = mutation.extend({
  consentVersion: id,
  sources: z.array(z.object({ packageName, sourceSelectionId: id }).strict()).max(16),
}).strict();
const listSchema = expectedEpoch.extend({ cursor: z.string().max(512).optional(), limit: integer.min(1).max(50) }).strict();
const acknowledgeSchema = expectedEpoch.extend({ captureIds: z.array(id).min(1).max(50) }).strict();
const readSchema = expectedEpoch.extend({ ownerScope }).strict();
const writeSchema = readSchema.extend({ expectedRevision: integer, value: z.string().refine((s) => {
  if (utf8Bytes(s) > 1_048_576) return false;
  try { const v: unknown = JSON.parse(s); return typeof v === "object" && v !== null && !Array.isArray(v); } catch { return false; }
}) }).strict();
const dismissSchema = expectedEpoch.extend({ noticeIds: z.array(id).max(64) }).strict();
const iconRequestSchema = z.object({ packageNames: z.array(packageName).max(64), size: z.number().int().min(16).max(96) }).strict();
// A 96 dp icon at density 3 is a 288 px PNG, comfortably under this cap.
const iconSchema = z.record(z.string(), z.string().min(1).max(400_000).regex(/^[A-Za-z0-9+/]+={0,2}$/));
const hintSchema = z.object({ epoch, changeSequence: integer, kind: z.enum(["capture", "queue", "notice", "control", "health"]) }).strict();

interface NativeBridge {
  readonly apiVersion: number;
  readonly diagnosticsEnabled?: boolean;
  listDiagnostics?(input: z.infer<typeof readSchema>): Promise<unknown>;
  readDiagnostic?(input: z.infer<typeof readSchema> & { id: string }): Promise<unknown>;
  deleteDiagnostic?(input: z.infer<typeof readSchema> & { id: string }): Promise<unknown>;
  clearDiagnostics?(input: z.infer<typeof readSchema>): Promise<unknown>;
  getStatus(): Promise<unknown>;
  listSources(): Promise<unknown>;
  openAccessSettings(): Promise<void>;
  configure(input: z.infer<typeof configureSchema>): Promise<unknown>;
  listPending(input: z.infer<typeof listSchema>): Promise<unknown>;
  acknowledge(input: z.infer<typeof acknowledgeSchema>): Promise<unknown>;
  readCandidateState(input: z.infer<typeof readSchema>): Promise<unknown>;
  writeCandidateState(input: z.infer<typeof writeSchema>): Promise<unknown>;
  retryConnection(input: z.infer<typeof expectedEpoch>): Promise<unknown>;
  disableAndWipe(input: z.infer<typeof mutation>): Promise<unknown>;
  dismissNotices(input: z.infer<typeof dismissSchema>): Promise<void>;
  /** Added after API v3 without a version bump; older binaries lack it. */
  listSourceIcons?(input: z.infer<typeof iconRequestSchema>): Promise<unknown>;
  addListener(event: "onChange", callback: (hint: unknown) => void): { remove(): void };
}
export const NATIVE_API_VERSION = 3;
const native = Platform.OS === "android" ? requireOptionalNativeModule<NativeBridge>("NotificationIntake") : null;
function required(): NativeBridge {
  if (!native) throw Object.assign(new Error("Android custom native notification intake binary required"), { code: "UNSUPPORTED" });
  if (native.apiVersion !== NATIVE_API_VERSION) throw Object.assign(new Error(`Notification intake API v${NATIVE_API_VERSION} APK required`), { code: "UNSUPPORTED" });
  return native;
}
function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error("Invalid notification intake input"), { code: "INVALID_INPUT" });
  return result.data;
}
function diagnosticNative() {
  const bridge = required();
  if (bridge.diagnosticsEnabled !== true || !bridge.listDiagnostics || !bridge.readDiagnostic || !bridge.deleteDiagnostic || !bridge.clearDiagnostics)
    throw Object.assign(new Error("Raw arrival diagnostics require an authorized native dev or beta build"), { code: "UNSUPPORTED" });
  return { list: bridge.listDiagnostics.bind(bridge), read: bridge.readDiagnostic.bind(bridge), delete: bridge.deleteDiagnostic.bind(bridge), clear: bridge.clearDiagnostics.bind(bridge) };
}
export const notificationIntake = {
  async listDiagnostics(input: z.infer<typeof readSchema>) {
    return diagnosticListSchema.parse(await diagnosticNative().list(parseInput(readSchema, input)));
  },
  async readDiagnostic(input: z.infer<typeof readSchema> & { id: string }) {
    return diagnosticRecordSchema.nullable().parse(await diagnosticNative().read(parseInput(readSchema.extend({ id }).strict(), input)));
  },
  async deleteDiagnostic(input: z.infer<typeof readSchema> & { id: string }) {
    await diagnosticNative().delete(parseInput(readSchema.extend({ id }).strict(), input));
  },
  async clearDiagnostics(input: z.infer<typeof readSchema>) {
    await diagnosticNative().clear(parseInput(readSchema, input));
  },
  async getStatus(): Promise<NativeStatus | UnsupportedStatus> {
    if (!native) return { supported: false, reason: Platform.OS === "android" ? "native_module_missing" : "platform" };
    if (native.apiVersion !== NATIVE_API_VERSION) return { supported: false, reason: "native_api_incompatible" };
    return nativeStatusSchema.parse(await native.getStatus());
  },
  async listSources() { return z.array(z.object({ packageName, label: z.string() }).strict()).parse(await required().listSources()); },
  async openAccessSettings() { await required().openAccessSettings(); },
  async configure(input: z.infer<typeof configureSchema>) { return controlResult.parse(await required().configure(parseInput(configureSchema, input))); },
  async listPending(input: z.infer<typeof listSchema>) {
    const { cursor, ...page } = parseInput(listSchema, input);
    return z.object({ epoch, captures: z.array(nativeCaptureSchema).max(50), nextCursor: z.string().nullable() }).strict()
      .parse(await required().listPending(cursor === undefined ? page : { ...page, cursor }));
  },
  async acknowledge(input: z.infer<typeof acknowledgeSchema>) {
    return z.array(z.object({ captureId: id, outcome: z.enum(["acknowledged", "already_acknowledged", "not_found_or_expired"]) }).strict()).max(50)
      .parse(await required().acknowledge(parseInput(acknowledgeSchema, input)));
  },
  async readCandidateState(input: z.infer<typeof readSchema>) {
    return revisionResult.extend({ value: z.string().nullable() }).parse(await required().readCandidateState(parseInput(readSchema, input)));
  },
  async writeCandidateState(input: z.infer<typeof writeSchema>) { return revisionResult.parse(await required().writeCandidateState(parseInput(writeSchema, input))); },
  async retryConnection(input: z.infer<typeof expectedEpoch>) { return nativeStatusSchema.parse(await required().retryConnection(parseInput(expectedEpoch, input))); },
  async disableAndWipe(input: z.infer<typeof mutation>) { return z.object({ epoch }).strict().parse(await required().disableAndWipe(parseInput(mutation, input))); },
  async dismissNotices(input: z.infer<typeof dismissSchema>) { await required().dismissNotices(parseInput(dismissSchema, input)); },
  addChangeListener(callback: (hint: z.infer<typeof hintSchema>) => void) {
    return required().addListener("onChange", (hint) => callback(hintSchema.parse(hint)));
  },
};
export type NotificationIntakeNative = typeof notificationIntake;

/** App logos for the sources list, as base64 PNG by package name. Empty when the binary can't draw them. */
export const sourceIcons = {
  async list(input: z.infer<typeof iconRequestSchema>): Promise<Record<string, string>> {
    const request = parseInput(iconRequestSchema, input);
    if (!native || native.apiVersion !== NATIVE_API_VERSION || typeof native.listSourceIcons !== "function" || !request.packageNames.length) return {};
    const icons = iconSchema.parse(await native.listSourceIcons(request));
    return Object.fromEntries(request.packageNames.flatMap((name) => icons[name] ? [[name, icons[name]]] : []));
  },
};
