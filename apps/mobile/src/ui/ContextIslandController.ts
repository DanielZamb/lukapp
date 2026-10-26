import { islandObservationSchema, islandPayload, type IslandObservation, type IslandPayload } from "./contextIslandModel";
import type { ContextPillContent, PillEvent, PillVisibility } from "./contextPillModel";

export type IslandOwner = {
  key: string; cycle: number; content: ContextPillContent; visibility: PillVisibility;
  send(event: PillEvent, animated?: boolean): void;
};
export type IslandTransport = {
  setAdmission(admitted: boolean): Promise<void>;
  request(payload: IslandPayload): Promise<unknown>;
  update(payload: IslandPayload): Promise<void>;
  end(scope: string): Promise<void>;
  endAll(): Promise<void>;
};
type Run = {
  scope: string; owner: IslandOwner; revision: number;
  phase: "requesting" | "active" | "ending" | "terminal";
};
export type IslandPhase = "idle" | "requesting" | "active" | "ending" | "blocked";

export class ContextIslandController {
  private owner: IslandOwner | null = null;
  private admitted = false;
  private admissionGeneration = 0;
  private disposed = false;
  private run: Run | null = null;
  private ticket: Run | null = null;
  private phase: IslandPhase = "idle";
  private listeners = new Set<() => void>();
  private work = Promise.resolve();
  private updateQueued = false;

  constructor(private readonly native: IslandTransport, private readonly newScope: () => string) {}
  getSnapshot = () => this.phase;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  settled = () => this.work;
  private publish(phase: IslandPhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.listeners.forEach(listener => listener());
  }
  private enqueue(operation: () => Promise<void>) {
    this.work = this.work.then(operation).catch(() => { this.publish("blocked"); });
  }
  private sameOwner(owner: IslandOwner | null, run: Run) {
    return owner?.key === run.owner.key && owner.cycle === run.owner.cycle;
  }
  private permitted(run: Run) {
    return !this.disposed && this.admitted && this.sameOwner(this.owner, run) && this.owner?.visibility === "visible";
  }
  bind(owner: IslandOwner | null, admitted: boolean) {
    if (this.disposed) return;
    const previous = this.owner;
    this.owner = owner;
    if (this.ticket && (!admitted || !this.sameOwner(owner, this.ticket) || owner?.visibility === "summary")) this.ticket = null;
    if (this.admitted !== admitted) {
      this.admitted = admitted;
      const generation = ++this.admissionGeneration;
      if (admitted) this.enqueue(async () => {
        if (this.disposed || generation !== this.admissionGeneration || !this.admitted) return;
        await this.native.setAdmission(true);
      });
      else void this.native.setAdmission(false).catch(() => { this.publish("blocked"); });
    }
    const run = this.run;
    if (!run) return;
    if (!this.permitted(run)) {
      if (!admitted && previous?.visibility === "visible" && this.sameOwner(previous, run)) previous.send("swipeUp");
      this.finish(run);
    } else if (run.phase === "active") this.queueUpdate();
  }
  activate() {
    const owner = this.owner;
    if (this.disposed || !this.admitted || owner?.visibility !== "visible" || this.phase !== "idle") return;
    const run: Run = { scope: this.newScope(), owner, revision: -1, phase: "requesting" };
    this.run = run;
    this.ticket = run;
    this.publish("requesting");
    this.enqueue(async () => {
      if (!this.permitted(run) || run.phase !== "requesting") return;
      try {
        const result = await this.native.request(islandPayload(run.scope, this.owner?.content ?? run.owner.content));
        const parsed = islandObservationSchema.safeParse(result);
        if (!parsed.success || parsed.data.scope !== run.scope) throw new Error("Invalid activity response");
        this.observe(parsed.data);
        if (!this.permitted(run)) { this.finish(run); return; }
        if (this.phase === "active") this.queueUpdate();
      } catch {
        if (this.ticket === run) this.ticket = null;
        await this.endRun(run);
      }
    });
  }
  private queueUpdate() {
    if (this.updateQueued) return;
    this.updateQueued = true;
    this.enqueue(async () => {
      this.updateQueued = false;
      const run = this.run;
      if (!run || run.phase !== "active" || !this.permitted(run) || !this.owner) return;
      try { await this.native.update(islandPayload(run.scope, this.owner.content)); }
      catch { this.finish(run); }
    });
  }
  observe(raw: unknown) {
    const result = islandObservationSchema.safeParse(raw);
    if (!result.success) return;
    const observation: IslandObservation = result.data;
    const run = this.run;
    if (!run || observation.scope !== run.scope || observation.revision <= run.revision || run.phase === "terminal") return;
    run.revision = observation.revision;
    if (observation.state === "active") {
      if (run.phase !== "requesting" || !this.permitted(run)) return;
      run.phase = "active";
      this.publish("active");
      return;
    }
    if (run.phase === "ending") return;
    run.phase = "terminal";
    this.run = null;
    this.publish("idle");
    if (this.permitted(run)) run.owner.send("swipeUp");
  }
  back(scope: string, animated: boolean): boolean {
    const ticket = this.ticket;
    if (!ticket || ticket.scope !== scope || !this.admitted || this.disposed || !this.sameOwner(this.owner, ticket)
      || this.owner?.visibility === "summary") return false;
    this.ticket = null;
    ticket.owner.send("back", animated);
    this.finish(ticket);
    return true;
  }
  private finish(run: Run) {
    if (run.phase === "ending" || run.phase === "terminal") return;
    run.phase = "ending";
    this.publish("ending");
    void this.endRun(run).catch(() => { this.publish("blocked"); });
  }
  private async endRun(run: Run) {
    run.phase = "ending";
    await this.native.end(run.scope);
    run.phase = "terminal";
    if (this.run === run) { this.run = null; this.publish("idle"); }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.admissionGeneration++;
    this.admitted = false;
    this.owner = null;
    this.ticket = null;
    if (this.run) this.finish(this.run);
    void this.native.setAdmission(false).catch(() => { this.publish("blocked"); });
  }
}
