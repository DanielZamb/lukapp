import { createHash } from "node:crypto";
import { expect } from "vitest";
import { LocalInputLease } from "../../local-auth/localInput";
import type { NativeCapture, NativeStatus, NotificationIntakeNative } from "../../../modules/notification-intake";
import { emptyState, ingest, parseState, serializeState, terminal, utf8Bytes, type SourceMapping } from "./durableState";
import type { WipeIntent } from "./control";
import { IntakeService } from "./service";

export const now = 1_792_800_000_000;
export const mapping: SourceMapping = { sourceSelectionId: "selection-1", packageName: "app.bank", workspaceId: "workspace-1",
  financialAccountProfileId: "account-1", currency: "COP", timeZone: "America/Bogota" };
export const capture: NativeCapture = { captureId: "capture-1", sourceSelectionId: "selection-1", capturedAt: now - 100,
  expiresAt: now - 100 + 1_296_000_000, notificationAt: Date.parse("2026-10-24T02:00:00Z"), direction: "out",
  amountMinorUnits: 45000, currency: "COP", description: "Market", parserVersion: "generic-v1", consentVersion: "v1", text: "" };
export const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
export function fixture() {
  let epoch = "a".repeat(22);
  let revision = 1;
  let value: string | null = serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] });
  let legacy: unknown = null;
  let clock = now;
  let failWrite = false;
  let failAck = false;
  let conflictOnce = false;
  let wrongOwner = false;
  let ownerScope: string | null = null;
  let enabled = true;
  let beforeRead: (() => void) | null = null;
  let afterWrite: (() => void) | null = null;
  let afterReadback: (() => void) | null = null;
  let readCount = 0;
  let pages: Array<{ captures: NativeCapture[]; nextCursor: string | null }> = [{ captures: [capture], nextCursor: null }];
  const events: string[] = [];
  const status = (): NativeStatus => ({ schemaVersion: 2, epoch, enabled, access: "granted", connection: "connected",
    changeSequence: 1, pendingCount: 1, gap: null, lastConnectedAt: now, checkedAt: now, notices: [], storageState: "healthy", consentVersion: lastConfigure?.consentVersion ?? "" });
  let lastConfigure: Parameters<NotificationIntakeNative["configure"]>[0] | null = null;
  let configureLost = false;
  let mutationNumber = 0;
  let wipeIntent: WipeIntent | null = null;
  let wipeLost = false;
  let lastWipe: Parameters<NotificationIntakeNative["disableAndWipe"]>[0] | null = null;
  const native: NotificationIntakeNative = {
    listDiagnostics: async () => { throw Object.assign(new Error("UNSUPPORTED"), { code: "UNSUPPORTED" }); },
    readDiagnostic: async () => { throw Object.assign(new Error("UNSUPPORTED"), { code: "UNSUPPORTED" }); },
    deleteDiagnostic: async () => { throw Object.assign(new Error("UNSUPPORTED"), { code: "UNSUPPORTED" }); },
    clearDiagnostics: async () => { throw Object.assign(new Error("UNSUPPORTED"), { code: "UNSUPPORTED" }); },
    getStatus: async () => status(), listSources: async () => [{ packageName: "app.bank", label: "Bank" }],
    openAccessSettings: async () => {},
    configure: async (input) => {
      if (lastConfigure?.mutationId !== input.mutationId) {
        if (input.expectedEpoch !== epoch) throw Object.assign(new Error("epoch"), { code: "EPOCH_MISMATCH" });
        lastConfigure = input; epoch = "b".repeat(22); events.push("configure");
      } else expect(input).toEqual(lastConfigure);
      if (configureLost) { configureLost = false; throw new Error("timeout"); }
      return { epoch, changeSequence: 2 };
    },
    listPending: async (input) => {
      if (input.expectedEpoch !== epoch) throw Object.assign(new Error("epoch"), { code: "EPOCH_MISMATCH" });
      const page = pages[Number(input.cursor ?? "0")];
      if (!page) throw new Error("missing page");
      events.push(`page:${input.cursor ?? "0"}`);
      return { epoch, ...page };
    },
    acknowledge: async ({ expectedEpoch, captureIds }) => {
      if (expectedEpoch !== epoch) throw Object.assign(new Error("epoch"), { code: "EPOCH_MISMATCH" });
      events.push("ack");
      if (failAck) throw new Error("ack lost");
      return captureIds.map((captureId) => ({ captureId, outcome: "acknowledged" }));
    },
    readCandidateState: async (input) => {
      readCount += 1;
      beforeRead?.();
      if (wrongOwner || (ownerScope !== null && ownerScope !== input.ownerScope)) throw Object.assign(new Error("owner"), { code: "OWNER_MISMATCH" });
      ownerScope = input.ownerScope;
      const result = { epoch, revision, value };
      if (readCount === 2) afterReadback?.();
      return result;
    },
    writeCandidateState: async (input) => {
      events.push("write");
      if (failWrite) throw new Error("disk full");
      if (input.expectedEpoch !== epoch) throw Object.assign(new Error("epoch"), { code: "EPOCH_MISMATCH" });
      if (conflictOnce) { conflictOnce = false; revision += 1; throw Object.assign(new Error("revision"), { code: "REVISION_MISMATCH" }); }
      if (input.expectedRevision !== revision) throw Object.assign(new Error("revision"), { code: "REVISION_MISMATCH" });
      value = input.value; revision += 1; afterWrite?.(); return { epoch, revision };
    },
    retryConnection: async () => status(),
    disableAndWipe: async (input) => {
      if (lastWipe?.mutationId !== input.mutationId) {
        lastWipe = input; value = null; revision = 0; ownerScope = null; enabled = false; pages = [{ captures: [], nextCursor: null }]; epoch = "c".repeat(22); events.push("wipe");
      } else expect(input).toEqual(lastWipe);
      if (wipeLost) { wipeLost = false; throw new Error("wipe response lost"); }
      return { epoch };
    },
    dismissNotices: async () => { events.push("dismiss"); }, addChangeListener: () => ({ remove() {} }),
  };
  const lease = new LocalInputLease("owner", "session");
  const deps = { native, lease, isCurrent: () => true, subject: "owner", hash, ownerScope: async () => "o".repeat(43),
    newMutationId: () => `00000000-0000-4000-8000-${String(++mutationNumber).padStart(12, "0")}`, now: () => clock,
    validateMapping: async (): Promise<{ timeZone: string } | null> => ({ timeZone: mapping.timeZone }), readLegacy: async () => legacy,
    deleteLegacy: async () => { legacy = null; events.push("delete-legacy"); },
    deleteNotices: async () => {},
    wipeStore: { read: async () => wipeIntent, write: async (intent: WipeIntent) => { wipeIntent = intent; }, clear: async () => { wipeIntent = null; } },
  };
  return { native, deps, lease, events, service: new IntakeService(deps),
    state: () => parseState(value), raw: () => value, legacy: () => legacy,
    setPages: (next: typeof pages) => { pages = next; }, setValue: (next: string | null, rev = 1) => { value = next; revision = rev; },
    setLegacy: (next: unknown) => { legacy = next; }, setClock: (next: number) => { clock = next; },
    failWrite: () => { failWrite = true; }, allowWrite: () => { failWrite = false; },
    failAck: () => { failAck = true; }, conflict: () => { conflictOnce = true; },
    wrongOwner: () => { wrongOwner = true; }, beforeRead: (callback: () => void) => { beforeRead = callback; },
    afterWrite: (callback: () => void) => { afterWrite = callback; }, afterReadback: (callback: () => void) => { afterReadback = callback; },
    loseWipe: () => { wipeLost = true; }, wipeIntent: () => wipeIntent,
    loseConfigure: () => { configureLost = true; }, rotate: () => { epoch = "d".repeat(22); } };
}
