import { requireNewSignIn, type InstallMarker } from "./installMarker";

export const ordinaryInactivityMs = 2 * 60_000;
export const monthCloseInactivityMs = 10 * 60_000;
export type EntryIdentity = { subject: string; sessionId: string } | null;
export type EntryState =
  | { kind: "checking" }
  | { kind: "sign-in" }
  | { kind: "locked" }
  | { kind: "authenticating" }
  | { kind: "open" }
  | { kind: "reauthentication" }
  | { kind: "unavailable" };
export type EntrySnapshot = { state: EntryState; obscured: boolean };
export type EntryDependencies = {
  now: () => number;
  readMarker: () => Promise<InstallMarker>;
  writeMarker: (marker: InstallMarker) => Promise<void>;
  unlock: (marker: InstallMarker, subject: string) => Promise<void>;
  enroll: (marker: InstallMarker, subject: string) => Promise<void>;
  signOut: () => Promise<void>;
  initializePrivacy: () => Promise<void>;
  hide: () => Promise<void>;
  reveal: () => Promise<void>;
  cancelPrompt: () => Promise<void>;
};

function sensitivePath(path: string) {
  return /^\/(settings|devices|sessions|security|export)(\/|$)/.test(path);
}

export class EntryController {
  private snapshot: EntrySnapshot = {
    state: { kind: "checking" },
    obscured: true,
  };
  private listeners = new Set<() => void>();
  private marker: InstallMarker | null = null;
  private identity: EntryIdentity = null;
  private approvedSession: string | null = null;
  private generation = 0;
  private active = true;
  private focused = true;
  private awaySince: number | null = null;
  private lastInteraction = 0;
  private path = "/";
  private disposed = false;
  private initialized: Promise<InstallMarker> | null = null;
  private privacyWork: Promise<void> = Promise.resolve();
  constructor(private readonly deps: EntryDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: EntryState) {
    if (this.disposed) return;
    this.snapshot = {
      state,
      obscured: !this.active || !this.focused || state.kind !== "open",
    };
    for (const listener of this.listeners) listener();
    this.privacyWork = this.privacyWork
      .then(async () => {
        if (this.snapshot.obscured) await this.deps.hide();
        else await this.deps.reveal();
      })
      .catch(() => {
        this.generation++;
        this.snapshot = { state: { kind: "unavailable" }, obscured: true };
        for (const listener of this.listeners) listener();
      });
  }
  private current(generation: number) {
    return !this.disposed && generation === this.generation;
  }
  private initialize() {
    this.initialized ??= this.deps
      .initializePrivacy()
      .then(() => this.deps.readMarker());
    return this.initialized;
  }
  async setIdentity(identity: EntryIdentity) {
    this.disposed = false;
    this.identity = identity;
    const generation = ++this.generation;
    this.publish({ kind: "checking" });
    try {
      this.marker ??= await this.initialize();
      if (!this.current(generation)) return;
      if (!identity) {
        this.approvedSession = null;
        this.publish({ kind: "sign-in" });
        return;
      }
      if (this.approvedSession === identity.sessionId) {
        this.publish({ kind: "locked" });
        return;
      }
      if (
        this.marker.kind === "enrolled" &&
        this.marker.subject === identity.subject &&
        this.marker.sessionId === identity.sessionId
      ) {
        this.publish({ kind: "locked" });
      } else {
        this.marker = requireNewSignIn(this.marker);
        await this.deps.writeMarker(this.marker);
        if (this.current(generation)) {
          this.publish({ kind: "reauthentication" });
          await this.reauthenticate();
        }
      }
    } catch {
      if (this.current(generation)) this.publish({ kind: "unavailable" });
    }
  }
  // Called only by the successful Clerk sign-in flow, before session activation.
  approveSignIn = (sessionId: string) => {
    this.approvedSession = sessionId;
  };
  private async enroll(
    generation: number,
    identity: NonNullable<EntryIdentity>,
  ) {
    if (!this.marker) return;
    this.publish({ kind: "authenticating" });
    try {
      const pending = requireNewSignIn(this.marker);
      await this.deps.writeMarker(pending);
      if (!this.current(generation)) return;
      this.marker = pending;
      await this.deps.enroll(pending, identity.subject);
      if (!this.current(generation)) return;
      const enrolled: InstallMarker = {
        ...pending,
        kind: "enrolled",
        subject: identity.subject,
        sessionId: identity.sessionId,
      };
      await this.deps.writeMarker(enrolled);
      if (!this.current(generation)) return;
      this.marker = enrolled;
      this.approvedSession = null;
      this.open();
    } catch {
      if (this.current(generation))
        await this.requireReauthentication(generation);
    }
  }
  async unlock() {
    if (
      this.snapshot.state.kind !== "locked" ||
      !this.marker ||
      !this.identity ||
      !this.active ||
      !this.focused
    )
      return;
    const generation = ++this.generation;
    if (this.approvedSession === this.identity.sessionId) {
      await this.enroll(generation, this.identity);
      return;
    }
    this.publish({ kind: "authenticating" });
    try {
      await this.deps.unlock(this.marker, this.identity.subject);
      if (!this.current(generation)) return;
      this.open();
    } catch {
      if (this.current(generation))
        await this.requireReauthentication(generation);
    }
  }
  private open() {
    this.lastInteraction = this.deps.now();
    if (this.awaySince !== null) this.awaySince = this.lastInteraction;
    this.publish({ kind: "open" });
  }
  private async requireReauthentication(generation: number) {
    if (!this.marker) return;
    this.approvedSession = null;
    this.marker = requireNewSignIn(this.marker);
    try {
      await this.deps.writeMarker(this.marker);
      if (this.current(generation)) this.publish({ kind: "reauthentication" });
    } catch {
      if (this.current(generation)) this.publish({ kind: "unavailable" });
    }
  }
  async reauthenticate() {
    if (this.snapshot.state.kind !== "reauthentication") return;
    const generation = ++this.generation;
    this.approvedSession = null;
    this.publish({ kind: "checking" });
    try {
      await this.deps.signOut();
    } catch {
      if (this.current(generation)) this.publish({ kind: "reauthentication" });
    }
  }
  isOpenFor(identity: EntryIdentity) {
    return (
      this.snapshot.state.kind === "open" &&
      identity !== null &&
      this.identity !== null &&
      identity.subject === this.identity.subject &&
      identity.sessionId === this.identity.sessionId
    );
  }
  unlockedInstallId() {
    return this.snapshot.state.kind === "open" &&
      this.marker?.kind === "enrolled"
      ? this.marker.installId
      : null;
  }
  needsPathUnlock(path: string) {
    return path !== this.path && sensitivePath(path);
  }
  setPath(path: string) {
    const changed = this.path !== path;
    this.path = path;
    if (changed && sensitivePath(path) && this.snapshot.state.kind === "open")
      this.lock();
    this.tick();
  }
  interaction = () => {
    this.tick();
    if (this.snapshot.state.kind === "open" && this.active && this.focused)
      this.lastInteraction = this.deps.now();
  };
  private lock() {
    this.generation++;
    this.publish({ kind: "locked" });
  }
  setPresence(active: boolean, focused: boolean, background: boolean) {
    this.active = active;
    this.focused = focused;
    if (!active || !focused) this.awaySince ??= this.deps.now();
    if (background && this.snapshot.state.kind === "authenticating") {
      this.lock();
      void this.requireReauthentication(this.generation);
      void this.deps.cancelPrompt().catch(() => {});
    }
    if (active && focused && this.awaySince !== null) {
      const elapsed = this.deps.now() - this.awaySince;
      if (elapsed >= 0 && elapsed < ordinaryInactivityMs)
        this.lastInteraction += elapsed;
    }
    this.tick();
    if (active && focused) this.awaySince = null;
    this.publish(this.snapshot.state);
  }
  tick = () => {
    if (
      this.snapshot.state.kind !== "open" &&
      this.snapshot.state.kind !== "authenticating"
    )
      return;
    const now = this.deps.now();
    const awayElapsed = this.awaySince === null ? 0 : now - this.awaySince;
    const idleElapsed = now - this.lastInteraction;
    const limit =
      this.path === "/month-close"
        ? monthCloseInactivityMs
        : ordinaryInactivityMs;
    if (
      (this.awaySince !== null &&
        (awayElapsed < 0 || awayElapsed >= ordinaryInactivityMs)) ||
      (this.snapshot.state.kind === "open" &&
        this.active &&
        this.focused &&
        (idleElapsed < 0 || idleElapsed >= limit))
    )
      this.lock();
  };
  dispose() {
    this.disposed = true;
    this.generation++;
    this.listeners.clear();
    this.snapshot = { state: { kind: "locked" }, obscured: true };
    this.privacyWork = this.privacyWork
      .then(() => this.deps.hide())
      .catch(() => {});
    void this.deps.cancelPrompt().catch(() => {});
  }
}
