import { emptyFields, hasTypedText, validateReport, type ReportField, type ReportFields } from "./validation";

export type ReportKind = "bug" | "feedback";
export type Audience = "public" | "private";
export type Destination = { configured: boolean; repository: string; audience: Audience };
export type DestinationState = Destination | "loading" | "unavailable";
export type Screenshot = { uri: string; width: number; height: number; redacted: boolean };
/** `default` follows the audience: included for a private destination, left out for a public one. */
export type ScreenshotChoice = "default" | "included" | "excluded";
export type ReportContext = {
  appVersion: string;
  platform: "ios" | "android";
  osVersion: string;
  language: "en" | "es";
  screen?: string;
};
export type ReportOrigin = "shake" | "menu";

export type Report = {
  reportKey: string;
  kind: ReportKind;
  fields: ReportFields;
  origin: ReportOrigin;
  screen: string | null;
  screenshot: Screenshot | null;
  captureFailed: boolean;
  screenshotChoice: ScreenshotChoice;
  /** The upload made under this key, reused on retry while the same file is attached. */
  uploaded: { storageId: string; uri: string } | null;
  /** Fixed at the first send so a retry repeats the exact same intent. */
  context: ReportContext | null;
  /** A submit ran and its outcome is unknown: the report can be retried, not edited. */
  frozen: boolean;
  createdAt: number;
};

export type SubmitArgs = {
  reportKey: string;
  kind: ReportKind;
  title: string;
  whatHappened: string;
  expected?: string;
  steps?: string;
  screenshotStorageId?: string;
  context: ReportContext;
};
export type SubmitResult = { reference: string; issueNumber: number; url: string };

export type SendFailure =
  | { code: "offline" }
  | { code: "unknown" }
  | { code: "access" }
  | { code: "not_configured" }
  | { code: "rate_limited"; retryAt: number }
  | { code: "invalid_report"; field: ReportField | null }
  | { code: "changed_report" };

export type ReportPhase =
  | { kind: "idle" }
  | { kind: "capturing"; origin: ReportOrigin }
  | { kind: "resuming"; stored: Report; fresh: Report }
  | {
      kind: "editing";
      report: Report;
      practice: boolean;
      notice: SendFailure | null;
      editedSinceNotice: boolean;
      showErrors: boolean;
      confirm: "discard" | "newKey" | null;
    }
  | { kind: "sending"; report: Report; step: "uploading" | "submitting" }
  | { kind: "failed"; report: Report; failure: SendFailure; confirm: "discard" | null }
  | { kind: "sent"; result: SubmitResult };

export type ReportSnapshot = { phase: ReportPhase; destination: DestinationState };

export type FeedbackTransport = {
  prepareScreenshotUpload(args: { reportKey: string }): Promise<{ uploadUrl: string }>;
  upload(uploadUrl: string, screenshot: Screenshot): Promise<{ storageId: string }>;
  submit(args: SubmitArgs): Promise<SubmitResult>;
};

export type ReportDraftStore = {
  read(): Promise<Report | null>;
  save(report: Report): void;
  clear(): void;
};

export type ReportDependencies = {
  newKey: () => string;
  now: () => number;
  capture: () => Promise<Screenshot | null>;
  deleteCapture: (uri: string) => Promise<void>;
  drafts: ReportDraftStore;
  transport: FeedbackTransport;
  context: () => Omit<ReportContext, "screen">;
  isOffline: () => boolean;
  classify: (error: unknown) => SendFailure;
  timeoutMs?: number;
};

export class SendTimeout extends Error {}

export function includesScreenshot(report: Report, audience: Audience | null) {
  if (!report.screenshot) return false;
  if (report.screenshotChoice === "default") return audience === "private";
  return report.screenshotChoice === "included";
}

export function submitArgs(report: Report, context: ReportContext, storageId: string | null): SubmitArgs {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const expected = optional(report.fields.expected);
  const steps = optional(report.fields.steps);
  return {
    reportKey: report.reportKey,
    kind: report.kind,
    title: report.fields.title.trim(),
    whatHappened: report.fields.whatHappened.trim(),
    ...(expected ? { expected } : {}),
    ...(steps ? { steps } : {}),
    ...(storageId ? { screenshotStorageId: storageId } : {}),
    context,
  };
}

/** Outcome-unknown failures freeze the report; every other failure leaves it editable. */
const definitive = new Set<SendFailure["code"]>(["offline", "not_configured", "rate_limited", "invalid_report"]);

export class ReportMachine {
  private snapshot: ReportSnapshot = { phase: { kind: "idle" }, destination: "loading" };
  private listeners = new Set<() => void>();
  private generation = 0;
  constructor(private readonly deps: ReportDependencies) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(phase: ReportPhase) {
    this.snapshot = { ...this.snapshot, phase };
    this.persist(phase);
    for (const listener of this.listeners) listener();
  }

  private persist(phase: ReportPhase) {
    if (phase.kind !== "editing" && phase.kind !== "sending" && phase.kind !== "failed") return;
    if (phase.kind === "editing" && phase.practice) return;
    if (phase.report.frozen || hasTypedText(phase.report.fields)) this.deps.drafts.save(phase.report);
    else this.deps.drafts.clear();
  }

