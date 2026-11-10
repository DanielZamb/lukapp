import { emptyFields, hasTypedText, validateReport, type ReportField, type ReportFields } from "./validation";

export type ReportKind = "bug" | "feedback";
export type Audience = "public" | "private";
export type Destination = { configured: boolean; repository: string; audience: Audience; screenshotRetentionDays: number };
export type DestinationState = Destination | "loading" | "unavailable";
export type Screenshot = { uri: string; width: number; height: number; redacted: boolean };
/** The exact bytes of a screenshot file and their lower-case hex SHA-256. */
export type ScreenshotImage = { bytes: ArrayBuffer; sha256: string };
/** `default` follows the audience: included for a private destination, left out for a public one. */
export type ScreenshotChoice = "default" | "included" | "excluded";
export type ScreenshotNotice = "redactFailed" | "missing";
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
  /**
   * What the server may hold under this key: the digest it confirmed storing, or
   * `unconfirmed` while an attach's outcome is unknown. Any change of image clears it.
   */
  attached: { sha256: string } | "unconfirmed" | null;
  /** Fixed at the first send so a retry repeats the exact same intent. */
  context: ReportContext | null;
  /**
   * Set when Send is pressed, with the digest of the image the person approved.
   * While set, a retry repeats exactly this command and the report can't be edited.
   */
  frozen: { screenshotSha256: string | null } | null;
  createdAt: number;
};

export type SubmitArgs = {
  reportKey: string;
  kind: ReportKind;
  title: string;
  whatHappened: string;
  expected?: string;
  steps?: string;
  screenshotSha256?: string;
  context: ReportContext;
};
export type SubmitResult = { reference: string; issueNumber: number; url: string };

export type SendFailure =
  | { code: "offline" }
  | { code: "unknown" }
  | { code: "access" }
  | { code: "not_configured" }
  | { code: "rate_limited"; retryAt: number }
  | { code: "invalid_report"; field: ReportField | "screenshot" | null }
  | { code: "changed_report" }
  | { code: "report_expired" };

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
      screenshotNotice: ScreenshotNotice | null;
    }
  | { kind: "sending"; report: Report; step: "uploading" | "submitting" }
  | {
      kind: "failed";
      report: Report;
      failure: SendFailure;
      confirm: "discard" | null;
      screenshotNotice: ScreenshotNotice | null;
    }
  | { kind: "sent"; result: SubmitResult };

export type ReportSnapshot = { phase: ReportPhase; destination: DestinationState };

export type FeedbackTransport = {
  attachScreenshot(args: { reportKey: string; image: ArrayBuffer }): Promise<{ sha256: string }>;
  removeScreenshot(args: { reportKey: string }): Promise<null>;
  submit(args: SubmitArgs): Promise<SubmitResult>;
};

export type ReportDraftStore = {
  read(): Promise<Report | null>;
  /** Coalesces typing into one later write. */
  save(report: Report): void;
  /** Resolves once the report is written on the phone, replacing any write still waiting. */
  saveNow(report: Report): Promise<void>;
  clear(): void;
};

export type ReportDependencies = {
  newKey: () => string;
  now: () => number;
  capture: () => Promise<Screenshot | null>;
  /** Admission, unlock and foreground, read at the moment of the call. */
  captureAllowed: () => boolean;
  /** Null when the file is gone. */
  readScreenshot: (uri: string) => Promise<ScreenshotImage | null>;
  deleteCapture: (uri: string) => Promise<void>;
  drafts: ReportDraftStore;
  transport: FeedbackTransport;
  context: () => Omit<ReportContext, "screen">;
  isOffline: () => boolean;
  classify: (error: unknown) => SendFailure;
  timeoutMs?: number;
};

/** The backend's limit for an attached image. */
export const maxScreenshotBytes = 5 * 1024 * 1024;

export class SendTimeout extends Error {}
/** The server acknowledged an attach with a digest other than the bytes sent. */
export class ScreenshotNotStored extends Error {}
class Superseded extends Error {}

export function includesScreenshot(report: Report, audience: Audience | null) {
  if (!report.screenshot) return false;
  if (report.screenshotChoice === "default") return audience === "private";
  return report.screenshotChoice === "included";
}

export function submitArgs(report: Report, context: ReportContext, screenshotSha256: string | null): SubmitArgs {
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
    ...(screenshotSha256 ? { screenshotSha256 } : {}),
    context,
  };
}

const confirmedDigest = (report: Report) =>
  report.attached !== null && report.attached !== "unconfirmed" ? report.attached.sha256 : null;

