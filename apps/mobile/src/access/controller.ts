import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import { admitForeground, admissionFailure } from "../../../../src/access/admission";
import { proveDeviceRequest } from "../../../../src/access/client";
import type { NativeRequestHash, PrepareRequest } from "../../../../src/access/client";
import type { AccessOperation, NativeDeviceKey } from "../../../../src/access/protocol";
import type { Custody } from "./native";
import { ConvexError } from "convex/values";
import { recoveryRecord, revocationRecord } from "./lifecycle";
import type { ProviderObservation, RecoveryRecord, RevocationRecord, RevocationView } from "./lifecycle";

export interface Rpc {
  query<Q extends FunctionReference<"query", "public">>(reference: Q, args: FunctionArgs<Q>, guard?: () => void): Promise<FunctionReturnType<Q>>;
  mutation<M extends FunctionReference<"mutation", "public">>(reference: M, args: FunctionArgs<M>, guard?: () => void): Promise<FunctionReturnType<M>>;
  action<A extends FunctionReference<"action", "public">>(reference: A, args: FunctionArgs<A>, guard?: () => void): Promise<FunctionReturnType<A>>;
}
type Contact = { deviceId: Id<"mobileDevices">; generation: number; epoch: number };
export type AccessState =
  | { kind: "starting" | "signed-out" | "locked" | "checking" | "wiping" }
  | { kind: "blocked"; code: string }
  | { kind: "provisioning"; contact: Contact }
  | { kind: "ready"; contact: Contact; workspaceId: string };
export class StaleAccess extends Error {}
export interface UserAction {
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  execute: AccessController["execute"];
  cancel(): void;
}
export type ControllerCustody = Pick<Custody, "state" | "initialize" | "lock" | "touch" | "closeInput" | "unlock" | "resumeAdmission" |
  "hasRetainedCustody" | "readRecovery" | "writeRecovery" | "readRevocations" | "writeRevocation" | "enrollmentPending" | "setEnrollmentPending" |
  "openInput" | "beginWipe" | "erase" | "finishWipe">;

