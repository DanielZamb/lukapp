import type { NotificationIntakeNative, NativeStatus, UnsupportedStatus, NativeCapture } from "../../../modules/notification-intake";
import { changedFields, intakeKey } from "../../../../../src/notificationIntake/policy";
import type { CandidateConfirmResult } from "../../../../../src/notificationIntake/types";
import { finishIntakeWipe, type WipeStore } from "./control";
import type { LocalInputLease } from "../../local-auth/localInput";
import { parseIntakeDocument, type IntakeCandidate, type StoredSuggestion } from "./candidates";
import { commandFor, commandSchema, emptyState, ingest, mappingSchema, outcomeSchema, parseState, projectCandidate, prune,
  reviewSchema, serializeState, terminal, type ActiveCandidate, type CandidateState, type SourceMapping } from "./durableState";

export type IntakeDependencies = {
  native: NotificationIntakeNative;
  isCurrent(): boolean;
  onWiped?(): void;
  subject: string;
  lease: LocalInputLease;
  hash(value: string): Promise<string>;
  ownerScope(): Promise<string>;
  newMutationId(): string;
  now(): number;
  validateMapping(mapping: Pick<SourceMapping, "workspaceId" | "financialAccountProfileId" | "currency"> & Partial<Pick<SourceMapping, "timeZone">>): Promise<boolean>;
  readLegacy(): Promise<unknown>;
  deleteLegacy(): Promise<void>;
  deleteNotices(): Promise<void>;
  wipeStore: WipeStore;
};
export type IntakeSnapshot = { state: CandidateState; status: NativeStatus | UnsupportedStatus | null; error: string; loaded: boolean; wipePending: boolean; drain: { unresolved: number; conflicts: number } | null };
export class IntakeService {
  private generation = 0;
  private active = true;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snapshot: IntakeSnapshot = { state: emptyState(), status: null, error: "", loaded: false, wipePending: false, drain: null };
  constructor(private readonly deps: IntakeDependencies) {
    if (deps.lease.subject !== deps.subject) throw new Error("OWNER_MISMATCH");
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  assertAdmitted() { this.check(this.generation); }
  stop() { this.active = false; this.generation += 1; }
  private check(generation: number) {
    if (!this.active || !this.deps.isCurrent() || generation !== this.generation || this.deps.lease.subject !== this.deps.subject)
      throw new Error("Intake admission ended");
  }
  private async wait<T>(promise: Promise<T>, generation: number): Promise<T> {
    const result = await promise;
    this.check(generation);
    return result;
  }
  private publish(state: CandidateState, status = this.snapshot.status) {
    this.snapshot = { state, status, error: "", loaded: true, wipePending: this.snapshot.wipePending, drain: this.snapshot.drain };
    for (const listener of this.listeners) listener();
  }
  private enqueue<T>(operation: (generation: number) => Promise<T>, recovery = false): Promise<T> {
    const generation = this.generation;
    const run = this.queue.then(async () => {
      this.check(generation);
      if (!recovery && (this.snapshot.wipePending || await this.wait(this.deps.wipeStore.read(), generation)))
        throw new Error("Intake wipe must finish before other work");
      return operation(generation);
    });
    this.queue = run.catch(() => {});
    return run;
  }
  private async supported(generation: number) {
    const status = await this.wait(this.deps.native.getStatus(), generation);
    this.snapshot = { ...this.snapshot, status };
    if (!("epoch" in status)) { this.publish(emptyState(), status); throw new Error("UNSUPPORTED"); }
    return status;
  }
  private async atomic(operation: () => Promise<unknown>, generation: number) {
    this.check(generation);
    await this.wait(this.deps.lease.run(async () => { this.check(generation); await operation(); }), generation);
  }
  private async load(generation: number) {
    const status = await this.supported(generation);
    const ownerScope = await this.wait(this.deps.ownerScope(), generation);
    const stored = await this.wait(this.deps.native.readCandidateState({ expectedEpoch: status.epoch, ownerScope }), generation);
    if (stored.value === null && stored.revision !== 0) throw new Error("CORRUPT_STATE");
    return { status, ownerScope, stored, state: prune(parseState(stored.value), this.deps.now()) };
  }
  private async change<T>(generation: number, reduce: (state: CandidateState) => { state: CandidateState; result: T }) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const loaded = await this.load(generation);
      const next = reduce(loaded.state);
      const value = serializeState(next.state);
      if (next.state === loaded.state && value === loaded.stored.value) {
        this.publish(loaded.state, loaded.status);
        return next.result;
      }
      try {
        await this.atomic(() => this.deps.native.writeCandidateState({ expectedEpoch: loaded.status.epoch,
          expectedRevision: loaded.stored.revision, ownerScope: loaded.ownerScope, value }), generation);
      } catch (error) {
        this.check(generation);
        const saved = await this.wait(this.deps.native.readCandidateState({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope }), generation);
        if (saved.epoch === loaded.status.epoch && saved.revision === loaded.stored.revision + 1 && saved.value === value) {
          this.publish(next.state, loaded.status);
          return next.result;
        }
        if (error !== null && typeof error === "object" && "code" in error && error.code === "REVISION_MISMATCH") continue;
        throw error;
      }
      this.publish(next.state, loaded.status);
      return next.result;
    }
    throw new Error("REVISION_MISMATCH");
  }
  private async migrate(generation: number) {
    const loaded = await this.load(generation);
    if (loaded.stored.revision > 0) {
      const proof = loaded.state.legacyMigration;
      if (proof || loaded.state.records.some((row) => row.kind === "terminal" || row.origin.kind === "legacy")) {
        const raw = await this.wait(this.deps.readLegacy(), generation);
        if (raw !== null) {
          const legacy = parseIntakeDocument(raw, this.deps.now()).document;
          if (proof) {
            const digest = await this.wait(this.deps.hash(JSON.stringify(raw)), generation);
            if (digest !== proof.digest) throw new Error("Legacy input changed after migration");
          } else {
            if (legacy.candidates.length > loaded.state.records.length) return;
            for (const candidate of legacy.candidates) {
              const saved = loaded.state.records.find((row) => row.id === candidate.id);
              if (!saved || saved.expiresAt !== candidate.expiresAt || saved.digest !== await this.wait(this.deps.hash(JSON.stringify(candidate)), generation)) return;
            }
          }
          await this.atomic(this.deps.deleteLegacy, generation);
        }
      }
      return;
    }
    const raw = await this.wait(this.deps.readLegacy(), generation);
    if (raw === null) return;
    const legacy = parseIntakeDocument(raw, this.deps.now()).document;
    const state = emptyState();
    state.legacyMigration = { digest: await this.wait(this.deps.hash(JSON.stringify(raw)), generation) };
    for (const candidate of legacy.candidates) {
      const row: ActiveCandidate = { kind: "active", id: candidate.id,
        digest: await this.wait(this.deps.hash(JSON.stringify(candidate)), generation), recordRevision: 0,
        createdAt: candidate.createdAt, expiresAt: candidate.expiresAt, workspaceId: candidate.workspaceId, currency: candidate.currency,
        origin: { kind: "legacy" }, originalSuggestion: { ...candidate.suggestion, currency: candidate.currency }, review: candidate.suggestion, reviewAmountText: null,
        parserVersion: candidate.parserVersion, consentVersion: candidate.consentVersion,
        status: { kind: "review", currencyReviewed: true, ...(candidate.error ? { error: candidate.error } : {}) } };
      state.records.push(row);
    }
    const value = serializeState(state);
    await this.atomic(() => this.deps.native.writeCandidateState({ expectedEpoch: loaded.status.epoch,
      expectedRevision: 0, ownerScope: loaded.ownerScope, value }), generation);
    const saved = await this.wait(this.deps.native.readCandidateState({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope }), generation);
    if (saved.revision !== 1 || saved.value !== value) throw new Error("Migration readback differs");
    await this.atomic(this.deps.deleteLegacy, generation);
  }
  refresh = () => this.enqueue(async (generation) => {
    try {
      if (this.snapshot.wipePending || await this.wait(this.deps.wipeStore.read(), generation)) {
        await this.wipe(generation);
        return { saved: 0, unresolved: 0, conflicts: 0 };
      }
      await this.migrate(generation);
      await this.applyOutcomes(generation);
      let cursor: string | undefined;
      const seen = new Set<string>();
      const report = { saved: 0, unresolved: 0, conflicts: 0 };
      do {
        const loaded = await this.load(generation);
        const page = await this.wait(this.deps.native.listPending({ expectedEpoch: loaded.status.epoch, cursor, limit: 50 }), generation);
        const ready: Array<{ capture: NativeCapture; mapping: SourceMapping; digest: string }> = [];
        for (const capture of page.captures) {
          const mapping = loaded.state.mappings.find((m) => m.sourceSelectionId === capture.sourceSelectionId);
          if (!mapping || !await this.wait(this.deps.validateMapping(mapping), generation)) { report.unresolved += 1; continue; }
          if (capture.expiresAt <= this.deps.now()) continue;
          ready.push({ capture, mapping, digest: await this.wait(this.deps.hash(JSON.stringify(capture)), generation) });
        }
        if (ready.length) {
          const ids = await this.change(generation, (state) => {
            let next = state;
            const ids: string[] = [];
            for (const item of ready) {
              const prior = next.records.find((r) => r.id === item.capture.captureId);
              if (prior && prior.digest !== item.digest) continue;
              next = ingest(next, item.capture, item.mapping, item.digest);
              ids.push(item.capture.captureId);
            }
            return { state: next, result: ids };
          });
          report.saved += ids.length;
          report.conflicts += ready.length - ids.length;
          if (ids.length) await this.atomic(() => this.deps.native.acknowledge({ expectedEpoch: page.epoch, captureIds: ids }), generation);
        }
        if (page.nextCursor !== null && seen.has(page.nextCursor)) throw new Error("Repeated native cursor");
        if (page.nextCursor !== null) seen.add(page.nextCursor);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      const loaded = await this.load(generation);
      this.snapshot = { ...this.snapshot, drain: { unresolved: report.unresolved, conflicts: report.conflicts } };
      this.publish(loaded.state, loaded.status);
      return report;
    } catch (error) {
      if (this.active && this.deps.isCurrent() && generation === this.generation) {
        this.snapshot = { ...this.snapshot, loaded: true, error: error instanceof Error ? error.message : "Intake unavailable" };
        for (const listener of this.listeners) listener();
      }
      throw error;
    }
  }, true);
  private activeRow(state: CandidateState, id: string, revision?: number) {
    const row = state.records.find((r) => r.id === id);
    if (!row || row.kind !== "active") throw new Error("Candidate unavailable");
    if (revision !== undefined && row.recordRevision !== revision) throw new Error("RECORD_REVISION_MISMATCH");
    return row;
  }
  read(id: string) { return this.snapshot.state.records.find((r): r is ActiveCandidate => r.id === id && r.kind === "active" && r.expiresAt > this.deps.now()) ?? null; }
  candidates(): IntakeCandidate[] { return this.snapshot.state.records.flatMap((r) => r.kind === "active" && r.expiresAt > this.deps.now() ? [projectCandidate(r)] : []); }
  updateReview(id: string, revision: number, review: StoredSuggestion, options: { currencyReviewed?: boolean; amountText?: string } = {}) {
    const parsed = reviewSchema.parse(review);
    const known = this.snapshot.state.records.find((row) => row.id === id);
    const edited = (row: ActiveCandidate): ActiveCandidate => {
      if (row.status.kind !== "review") throw new Error("Confirmation frozen");
      const currencyReviewed = row.status.currencyReviewed || options.currencyReviewed === true;
      return { ...row, review: parsed, reviewAmountText: options.amountText ?? row.reviewAmountText, recordRevision: row.recordRevision + 1,
        status: { kind: "review", currencyReviewed, ...(!currencyReviewed ? { error: "Review unresolved currency" } : {}) } };
    };
    return this.enqueue((generation) => this.change(generation, (state) => {
      const row = this.activeRow(state, id);
      if (row.recordRevision !== revision) {
        if (known?.kind === "active" && known.recordRevision === revision && known.status.kind === "review" &&
            JSON.stringify(row) === JSON.stringify(edited(known))) return { state, result: row.recordRevision };
        throw new Error("RECORD_REVISION_MISMATCH");
      }
      const next = edited(row);
      if (JSON.stringify(row) === JSON.stringify({ ...next, recordRevision: row.recordRevision })) return { state, result: row.recordRevision };
      return { state: { ...state, records: state.records.map((r) => r.id === id ? next : r) }, result: next.recordRevision };
    }));
  }
  deleteCandidate(id: string, revision: number) {
    return this.enqueue((generation) => this.change(generation, (state) => {
      const row = this.activeRow(state, id, revision);
      if (row.status.kind !== "review") throw new Error("Confirmation frozen");
      return { state: { ...state, records: state.records.map((r) => r.id === id ? terminal(row, "deleted") : r) }, result: undefined };
    }));
  }
  beginConfirmation(id: string, revision: number) {
    return this.enqueue(async (generation) => {
      const loaded = await this.load(generation);
      const current = this.activeRow(loaded.state, id);
      if (current.status.kind === "review" && !await this.wait(this.deps.validateMapping({
        workspaceId: current.workspaceId, financialAccountProfileId: current.review.financialAccountProfileId, currency: current.currency,
        ...(current.origin.kind === "native" ? { timeZone: current.origin.mapping.timeZone } : {}),
      }), generation)) throw new Error("Candidate account mapping is unavailable");
      return this.change(generation, (state) => {
      const row = this.activeRow(state, id);
      if (row.status.kind !== "review") return { state, result: row.status.command };
      if (row.recordRevision !== revision) throw new Error("RECORD_REVISION_MISMATCH");
      if (!row.status.currencyReviewed) throw new Error("Review unresolved currency");
      if (row.origin.kind === "native" && row.currency !== row.origin.mapping.currency) throw new Error("Unsupported workspace currency");
      const command = commandSchema.parse(commandFor(row));
      const next: ActiveCandidate = { ...row, recordRevision: revision + 1, status: { kind: "submitting", command, startedAt: this.deps.now() } };
      return { state: { ...state, records: state.records.map((r) => r.id === id ? next : r) }, result: command };
    }); });
  }
  recordOutcomes(results: CandidateConfirmResult[]) {
    const outcomes = results.map((r) => outcomeSchema.parse(r));
    return this.enqueue((generation) => this.change(generation, (state) => {
      if (new Set(outcomes.map((o) => o.candidateId)).size !== outcomes.length) throw new Error("Duplicate outcome");
      if (outcomes.some((o) => !state.records.some((r) => r.id === o.candidateId))) throw new Error("Unknown outcome candidate");
      return ({
      state: { ...state, records: state.records.map((row) => {
        const outcome = outcomes.find((r) => r.candidateId === row.id);
        if (!outcome || row.kind === "terminal") return row;
        if (row.status.kind === "review") throw new Error("No frozen command");
        if (outcome.ok) {
          const command = row.status.command;
          const { receipt, posted } = outcome.result;
          if (receipt.workspaceId !== command.workspaceId || receipt.idempotencyKey !== intakeKey(row.id) ||
              receipt.journalEntryId !== posted.id || changedFields(receipt.suggestion, command.suggestion).length ||
              JSON.stringify(receipt.changedFields) !== JSON.stringify(changedFields(command.suggestion, command.confirmed)) ||
              receipt.parserVersion !== command.parserVersion || receipt.consentVersion !== command.consentVersion ||
              posted.amount.currency !== command.confirmed.amount.currency || posted.amount.minorUnits !== command.confirmed.amount.minorUnits ||
              posted.description !== command.confirmed.description.trim()) throw new Error("OUTCOME_MISMATCH");
        }
        if (row.status.kind === "outcome") {
          const prior = row.status.outcome;
          if (prior.ok !== outcome.ok || (!prior.ok && !outcome.ok && prior.error !== outcome.error) ||
              (prior.ok && outcome.ok && JSON.stringify(prior.result.receipt) !== JSON.stringify(outcome.result.receipt)))
            throw new Error("OUTCOME_CONFLICT");
          return row;
        }
        return { ...row, recordRevision: row.recordRevision + 1,
          status: { kind: "outcome", command: row.status.command, outcome, receivedAt: this.deps.now() } } satisfies ActiveCandidate;
      }) }, result: undefined,
    }); }));
  }
  private applyOutcomes(generation: number) {
    return this.change(generation, (state) => ({ state: { ...state, records: state.records.map((row) => {
      if (row.kind !== "active" || row.status.kind !== "outcome") return row;
      if (row.status.outcome.ok) return terminal(row, "confirmed");
      return { ...row, recordRevision: row.recordRevision + 1,
        status: { kind: "review", currencyReviewed: true, error: row.status.outcome.error } } satisfies ActiveCandidate;
    }) }, result: undefined }));
  }
  applyRecordedOutcomes() { return this.enqueue((generation) => this.applyOutcomes(generation)); }
  configure(mappings: SourceMapping[], consentVersion: string) {
    return this.enqueue(async (generation) => {
      const selections = mappings.map((m) => mappingSchema.parse(m));
      if (selections.length > 16) throw new Error("CAPACITY_EXCEEDED");
      if (new Set(selections.map((m) => m.packageName)).size !== selections.length) throw new Error("Duplicate source package");
      for (const mapping of selections) if (!await this.wait(this.deps.validateMapping(mapping), generation)) throw new Error("Mapping unavailable");
      const loaded = await this.load(generation);
      if (loaded.state.pendingConfigure) throw new Error("Retry pending configuration first");
      const command = { expectedEpoch: loaded.status.epoch, mutationId: this.deps.newMutationId(), consentVersion,
        sources: selections.map(({ packageName, sourceSelectionId }) => ({ packageName, sourceSelectionId })) };
      await this.change(generation, (state) => {
        for (const mapping of selections) {
          const existing = state.mappings.find((m) => m.sourceSelectionId === mapping.sourceSelectionId);
          if (existing && (!state.activeSelectionIds.includes(mapping.sourceSelectionId) || JSON.stringify(existing) !== JSON.stringify(mapping)))
            throw new Error("Source selection requires a new id");
        }
        const additions = selections.filter((m) => !state.mappings.some((old) => old.sourceSelectionId === m.sourceSelectionId));
        return { state: { ...state, mappings: [...state.mappings, ...additions], pendingConfigure: command }, result: undefined };
      });
      await this.configurePending(generation);
    });
  }
  private async configurePending(generation: number) {
    const loaded = await this.load(generation);
    const command = loaded.state.pendingConfigure;
    if (!command) return;
    for (const source of command.sources) {
      const mapping = loaded.state.mappings.find((mapping) => mapping.sourceSelectionId === source.sourceSelectionId);
      if (!mapping || mapping.packageName !== source.packageName || !await this.wait(this.deps.validateMapping(mapping), generation))
        throw new Error("Mapping unavailable");
    }
    await this.atomic(() => this.deps.native.configure(command), generation);
    await this.change(generation, (state) => {
      if (state.pendingConfigure?.mutationId !== command.mutationId) throw new Error("Configuration changed");
      return { state: { ...state, activeSelectionIds: command.sources.map((s) => s.sourceSelectionId), pendingConfigure: null }, result: undefined };
    });
  }
  retryConfigure() { return this.enqueue((generation) => this.configurePending(generation)); }
  listDiagnostics() { return this.enqueue(async (generation) => {
    const loaded = await this.load(generation);
    return this.wait(this.deps.native.listDiagnostics({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope }), generation);
  }); }
  readDiagnostic(id: string) { return this.enqueue(async (generation) => {
    const loaded = await this.load(generation);
    return this.wait(this.deps.native.readDiagnostic({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope, id }), generation);
  }); }
  deleteDiagnostic(id: string) { return this.enqueue(async (generation) => {
    const loaded = await this.load(generation);
    await this.atomic(() => this.deps.native.deleteDiagnostic({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope, id }), generation);
  }); }
  clearDiagnostics() { return this.enqueue(async (generation) => {
    const loaded = await this.load(generation);
    await this.atomic(() => this.deps.native.clearDiagnostics({ expectedEpoch: loaded.status.epoch, ownerScope: loaded.ownerScope }), generation);
  }); }
  listSources() { return this.enqueue((generation) => this.wait(this.deps.native.listSources(), generation)); }
  openAccessSettings() { return this.enqueue((generation) => this.wait(this.deps.native.openAccessSettings(), generation)); }
  retryConnection() { return this.enqueue(async (generation) => { const status = await this.supported(generation);
    await this.atomic(() => this.deps.native.retryConnection({ expectedEpoch: status.epoch }), generation);
    this.publish(this.snapshot.state, await this.supported(generation)); }); }
  dismissNotices(noticeIds: string[]) { return this.enqueue(async (generation) => { const status = await this.supported(generation);
    await this.atomic(() => this.deps.native.dismissNotices({ expectedEpoch: status.epoch, noticeIds }), generation);
    this.publish(this.snapshot.state, await this.supported(generation)); }); }
  private async wipe(generation: number) {
    this.snapshot = { ...this.snapshot, wipePending: true };
    for (const listener of this.listeners) listener();
    await finishIntakeWipe({ ...this.deps, store: this.deps.wipeStore,
      read: <T>(promise: Promise<T>) => this.wait(promise, generation),
      write: (operation) => this.atomic(operation, generation),
    });
    this.stop();
    this.snapshot = { ...this.snapshot, wipePending: false, drain: null };
    this.publish(emptyState(), null);
    this.deps.onWiped?.();
  }
  disableAndWipe() { return this.enqueue((generation) => this.wipe(generation), true); }
  retryPendingControl() { return this.enqueue(async (generation) => {
    if (this.snapshot.wipePending || await this.wait(this.deps.wipeStore.read(), generation)) await this.wipe(generation);
    else await this.configurePending(generation);
  }, true); }
}