const missingScreenshot = (failure: SendFailure) => failure.code === "invalid_report" && failure.field === "screenshot";

/** Outcome-unknown failures keep the report frozen; every other failure leaves it editable. */
const definitive = new Set<SendFailure["code"]>(["offline", "not_configured", "rate_limited", "invalid_report"]);

export class ReportMachine {
  private snapshot: ReportSnapshot = { phase: { kind: "idle" }, destination: "loading" };
  private listeners = new Set<() => void>();
  private generation = 0;
  /** Server deletions run in order and finish before a send's first call, so a late one can't remove a newer image. */
  private removals: Promise<void> = Promise.resolve();
  constructor(private readonly deps: ReportDependencies) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private show(phase: ReportPhase) {
    this.snapshot = { ...this.snapshot, phase };
    for (const listener of this.listeners) listener();
  }

  /** Shows the phase and stores its report: debounced for typing, or written before resolving when `durable`. */
  private set(phase: ReportPhase, durable = false): Promise<void> {
    this.show(phase);
    if (phase.kind !== "editing" && phase.kind !== "sending" && phase.kind !== "failed") return Promise.resolve();
    if (phase.kind === "editing" && phase.practice) return Promise.resolve();
    if (phase.report.frozen || hasTypedText(phase.report.fields)) {
      if (durable) return this.deps.drafts.saveNow(phase.report);
      this.deps.drafts.save(phase.report);
    } else this.deps.drafts.clear();
    return Promise.resolve();
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
      attached: null,
      context: null,
      frozen: null,
      createdAt: this.deps.now(),
    };
  }

  private editing(
    report: Report,
    notice: SendFailure | null = null,
    practice = false,
  ): Extract<ReportPhase, { kind: "editing" }> {
    return {
      kind: "editing",
      report,
      practice,
      notice,
      editedSinceNotice: false,
      showErrors: false,
      confirm: null,
      screenshotNotice: null,
    };
  }

  private fail(report: Report, failure: SendFailure) {
    return this.set(
      report.frozen
        ? { kind: "failed", report, failure, confirm: null, screenshotNotice: null }
        : this.editing(report, failure),
    );
  }

  /** Best effort, never awaited by the person: the server deletes this key's image, or its retention does later. */
  private forget(report: Report) {
    if (report.attached === null) return;
    const { reportKey } = report;
    this.removals = this.removals
      .then(() => this.timed(this.deps.transport.removeScreenshot({ reportKey })))
      .then(
        () => {},
        () => {},
      );
  }

  /** The approved file is gone or its bytes changed: the report continues without a screenshot. */
  private withoutScreenshot(report: Report): Report {
    this.forget(report);
    if (report.screenshot) void this.deps.deleteCapture(report.screenshot.uri);
    return { ...report, screenshot: null, attached: null, frozen: report.frozen && { screenshotSha256: null } };
  }

  /** A shake captures the screen before any report UI exists; the menu never captures. */
  async open(origin: ReportOrigin, screen: string | null) {
    if (this.snapshot.phase.kind !== "idle") return;
    const generation = ++this.generation;
    this.show({ kind: "capturing", origin });
    let screenshot: Screenshot | null = null;
    if (origin === "shake" && this.deps.captureAllowed()) {
      screenshot = await this.deps.capture().catch(() => null);
      if (generation !== this.generation || !this.deps.captureAllowed()) {
        if (generation === this.generation) this.show({ kind: "idle" });
        if (screenshot) await this.deps.deleteCapture(screenshot.uri);
        return;
      }
    }
    const stored = await this.deps.drafts.read().catch(() => null);
    if (generation !== this.generation) {
      if (screenshot) await this.deps.deleteCapture(screenshot.uri);
      return;
    }
    const fresh = this.newReport(origin, screen, screenshot);
    if (stored) this.show({ kind: "resuming", stored, fresh });
    else void this.set(this.editing(fresh));
  }

  /** The onboarding practice form: never captured, persisted, uploaded or submitted. */
  openPractice() {
    if (this.snapshot.phase.kind !== "idle") return;
    this.generation++;
    void this.set(this.editing(this.newReport("menu", null, null), null, true));
  }

  async resume() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "resuming") return;
    if (phase.fresh.screenshot) await this.deps.deleteCapture(phase.fresh.screenshot.uri);
    let report = phase.stored;
    let lost = false;
    if (report.screenshot) {
      const image = await this.deps.readScreenshot(report.screenshot.uri);
      const expected = report.frozen?.screenshotSha256 ?? confirmedDigest(report);
      if (!image || (expected !== null && image.sha256 !== expected)) {
        report = this.withoutScreenshot(report);
        lost = true;
      }
    }
    if (this.snapshot.phase !== phase) return;
    const notice = lost ? "missing" : null;
    void this.set(
      report.frozen
        ? { kind: "failed", report, failure: { code: "unknown" }, confirm: null, screenshotNotice: notice }
        : { ...this.editing(report), screenshotNotice: notice },
    );
  }

  async startNew() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "resuming") return;
    this.deps.drafts.clear();
    this.forget(phase.stored);
    if (phase.stored.screenshot) await this.deps.deleteCapture(phase.stored.screenshot.uri);
    void this.set(this.editing(phase.fresh));
  }

  private editable() {
    const phase = this.snapshot.phase;
    return phase.kind === "editing" && !phase.confirm ? phase : null;
  }

  private update(change: (report: Report) => Report, screenshotNotice?: ScreenshotNotice | null, durable = false) {
    const phase = this.editable();
    if (!phase) return Promise.resolve();
    return this.set(
      {
        ...phase,
        report: change(phase.report),
        editedSinceNotice: phase.notice !== null,
        screenshotNotice: screenshotNotice === undefined ? phase.screenshotNotice : screenshotNotice,
      },
      durable,
    );
  }

  edit(field: ReportField, value: string) {
    void this.update((report) => ({ ...report, fields: { ...report.fields, [field]: value } }));
  }

  setKind(kind: ReportKind) {
    void this.update((report) => ({ ...report, kind }));
  }

  setScreenshotIncluded(included: boolean) {
    const phase = this.editable();
    if (!phase) return;
    if (!included) this.forget(phase.report);
    void this.update((report) => ({
      ...report,
      screenshotChoice: included ? "included" : "excluded",
      attached: included ? report.attached : null,
    }));
  }

  async removeScreenshot(notice: ScreenshotNotice | null = null) {
    const phase = this.editable();
    if (!phase?.report.screenshot) return;
    const { uri } = phase.report.screenshot;
    this.forget(phase.report);
    void this.update((report) => ({ ...report, screenshot: null, attached: null }), notice);
    await this.deps.deleteCapture(uri);
  }

  redactionFailed() {
    return this.removeScreenshot("redactFailed");
  }

  /**
   * Swaps in the flattened image and deletes the original, so hidden content leaves the device's copy too.
   * The saved report points at the new file before the original is deleted, so a restart can't bring it back.
   */
  async replaceScreenshot(flattened: Screenshot) {
    const phase = this.editable();
    if (!phase?.report.screenshot) {
      await this.deps.deleteCapture(flattened.uri);
      return;
    }
    const previous = phase.report.screenshot.uri;
    this.forget(phase.report);
    await this.update((report) => ({ ...report, screenshot: { ...flattened, redacted: true }, attached: null }), null, true);
    if (previous !== flattened.uri) await this.deps.deleteCapture(previous);
  }

  requestCancel() {
    const phase = this.snapshot.phase;
    if (phase.kind === "editing" && !phase.practice && hasTypedText(phase.report.fields) && !phase.confirm)
      void this.set({ ...phase, confirm: "discard" });
    else if (phase.kind === "failed" && !phase.confirm) void this.set({ ...phase, confirm: "discard" });
    else if (phase.kind === "editing" || phase.kind === "resuming" || phase.kind === "capturing") void this.discard();
  }

  dismissConfirm() {
    const phase = this.snapshot.phase;
    if ((phase.kind === "editing" || phase.kind === "failed") && phase.confirm)
      void this.set({ ...phase, confirm: null });
  }

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
    for (const report of reports) {
      this.forget(report);
      if (report.screenshot) await this.deps.deleteCapture(report.screenshot.uri);
    }
  }

  keepForLater() {
    if (this.snapshot.phase.kind !== "failed") return;
    this.generation++;
    this.show({ kind: "idle" });
  }

  done() {
    if (this.snapshot.phase.kind !== "sent") return;
    this.show({ kind: "idle" });
  }

  confirmNewKey() {
    const phase = this.snapshot.phase;
    if (phase.kind !== "editing" || phase.confirm !== "newKey") return;
    this.forget(phase.report);
    const report = { ...phase.report, reportKey: this.deps.newKey(), attached: null, context: null, frozen: null };
    void this.set(this.editing(report));
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
    const keptOnDevice = kept !== null && (kept.frozen !== null || hasTypedText(kept.fields));
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

  /**
   * From the press of Send until the attempt resolves the report is in `sending`, so nothing about
   * its image can change. The digest sent is computed from the file on screen, and the server
   * publishes an image only when its bytes match that digest.
   */
  async send() {
    const phase = this.snapshot.phase;
    const destination = this.snapshot.destination;
    if (phase.kind === "editing") {
      if (phase.practice || phase.confirm) return;
      if (Object.keys(validateReport(phase.report.fields)).length > 0) {
        void this.set({ ...phase, showErrors: true });
        return;
      }
      if (phase.notice?.code === "changed_report") {
        if (phase.editedSinceNotice) void this.set({ ...phase, confirm: "newKey" });
        return;
      }
    } else if (phase.kind !== "failed" || phase.confirm) return;
    if (typeof destination !== "object") return;
    const start = phase.report;
    if (!destination.configured) return void this.fail(start, { code: "not_configured" });
    if (this.deps.isOffline()) return void this.fail(start, { code: "offline" });
    const generation = ++this.generation;
    const wasFrozen = start.frozen;
    const include = wasFrozen ? wasFrozen.screenshotSha256 !== null : includesScreenshot(start, destination.audience);
    this.show({ kind: "sending", report: start, step: include && !wasFrozen ? "uploading" : "submitting" });

    const image = include && start.screenshot ? await this.deps.readScreenshot(start.screenshot.uri) : null;
    if (generation !== this.generation) return;
    if (include && (!image || (wasFrozen && image.sha256 !== wasFrozen.screenshotSha256))) {
      void this.set({ ...phase, report: this.withoutScreenshot(start), screenshotNotice: "missing" });
      return;
    }
    if (image && image.bytes.byteLength > maxScreenshotBytes)
      return void this.fail(start, { code: "invalid_report", field: "screenshot" });

    const context = start.context ?? { ...this.deps.context(), ...(start.screen ? { screen: start.screen } : {}) };
    const frozen = wasFrozen ?? { screenshotSha256: image?.sha256 ?? null };
    // A frozen retry submits first and attaches again only when the server no longer holds the image.
    const attachFirst = image !== null && !wasFrozen && confirmedDigest(start) !== image.sha256;
    let report: Report = { ...start, context, frozen };
    const args = submitArgs(report, context, frozen.screenshotSha256);
    let submitting = false;
    let attachedNow = false;
    const current = () => {
      if (generation !== this.generation) throw new Superseded();
    };
    const attach = async (approved: ScreenshotImage) => {
      report = { ...report, attached: "unconfirmed" };
      await this.set({ kind: "sending", report, step: "uploading" }, true);
      current();
      const stored = await this.timed(
        this.deps.transport.attachScreenshot({ reportKey: report.reportKey, image: approved.bytes }),
      );
      current();
      if (stored.sha256 !== approved.sha256) throw new ScreenshotNotStored();
      attachedNow = true;
      report = { ...report, attached: { sha256: stored.sha256 } };
      await this.set({ kind: "sending", report, step: "submitting" }, true);
      current();
    };
    const run = async (withAttach: boolean): Promise<{ result: SubmitResult } | { failure: SendFailure } | null> => {
      submitting = false;
      try {
        if (withAttach && image) await attach(image);
        submitting = true;
        this.show({ kind: "sending", report, step: "submitting" });
        const result = await this.timed(this.deps.transport.submit(args));
        current();
        return { result };
      } catch (error) {
        if (generation !== this.generation) return null;
        return { failure: this.deps.classify(error) };
      }
    };

    await this.set({ kind: "sending", report, step: attachFirst ? "uploading" : "submitting" }, true);
    await this.removals;
    if (generation !== this.generation) return;
    let outcome = await run(attachFirst);
    if (outcome && "failure" in outcome && submitting && image && !attachedNow && missingScreenshot(outcome.failure))
      outcome = await run(true);
    if (!outcome) return;

    if ("result" in outcome) {
      this.show({ kind: "sent", result: outcome.result });
      this.deps.drafts.clear();
      if (report.screenshot) await this.deps.deleteCapture(report.screenshot.uri);
      return;
    }
    const { failure } = outcome;
    if (failure.code === "report_expired") {
      // No issue exists under the old key: the same report goes again under a new one.
      this.forget(report);
      report = { ...report, reportKey: this.deps.newKey(), attached: null, context: null, frozen: null };
      return void this.set(this.editing(report, failure));
    }
    if (failure.code === "changed_report") report = { ...report, frozen: null };
    else if (!submitting || definitive.has(failure.code)) report = { ...report, frozen: wasFrozen };
    void this.fail(report, failure);
  }
}