export class AccessController {
  private epoch = 0;
  private closed = false;
  private session: string | null = null;
  private observation: ProviderObservation = { kind: "loading" };
  private initialized = false;
  private signedOutCleanupAttempted = false;
  private beginningRecovery: Promise<void> | undefined;
  private revoking = new Map<string, Promise<void>>();
  private revocations: readonly RevocationView[] = [];
  private online = false;
  private scope: { kind: "discover" } | { kind: "saved"; workspaceId: string } = { kind: "discover" };
  private state: AccessState = { kind: "starting" };
  private listeners = new Set<() => void>();
  private wiping: Promise<void> | undefined;
  private cleanup: { kind: "clear" } | { kind: "required"; code: string } = { kind: "clear" };
  private securityGeneration: number | undefined;
  private activityContactAt = 0;
  private heartbeat: Promise<unknown> | undefined;
  private providerCleanup: FunctionReturnType<typeof api.providerWork.status> | null = null;
  constructor(private readonly ports: {
    rpc: Rpc;
    native: ControllerCustody;
    hash: NativeRequestHash;
    key: (generation: number) => NativeDeviceKey;
    signOut: () => Promise<void>;
    clearMemory: () => void;
    platform: "ios" | "android";
    mode: "live" | "fixture";
  }) {}
  getSnapshot = () => this.state;
  getCleanupRequired = () => this.cleanup.kind === "required";
  getProviderCleanup = () => this.providerCleanup;
  getRevocations = () => this.revocations;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private ownsCustody() { return !this.closed && this.ports.native.state().mode === this.ports.mode; }
  private publish(next: AccessState) {
    this.state = this.cleanup.kind === "required" && next.kind !== "wiping" ? { kind: "blocked", code: this.cleanup.code } : next;
    for (const listener of this.listeners) listener();
  }
  private invalidate(next: AccessState, lock = true) {
    this.epoch++;
    if (lock) this.ports.native.lock(); else this.ports.native.closeInput();
    this.ports.clearMemory();
    this.providerCleanup = null; this.revocations = [];
    this.publish(this.wiping ? { kind: "wiping" } : next);
  }
  private current(epoch: number, generation?: number) {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode || epoch !== this.epoch || this.cleanup.kind === "required" || this.wiping || this.ports.native.state().wipePending ||
      (generation !== undefined && this.ports.native.state().generation !== generation)) throw new StaleAccess();
  }
  async start() {
    if (this.closed) throw new StaleAccess();
    const epoch = this.epoch;
    const state = await this.ports.native.initialize(this.ports.mode, this.ports.native.state().generation);
    if (this.closed || state.mode !== this.ports.mode || epoch !== this.epoch || state.generation !== this.ports.native.state().generation) throw new StaleAccess();
    this.initialized = true;
    if (state.savedWorkspaceId) this.scope = { kind: "saved", workspaceId: state.savedWorkspaceId };
    if (state.wipePending) { this.signedOutCleanupAttempted = true; await this.wipe(); }
    else this.applyObservation();
  }
  observe(observation: ProviderObservation, online: boolean) {
    if (this.closed) return;
    const changed = observation.kind !== this.observation.kind ||
      (observation.kind === "signed-in" && this.observation.kind === "signed-in" && observation.sessionId !== this.observation.sessionId) || online !== this.online;
    this.observation = observation; this.online = online;
    if (this.initialized && this.ownsCustody() && changed) this.applyObservation();
  }
  private applyObservation() {
    const observation = this.observation;
    this.session = observation.kind === "signed-in" ? observation.sessionId : null;
    if (observation.kind === "signed-in") this.signedOutCleanupAttempted = false;
    if (this.wiping || this.cleanup.kind === "required") return;
    if (observation.kind === "signed-out" && !this.signedOutCleanupAttempted) {
      this.signedOutCleanupAttempted = true;
      try { if (this.ports.native.hasRetainedCustody(this.ports.mode)) { void this.wipe(); return; } }
      catch { this.invalidate({ kind: "blocked", code: "custody_cleanup_check_unavailable" }); return; }
    }
    if (this.state.kind === "blocked" && (this.state.code.startsWith("wipe_retry_required") || this.state.code === "custody_cleanup_check_unavailable")) return;
    this.invalidate(observation.kind === "signed-out" ? { kind: "signed-out" } : { kind: "locked" });
  }
  workspace(workspaceId: string) {
    if (!this.ownsCustody()) return;
    this.scope = { kind: "saved", workspaceId };
    this.invalidate({ kind: "locked" }, false);
  }
  suspend() { if (this.ownsCustody()) this.invalidate({ kind: "locked" }, false); }
  lock() { if (this.ownsCustody()) this.invalidate({ kind: "locked" }); }
  dispose() {
    if (this.closed) return;
    this.closed = true; this.epoch++;
    if (this.ports.native.state().mode === this.ports.mode) this.ports.native.lock();
    this.ports.clearMemory(); this.providerCleanup = null; this.revocations = []; this.publish({ kind: "locked" });
  }
  activity() {
    if (!this.ownsCustody() || this.cleanup.kind === "required") return;
    this.ports.native.touch();
    if ((this.state.kind !== "ready" && this.state.kind !== "provisioning") || this.heartbeat ||
      performance.now() - this.activityContactAt < 60000) return;
    this.activityContactAt = performance.now();
    this.heartbeat = this.execute(async (proof, rpc) => rpc.mutation(api.devices.heartbeat, await proof("devices.heartbeat", {})))
      .catch(() => {}).finally(() => { this.heartbeat = undefined; });
  }
  nativeChanged() {
    if (this.closed) return;
    const native = this.ports.native.state();
    const state = this.state;
    if ((state.kind === "ready" || state.kind === "provisioning") &&
      (!native.unlocked || native.generation !== state.contact.generation)) {
      this.epoch++; this.ports.clearMemory(); this.providerCleanup = null; this.revocations = []; this.publish({ kind: "locked" });
    }
  }
  private guarded(epoch: number, generation: number, actionGuard: () => void = () => {}) {
    const current = () => { this.current(epoch, generation); actionGuard(); };
    const nativeKey = this.ports.key(generation);
    return {
      hash: this.ports.hash,
      key: {
        publicKey: async () => { current(); const result = await nativeKey.publicKey(); current(); return result; },
        sign: async (message: string) => { current(); const result = await nativeKey.sign(message); current(); return result; },
      },
      transport: { prepare: async (args: PrepareRequest) => {
        current();
        const result = await this.ports.rpc.mutation(api.devices.prepare, args, current);
        current(); return result;
      } },
    };
  }
  async admit(fresh = false) {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode) return;
    if (this.cleanup.kind === "required") { this.publish(this.wiping ? { kind: "wiping" } : { kind: "blocked", code: this.cleanup.code }); return; }
    if (!this.session || !this.online || this.wiping) { this.invalidate({ kind: "blocked", code: "online_sign_in_required" }); return; }
    this.invalidate({ kind: "checking" }, false);
    const epoch = this.epoch;
    let admissionGeneration: number | undefined;
    try {
      let native: ReturnType<ControllerCustody["state"]>;
      try { native = (!fresh && this.ports.native.resumeAdmission()) || await this.ports.native.unlock(fresh ? "Confirm security access" : "Unlock Lukapp"); }
      catch { if (epoch === this.epoch) this.invalidate({ kind: "blocked", code: "full_sign_in_required" }); return; }
      admissionGeneration = native.generation;
      this.current(epoch, native.generation);
      let recovery = this.readRecovery();
      if (recovery.intent.kind === "retrieve") { this.invalidate({ kind: "blocked", code: "recovery_begin_retry_required" }); return; }
      if (recovery.intent.kind === "exact") {
        recovery = await this.requireRecoverySlot(epoch, native.generation);
        if (recovery.intent.kind !== "exact") throw new StaleAccess();
        const work = await this.ports.rpc.action(api.clerkProvider.completeRecovery, { intentId: recovery.intent.intentId }, () => this.current(epoch, native.generation));
        this.current(epoch, native.generation);
        await this.saveRecovery(recovery, { ...recovery, intent: { kind: "none" }, cleanup: { kind: "work", workId: work.workId } }, epoch, native.generation);
        this.providerCleanup = work;
      }
      const provider = await this.ports.rpc.action(api.clerkProvider.checkSession, {}, () => this.current(epoch, native.generation));
      this.current(epoch, native.generation);
      if (provider.kind === "denied") { await this.wipe(); return; }
      if (provider.kind === "unavailable") { this.invalidate({ kind: "blocked", code: provider.code }); return; }
      await this.reconcileCleanup(epoch, native.generation);
      await this.reconcileRevocations(epoch, native.generation);
      this.current(epoch, native.generation);
      const guarded = this.guarded(epoch, native.generation);
      const sessionDigest = await this.ports.hash.sha256Utf8(this.session);
      this.current(epoch, native.generation);
      const status = await this.ports.rpc.query(api.devices.status, {}, () => this.current(epoch, native.generation));
      this.current(epoch, native.generation);
      if (status.kind === "denied") {
        if (status.directive === "wipe-local-input-and-sign-out") { await this.wipe(); return; }
        if (status.directive !== "register-device") { this.invalidate({ kind: "blocked", code: status.code }); return; }
        if (native.keyPresent && !this.ports.native.enrollmentPending(sessionDigest, native.generation)) { this.invalidate({ kind: "blocked", code: "old_binding_revoke_required" }); return; }
        await this.ports.native.setEnrollmentPending(sessionDigest, native.generation);
        this.current(epoch, native.generation);
        const request = { platform: this.ports.platform, name: this.ports.platform === "ios" ? "My iPhone" : "My Android", publicKey: await guarded.key.publicKey() };
        this.current(epoch, native.generation);
        const signed = await proveDeviceRequest({ ...guarded, operation: "devices.register", request });
        this.current(epoch, native.generation);
        await this.ports.rpc.mutation(api.devices.register, signed, () => this.current(epoch, native.generation));
        this.current(epoch, native.generation);
      } else if (!native.keyPresent) { this.invalidate({ kind: "blocked", code: "installation_key_lost" }); return; }
      await this.ports.native.setEnrollmentPending(null, native.generation);
      this.current(epoch, native.generation);
      let serverContactAt: number | undefined;
      const outcome = await admitForeground({
        ...guarded, workspace: this.scope,
        transport: {
          ...guarded.transport,
          status: async args => { this.current(epoch, native.generation); const result = await this.ports.rpc.query(api.devices.status, args, () => this.current(epoch, native.generation)); this.current(epoch, native.generation); return result; },
          heartbeat: async args => { this.current(epoch, native.generation); const result = await this.ports.rpc.mutation(api.devices.heartbeat, args, () => this.current(epoch, native.generation)); this.current(epoch, native.generation); serverContactAt = result.lastSeenAt; return result; },
          localInputAuthority: async args => { this.current(epoch, native.generation); const result = await this.ports.rpc.query(api.accounting.localInputAuthority, args, () => this.current(epoch, native.generation)); this.current(epoch, native.generation); return result; },
        },
      });
      this.current(epoch, native.generation);
      if (outcome.kind === "wipe-required") { await this.wipe(); return; }
      if (outcome.kind === "blocked") { this.invalidate({ kind: "blocked", code: outcome.code }); return; }
      const contact = { epoch, generation: native.generation, deviceId: outcome.deviceId };
      this.activityContactAt = performance.now();
      if (outcome.kind === "provisioning-required") { this.publish({ kind: "provisioning", contact }); return; }
      if (serverContactAt === undefined) throw new StaleAccess();
      await this.ports.native.openInput(outcome.workspaceId, native.generation, serverContactAt);
      this.current(epoch, native.generation);
      this.scope = { kind: "saved", workspaceId: outcome.workspaceId };
      if (fresh) this.securityGeneration = native.generation;
      this.publish({ kind: "ready", workspaceId: outcome.workspaceId, contact });
    } catch (error) {
      if (error instanceof StaleAccess) return;
      try { this.current(epoch, admissionGeneration); } catch { return; }
      await this.reject(error);
    }
  }
  securityFresh() {
    return this.state.kind === "ready" && this.securityGeneration === this.state.contact.generation;
  }
  leaveSecurity() { this.securityGeneration = undefined; }
  private readRecovery() { return recoveryRecord.parse(JSON.parse(this.ports.native.readRecovery(this.ports.mode))); }
  private async saveRecovery(prior: RecoveryRecord, next: RecoveryRecord, epoch: number, generation: number) {
    this.current(epoch, generation);
    const saved = recoveryRecord.parse(JSON.parse(await this.ports.native.writeRecovery(JSON.stringify({ ...next, revision: prior.revision + 1 }), prior.revision, this.ports.mode, generation)));
    this.current(epoch, generation); return saved;
  }
  private readRevocations() { return this.ports.native.readRevocations(this.ports.mode).map(raw => revocationRecord.parse(JSON.parse(raw))); }
  private async saveRevocation(prior: RevocationRecord | undefined, next: RevocationRecord, epoch: number, generation: number) {
    this.current(epoch, generation);
    const saved = revocationRecord.parse(JSON.parse(await this.ports.native.writeRevocation(JSON.stringify(next), prior?.revision ?? -1, this.ports.mode, generation)));
    this.current(epoch, generation);
    this.revocations = [...this.revocations.filter(item => item.record.deviceId !== saved.deviceId), { record: saved, refreshed: true }];
    for (const listener of this.listeners) listener();
    return saved;
  }
  private async reconcileCleanup(epoch: number, generation: number) {
    this.current(epoch, generation);
    const recovery = this.readRecovery();
    if (recovery.cleanup.kind !== "work") return recovery;
    const work = await this.ports.rpc.query(api.providerWork.status, { workId: recovery.cleanup.workId }, () => this.current(epoch, generation));
    this.current(epoch, generation); this.providerCleanup = work;
    const next = work.state.kind === "succeeded" ? await this.saveRecovery(recovery, { ...recovery, cleanup: { kind: "none" } }, epoch, generation) : recovery;
    for (const listener of this.listeners) listener();
    return next;
  }
  private async requireRecoverySlot(epoch: number, generation: number) {
    const recovery = await this.reconcileCleanup(epoch, generation);
    if (recovery.cleanup.kind === "work") throw new ConvexError({ code: "recovery_cleanup_pending" });
    return recovery;
  }
  private async reconcileRevocations(epoch: number, generation: number) {
    this.current(epoch, generation);
    const records = this.readRevocations();
    this.revocations = records.map(record => ({ record, refreshed: false }));
    for (const listener of this.listeners) listener();
    for (const record of records) {
      if (record.outcome.kind !== "observed") continue;
      const work = await this.ports.rpc.query(api.providerWork.status, { workId: record.outcome.workId }, () => this.current(epoch, generation));
      this.current(epoch, generation);
      await this.saveRevocation(record, { ...record, revision: record.revision + 1, outcome: { kind: "observed", workId: work.workId, result: work.state } }, epoch, generation);
    }
  }
  async refreshProviderCleanup() {
    const state = this.state;
    if (state.kind !== "ready") throw new StaleAccess();
    try { await this.reconcileCleanup(state.contact.epoch, state.contact.generation); await this.reconcileRevocations(state.contact.epoch, state.contact.generation); }
    catch (error) {
      this.current(state.contact.epoch, state.contact.generation);
      if (!(error instanceof StaleAccess)) await this.reject(error);
      throw error;
    }
  }
  beginUserAction(): UserAction {
    const initial = this.state;
    if (initial.kind !== "ready") throw new StaleAccess();
    this.current(initial.contact.epoch, initial.contact.generation);
    const cancellation = new AbortController();
    const cancel = () => { cancellation.abort(); unsubscribe(); };
    const assertCurrent = () => {
      if (cancellation.signal.aborted) throw new StaleAccess("scenario_admission_invalidated");
      try { this.current(initial.contact.epoch, initial.contact.generation); if (this.state !== initial) throw new StaleAccess(); }
      catch { cancel(); throw new StaleAccess("scenario_admission_invalidated"); }
    };
    const unsubscribe = this.subscribe(() => { try { assertCurrent(); } catch {} });
    return { workspaceId: initial.workspaceId, signal: cancellation.signal, assertCurrent, cancel,
      execute: async work => { assertCurrent(); return this.execute(work, assertCurrent); } };
  }
  async listDevices() {
    await this.admit(true);
    return this.execute((_, rpc) => rpc.query(api.devices.list, {}));
  }
  revokeDevice(deviceId: Id<"mobileDevices">): Promise<void> {
    const pending = this.revoking.get(deviceId); if (pending) return pending;
    const operation = this.performRevocation(deviceId).finally(() => { if (this.revoking.get(deviceId) === operation) this.revoking.delete(deviceId); });
    this.revoking.set(deviceId, operation); return operation;
  }
  private async performRevocation(deviceId: Id<"mobileDevices">) {
    await this.admit(true);
    let self = false;
    await this.execute(async (proof, rpc) => {
      const state = this.state;
      if (state.kind !== "ready") throw new StaleAccess();
      const { epoch, generation } = state.contact;
      self = state.contact.deviceId === deviceId;
      let record = this.readRevocations().find(item => item.deviceId === deviceId);
      if (record?.outcome.kind === "observed") return;
      if (!record) record = await this.saveRevocation(undefined, { version: 1, revision: 0, deviceId, outcome: { kind: "response-unknown" } }, epoch, generation);
      const result = await rpc.mutation(api.devices.revoke, await proof("devices.revoke", { deviceId }));
      await this.saveRevocation(record, { ...record, revision: record.revision + 1,
        outcome: { kind: "observed", workId: result.workId, result: result.providerRevocation } }, epoch, generation);
    });
    if (self) await this.wipe();
  }
  beginRecovery(): Promise<void> {
    if (this.beginningRecovery) return this.beginningRecovery;
    const operation = this.performBeginRecovery().finally(() => { if (this.beginningRecovery === operation) this.beginningRecovery = undefined; });
    this.beginningRecovery = operation; return operation;
  }
  private async performBeginRecovery() {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode || !this.session || !this.online || this.wiping || this.cleanup.kind === "required") throw new StaleAccess();
    const unavailableCustody = this.state.kind === "blocked";
    this.invalidate({ kind: "checking" });
    const epoch = this.epoch;
    let generation = this.ports.native.state().generation;
    try {
      if (!unavailableCustody) generation = (await this.ports.native.unlock("Confirm account recovery")).generation;
      this.current(epoch, generation);
      let recovery = await this.requireRecoverySlot(epoch, generation);
      if (recovery.intent.kind === "none") recovery = await this.saveRecovery(recovery, { ...recovery, intent: { kind: "retrieve" } }, epoch, generation);
      if (recovery.intent.kind === "retrieve") {
        const intent = await this.ports.rpc.action(api.clerkProvider.beginRecovery, {}, () => this.current(epoch, generation));
        this.current(epoch, generation);
        await this.saveRecovery(recovery, { ...recovery, intent: { kind: "exact", intentId: intent.intentId } }, epoch, generation);
      }
      this.current(epoch, generation); await this.wipe();
    } catch (error) {
      this.current(epoch, generation);
      await this.reject(error); throw error;
    }
  }
  async execute<T>(work: (proof: <Request extends object>(operation: AccessOperation, request: Request) => Promise<Request & { access: { challengeId: Id<"deviceChallenges">; signature: string } }>, rpc: Rpc) => Promise<T>, actionGuard: () => void = () => {}): Promise<T> {
    const state = this.state;
    if (state.kind !== "ready" && state.kind !== "provisioning") throw new StaleAccess();
    const { epoch, generation, deviceId } = state.contact;
    this.current(epoch, generation);
    const current = () => { this.current(epoch, generation); actionGuard(); };
    const guarded = this.guarded(epoch, generation, actionGuard);
    const proof = async <Request extends object>(operation: AccessOperation, request: Request) => {
      current();
      const signed = await proveDeviceRequest({ ...guarded, deviceId, operation, request });
      current(); return signed;
    };
    try {
      current();
      const rpc: Rpc = {
        query: async (ref, args) => { current(); const value = await this.ports.rpc.query(ref, args, current); current(); return value; },
        mutation: async (ref, args) => { current(); const value = await this.ports.rpc.mutation(ref, args, current); current(); return value; },
        action: async (ref, args) => { current(); const value = await this.ports.rpc.action(ref, args, current); current(); return value; },
      };
      const result = await work(proof, rpc);
      current(); return result;
    } catch (error) {
      current();
      if (!(error instanceof StaleAccess)) await this.reject(error);
      throw error;
    }
  }
  private async reject(error: unknown) {
    const data = error instanceof ConvexError ? error.data : null;
    if (typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" &&
      ["provider_session_terminal", "provider_session_invalid", "provider_provenance_mismatch"].includes(data.code)) {
      await this.wipe(); return;
    }
    const denial = admissionFailure(error);
    if (denial.kind === "wipe-required") await this.wipe();
    else this.invalidate({ kind: "blocked", code: denial.code });
  }
  async wipe(): Promise<void> {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode) throw new StaleAccess();
    if (this.wiping) return this.wiping;
    this.cleanup = { kind: "required", code: "wipe_retry_required:marker" };
    this.epoch++;
    let phase = "marker";
    const operation = (async () => {
      try {
        const phaseCurrent = () => { if (!this.ownsCustody()) throw new StaleAccess(); };
        phaseCurrent();
        this.ports.native.lock();
        this.ports.clearMemory(); this.providerCleanup = null; this.revocations = [];
        this.publish({ kind: "wiping" });
        await this.ports.native.beginWipe(this.ports.mode);
        phaseCurrent();
        phase = "native";
        await this.ports.native.erase(this.ports.mode);
        phaseCurrent();
        phase = "session";
        await this.ports.signOut();
        phaseCurrent();
        phase = "finish";
        await this.ports.native.finishWipe(this.ports.mode);
        phaseCurrent();
        this.scope = { kind: "discover" };
        this.session = null; this.cleanup = { kind: "clear" }; this.publish({ kind: "signed-out" });
      } catch (error) {
        if (!this.ownsCustody()) return;
        const known = ["key_deletion_failed", "input_deletion_failed", "wipe_marker_deletion_failed"]
          .find(code => error instanceof Error && error.message.includes(code));
        this.cleanup = { kind: "required", code: "wipe_retry_required:" + phase + (known ? ":" + known : "") };
        this.publish({ kind: "blocked", code: this.cleanup.code });
      }
    })().finally(() => { if (this.wiping === operation) this.wiping = undefined; });
    this.wiping = operation;
    return operation;
  }
}