  setDestination(destination: DestinationState) {
    this.snapshot = { ...this.snapshot, destination };
    for (const listener of this.listeners) listener();
  }

  private newReport(origin: ReportOrigin, screen: string | null, screenshot: Screenshot | null): Report {
    return {
      reportKey: this.deps.newKey(),
      kind: "bug",
      fields: emptyFields,
      origin,
      screen,
      screenshot,
      captureFailed: origin === "shake" && screenshot === null,
      screenshotChoice: "default",
      uploaded: null,
      context: null,
      frozen: false,
      createdAt: this.deps.now(),
    };
  }

  private editing(report: Report, notice: SendFailure | null = null, practice = false): ReportPhase {
    return { kind: "editing", report, practice, notice, editedSinceNotice: false, showErrors: false, confirm: null };
  }

  private resumed(report: Report): ReportPhase {
    return report.frozen
      ? { kind: "failed", report, failure: { code: "unknown" }, confirm: null }
      : this.editing(report);
  }

  /** A shake captures the screen before any report UI exists; the menu never captures. */
  async open(origin: ReportOrigin, screen: string | null) {
    if (this.snapshot.phase.kind !== "idle") return;
    const generation = ++this.generation;
    this.set({ kind: "capturing", origin });
    let screenshot: Screenshot | null = null;
    if (origin === "shake") screenshot = await this.deps.capture().catch(() => null);
    const stored = await this.deps.drafts.read().catch(() => null);
    if (generation !== this.generation) {
      if (screenshot) await this.deps.deleteCapture(screenshot.uri);
      return;
    }
    const fresh = this.newReport(origin, screen, screenshot);
    if (stored) {
      this.snapshot = { ...this.snapshot, phase: { kind: "resuming", stored, fresh } };
      for (const listener of this.listeners) listener();
    } else this.set(this.editing(fresh));
  }

  /** The onboarding practice form: never captured, persisted, uploaded or submitted. */
  openPractice() {
    if (this.snapshot.phase.kind !== "idle") return;
    this.generation++;
    this.set(this.editing(this.newReport("menu", null, null), null, true));
  }

