import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import { admitForeground, admissionFailure } from "../../../../src/access/admission";
import { proveDeviceRequest } from "../../../../src/access/client";
import type { NativeRequestHash, PrepareRequest } from "../../../../src/access/client";
import type { AccessOperation, NativeDeviceKey } from "../../../../src/access/protocol";
import type { Custody } from "./native";
import { ConvexError } from "convex/values";

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
export type ControllerCustody = Pick<Custody, "state" | "initialize" | "lock" | "touch" | "closeInput" | "unlock" | "resumeAdmission" |
  "recoveryPending" | "setRecoveryPending" | "recoveryIntent" | "setRecoveryIntent" | "recoveryWork" | "setRecoveryWork" | "enrollmentPending" | "setEnrollmentPending" |
  "openInput" | "beginWipe" | "erase" | "finishWipe">;

export class AccessController {
  private epoch = 0;
  private closed = false;
  private session: string | null = null;
  private online = false;
  private scope: { kind: "discover" } | { kind: "saved"; workspaceId: string } = { kind: "discover" };
  private state: AccessState = { kind: "starting" };
  private listeners = new Set<() => void>();
  private wiping: Promise<void> | undefined;
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
  getProviderCleanup = () => this.providerCleanup;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private ownsCustody() { return !this.closed && this.ports.native.state().mode === this.ports.mode; }
  private publish(next: AccessState) { this.state = next; for (const listener of this.listeners) listener(); }
  private invalidate(next: AccessState, lock = true) {
    this.epoch++;
    if (lock) this.ports.native.lock(); else this.ports.native.closeInput();
    this.ports.clearMemory();
    this.providerCleanup = null;
    this.publish(this.wiping ? { kind: "wiping" } : next);
  }
  private current(epoch: number, generation?: number) {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode || epoch !== this.epoch || this.wiping || this.ports.native.state().wipePending ||
      (generation !== undefined && this.ports.native.state().generation !== generation)) throw new StaleAccess();
  }
  async start() {
    if (this.closed) throw new StaleAccess();
    const epoch = this.epoch;
    const state = await this.ports.native.initialize(this.ports.mode, this.ports.native.state().generation);
    if (this.closed || state.mode !== this.ports.mode || epoch !== this.epoch || state.generation !== this.ports.native.state().generation) throw new StaleAccess();
    if (state.savedWorkspaceId) this.scope = { kind: "saved", workspaceId: state.savedWorkspaceId };
    if (state.wipePending) await this.wipe();
    else this.publish({ kind: "locked" });
  }
  context(session: string | null, online: boolean) {
    if (!this.ownsCustody()) return;
    if (session === this.session && online === this.online) return;
    const lostSession = this.session !== null && session === null;
    this.session = session; this.online = online;
    this.invalidate(session ? { kind: "locked" } : { kind: "signed-out" });
    if (lostSession) void this.wipe();
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
    this.ports.clearMemory(); this.providerCleanup = null; this.publish({ kind: "locked" });
  }
  activity() {
    if (!this.ownsCustody()) return;
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
      this.epoch++; this.ports.clearMemory(); this.providerCleanup = null; this.publish({ kind: "locked" });
    }
  }
  private guarded(epoch: number, generation: number) {
    const nativeKey = this.ports.key(generation);
    return {
      hash: this.ports.hash,
      key: {
        publicKey: async () => { this.current(epoch, generation); const result = await nativeKey.publicKey(); this.current(epoch, generation); return result; },
        sign: async (message: string) => { this.current(epoch, generation); const result = await nativeKey.sign(message); this.current(epoch, generation); return result; },
      },
      transport: { prepare: async (args: PrepareRequest) => {
        this.current(epoch, generation);
        const result = await this.ports.rpc.mutation(api.devices.prepare, args, () => this.current(epoch, generation));
        this.current(epoch, generation); return result;
      } },
    };
  }
  async admit(fresh = false) {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode) return;
    if (!this.session || !this.online || this.wiping) { this.invalidate({ kind: "blocked", code: "online_sign_in_required" }); return; }
    this.invalidate({ kind: "checking" }, false);
    const epoch = this.epoch;
    try {
      let native: ReturnType<ControllerCustody["state"]>;
      try { native = (!fresh && this.ports.native.resumeAdmission()) || await this.ports.native.unlock(fresh ? "Confirm security access" : "Unlock Lukapp"); }
      catch { if (epoch === this.epoch) this.invalidate({ kind: "blocked", code: "full_sign_in_required" }); return; }
      this.current(epoch, native.generation);
      if (this.ports.native.recoveryPending()) {
        if (!this.ports.native.recoveryWork(this.ports.mode)) {
          let intentId = this.ports.native.recoveryIntent(this.ports.mode);
          if (!intentId || intentId === "retrieve") {
            const intent = await this.ports.rpc.action(api.clerkProvider.beginRecovery, {}, () => this.current(epoch, native.generation));
            this.current(epoch, native.generation);
            intentId = intent.intentId;
            await this.ports.native.setRecoveryIntent(intentId, this.ports.mode);
            this.current(epoch, native.generation);
          }
          const work = await this.ports.rpc.action(api.clerkProvider.completeRecovery, { intentId }, () => this.current(epoch, native.generation));
          this.current(epoch, native.generation);
          await this.ports.native.setRecoveryWork(work.workId, this.ports.mode, native.generation);
          this.current(epoch, native.generation);
          this.providerCleanup = work;
        }
        await this.ports.native.setRecoveryPending(false, this.ports.mode);
        this.current(epoch, native.generation);
      }
      const provider = await this.ports.rpc.action(api.clerkProvider.checkSession, {}, () => this.current(epoch, native.generation));
      this.current(epoch, native.generation);
      if (provider.kind === "denied") { await this.wipe(); return; }
      if (provider.kind === "unavailable") { this.invalidate({ kind: "blocked", code: provider.code }); return; }
      await this.reconcileCleanup(epoch, native.generation);
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
      if (epoch !== this.epoch) return;
      await this.reject(error);
    }
  }
  securityFresh() {
    return this.state.kind === "ready" && this.securityGeneration === this.state.contact.generation;
  }
  leaveSecurity() { this.securityGeneration = undefined; }
  private async reconcileCleanup(epoch: number, generation: number) {
    this.current(epoch, generation);
    const workId = this.ports.native.recoveryWork(this.ports.mode);
    if (!workId) return;
    const work = await this.ports.rpc.query(api.providerWork.status, { workId }, () => this.current(epoch, generation));
    this.current(epoch, generation);
    this.providerCleanup = work;
    if (work.state.kind === "succeeded") {
      await this.ports.native.setRecoveryWork(null, this.ports.mode, generation);
      this.current(epoch, generation);
    }
    for (const listener of this.listeners) listener();
  }
  async refreshProviderCleanup() {
    const state = this.state;
    if (state.kind !== "ready") throw new StaleAccess();
    try { await this.reconcileCleanup(state.contact.epoch, state.contact.generation); }
    catch (error) {
      this.current(state.contact.epoch, state.contact.generation);
      if (!(error instanceof StaleAccess)) await this.reject(error);
      throw error;
    }
  }
  async listDevices() {
    await this.admit(true);
    return this.execute((_, rpc) => rpc.query(api.devices.list, {}));
  }
  async revokeDevice(deviceId: Id<"mobileDevices">) {
    await this.admit(true);
    return this.execute(async (proof, rpc) => rpc.mutation(api.devices.revoke, await proof("devices.revoke", { deviceId })));
  }
  async beginRecovery() {
    if (this.closed || this.ports.native.state().mode !== this.ports.mode || !this.session || !this.online || this.wiping) throw new StaleAccess();
    const unavailableCustody = this.state.kind === "blocked";
    this.invalidate({ kind: "checking" });
    const epoch = this.epoch;
    if (!unavailableCustody) {
      const native = await this.ports.native.unlock("Confirm account recovery");
      this.current(epoch, native.generation);
    }
    this.current(epoch);
    await this.ports.native.setRecoveryPending(true, this.ports.mode);
    try {
      const intent = await this.ports.rpc.action(api.clerkProvider.beginRecovery, {}, () => this.current(epoch));
      this.current(epoch);
      await this.ports.native.setRecoveryIntent(intent.intentId, this.ports.mode);
      this.current(epoch);
      await this.wipe();
    } catch (error) {
      if (epoch === this.epoch) this.invalidate({ kind: "blocked", code: "recovery_online_sign_in_required" });
      throw error;
    }
  }
  async execute<T>(work: (proof: <Request extends object>(operation: AccessOperation, request: Request) => Promise<Request & { access: { challengeId: Id<"deviceChallenges">; signature: string } }>, rpc: Rpc) => Promise<T>): Promise<T> {
    const state = this.state;
    if (state.kind !== "ready" && state.kind !== "provisioning") throw new StaleAccess();
    const { epoch, generation, deviceId } = state.contact;
    const guarded = this.guarded(epoch, generation);
    const proof = async <Request extends object>(operation: AccessOperation, request: Request) => {
      this.current(epoch, generation);
      const signed = await proveDeviceRequest({ ...guarded, deviceId, operation, request });
      this.current(epoch, generation); return signed;
    };
    try {
      this.current(epoch, generation);
      const rpc: Rpc = {
        query: async (ref, args) => { this.current(epoch, generation); const value = await this.ports.rpc.query(ref, args, () => this.current(epoch, generation)); this.current(epoch, generation); return value; },
        mutation: async (ref, args) => { this.current(epoch, generation); const value = await this.ports.rpc.mutation(ref, args, () => this.current(epoch, generation)); this.current(epoch, generation); return value; },
        action: async (ref, args) => { this.current(epoch, generation); const value = await this.ports.rpc.action(ref, args, () => this.current(epoch, generation)); this.current(epoch, generation); return value; },
      };
      const result = await work(proof, rpc);
      this.current(epoch, generation); return result;
    } catch (error) {
      if (!(error instanceof StaleAccess) && epoch === this.epoch) await this.reject(error);
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
    this.epoch++; this.ports.native.lock(); this.ports.clearMemory(); this.providerCleanup = null; this.publish({ kind: "wiping" });
    let phase = "marker";
    this.wiping = (async () => {
      const phaseCurrent = () => { if (this.closed || this.ports.native.state().mode !== this.ports.mode) throw new StaleAccess(); };
      phaseCurrent();
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
      this.session = null; this.publish({ kind: "signed-out" });
    })();
    try { await this.wiping; } catch (error) {
      const known = ["key_deletion_failed", "input_deletion_failed", "wipe_marker_deletion_failed"]
        .find(code => error instanceof Error && error.message.includes(code));
      this.publish({ kind: "blocked", code: "wipe_retry_required:" + phase + (known ? ":" + known : "") });
    }
    finally { this.wiping = undefined; }
  }
}