  async resume() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "resuming") return;
    if (phase.fresh.screenshot) await this.deps.deleteCapture(phase.fresh.screenshot.uri);
    this.set(this.resumed(phase.stored));
  }

  async startNew() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "resuming") return;
    this.deps.drafts.clear();
    if (phase.stored.screenshot) await this.deps.deleteCapture(phase.stored.screenshot.uri);
    this.set(this.editing(phase.fresh));
  }

  private update(change: (report: Report) => Report) {
    const phase = this.snapshot.phase;
    if (phase.kind !== "editing" || phase.confirm) return;
    this.set({ ...phase, report: change(phase.report), editedSinceNotice: phase.notice !== null });
  }

  edit(field: ReportField, value: string) {
    this.update((report) => ({ ...report, fields: { ...report.fields, [field]: value } }));
  }

  setKind(kind: ReportKind) {
    this.update((report) => ({ ...report, kind }));
  }

  setScreenshotIncluded(included: boolean) {
    this.update((report) => ({ ...report, screenshotChoice: included ? "included" : "excluded" }));
  }

  async removeScreenshot() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "editing" || phase.confirm || !phase.report.screenshot) return;
    const { uri } = phase.report.screenshot;
    this.update((report) => ({ ...report, screenshot: null }));
    await this.deps.deleteCapture(uri);
  }

  /** Swaps in the flattened image and deletes the original, so hidden content leaves the device's copy too. */
  async replaceScreenshot(flattened: Screenshot) {
    const phase = this.snapshot.phase;
    if (phase.kind !== "editing" || phase.confirm || !phase.report.screenshot) {
      await this.deps.deleteCapture(flattened.uri);
      return;
    }
    const previous = phase.report.screenshot.uri;
    this.update((report) => ({ ...report, screenshot: { ...flattened, redacted: true } }));
    if (previous !== flattened.uri) await this.deps.deleteCapture(previous);
  }

  requestCancel() {
    const phase = this.snapshot.phase;
    if (phase.kind === "editing" && !phase.practice && hasTypedText(phase.report.fields) && !phase.confirm)
      this.set({ ...phase, confirm: "discard" });
    else if (phase.kind === "failed" && !phase.confirm) this.set({ ...phase, confirm: "discard" });
    else if (phase.kind === "editing" || phase.kind === "resuming" || phase.kind === "capturing") void this.discard();
  }

  dismissConfirm() {
    const phase = this.snapshot.phase;
    if ((phase.kind === "editing" || phase.kind === "failed") && phase.confirm)
      this.set({ ...phase, confirm: null });
  }

  /** Cancel: the capture is deleted, the stored draft cleared, and nothing touches the network. */
  async discard() {
    const phase = this.snapshot.phase;
    this.generation++;
    const reports =
      phase.kind === "editing" || phase.kind === "failed" ? [phase.report]
      : phase.kind === "resuming" ? [phase.fresh]
      : [];
    const practice = phase.kind === "editing" && phase.practice;
    this.snapshot = { ...this.snapshot, phase: { kind: "idle" } };
    if (!practice && phase.kind !== "resuming") this.deps.drafts.clear();
    for (const listener of this.listeners) listener();
    for (const report of reports) if (report.screenshot) await this.deps.deleteCapture(report.screenshot.uri);
  }

  /** Leaves a failed report saved on this phone to retry from Settings later. */
  keepForLater() {
    if (this.snapshot.phase.kind !== "failed") return;
    this.generation++;
    this.snapshot = { ...this.snapshot, phase: { kind: "idle" } };
    for (const listener of this.listeners) listener();
  }

  done() {
    if (this.snapshot.phase.kind !== "sent") return;
    this.snapshot = { ...this.snapshot, phase: { kind: "idle" } };
    for (const listener of this.listeners) listener();
  }

  confirmNewKey() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "editing" || phase.confirm !== "newKey") return;
    const report = { ...phase.report, reportKey: this.deps.newKey(), uploaded: null, context: null, frozen: false };
    this.set({ ...this.editing(report) });
    void this.send();
  }

  /** The app is closing this layer underneath an open report; a typed or frozen report stays saved. */
  async dispose() {
    const phase = this.snapshot.phase;
    this.generation++;
    this.snapshot = { ...this.snapshot, phase: { kind: "idle" } };
    const kept =
      (phase.kind === "editing" && !phase.practice) || phase.kind === "failed" || phase.kind === "sending"
        ? phase.report
        : null;
    const keptOnDevice = kept !== null && (kept.frozen || hasTypedText(kept.fields));
    const orphan =
      phase.kind === "resuming" ? phase.fresh.screenshot
      : (phase.kind === "editing" || phase.kind === "failed" || phase.kind === "sending") && !keptOnDevice
        ? phase.report.screenshot
        : null;
    if (orphan) await this.deps.deleteCapture(orphan.uri);
  }

  private timed<T>(work: Promise<T>): Promise<T> {
    const ms = this.deps.timeoutMs ?? 30_000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SendTimeout()), ms);
      work.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error: unknown) => { clearTimeout(timer); reject(error); },
      );
    });
  }

  async send() {
    const phase = this.snapshot.phase;
    const destination = this.snapshot.destination;
    if (phase.kind === "editing") {
      if (phase.practice || phase.confirm) return;
      if (Object.keys(validateReport(phase.report.fields)).length > 0) {
        this.set({ ...phase, showErrors: true });
        return;
      }
      if (phase.notice?.code === "changed_report") {
        if (phase.editedSinceNotice) this.set({ ...phase, confirm: "newKey" });
        return;
      }
    } else if (phase.kind !== "failed" || phase.confirm) return;
    if (typeof destination !== "object") return;
    let report = phase.report;
    const fail = (failure: SendFailure) =>
      this.set(report.frozen
        ? { kind: "failed", report, failure, confirm: null }
        : this.editing(report, failure));
    if (!destination.configured) return fail({ code: "not_configured" });
    if (this.deps.isOffline()) return fail({ code: "offline" });
    const generation = ++this.generation;
    const wasFrozen = report.frozen;
    report = {
      ...report,
      context: report.context ?? { ...this.deps.context(), ...(report.screen ? { screen: report.screen } : {}) },
    };
    const include = includesScreenshot(report, destination.audience);
    let submitting = false;
    try {
      if (include && report.screenshot && report.uploaded?.uri !== report.screenshot.uri) {
        this.set({ kind: "sending", report, step: "uploading" });
        const { uploadUrl } = await this.timed(
          this.deps.transport.prepareScreenshotUpload({ reportKey: report.reportKey }),
        );
        if (generation !== this.generation) return;
        const { storageId } = await this.timed(this.deps.transport.upload(uploadUrl, report.screenshot));
        if (generation !== this.generation) return;
        report = { ...report, uploaded: { storageId, uri: report.screenshot.uri } };
      }
      submitting = true;
      report = { ...report, frozen: true };
      this.set({ kind: "sending", report, step: "submitting" });
      const context = report.context as ReportContext;
      const result = await this.timed(
        this.deps.transport.submit(submitArgs(report, context, include ? report.uploaded?.storageId ?? null : null)),
      );
      if (generation !== this.generation) return;
      this.snapshot = { ...this.snapshot, phase: { kind: "sent", result } };
      this.deps.drafts.clear();
      for (const listener of this.listeners) listener();
      if (report.screenshot) await this.deps.deleteCapture(report.screenshot.uri);
    } catch (error) {
      if (generation !== this.generation) return;
      const failure = this.deps.classify(error);
      if (failure.code === "changed_report") {
        report = { ...report, frozen: false };
        return fail(failure);
      }
      if (submitting && definitive.has(failure.code)) report = { ...report, frozen: wasFrozen };
      else if (!submitting) report = { ...report, frozen: wasFrozen };
      fail(failure);
    }
  }
}
