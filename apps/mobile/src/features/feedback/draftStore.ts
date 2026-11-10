import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import type { LocalInputLease } from "../../local-auth/localInput";
import type { Report, ReportDraftStore } from "./report";

export const reportDraftTtlMs = 7 * 24 * 60 * 60 * 1000;

export function reportDraftKey(subject: string) {
  return `lukapp.feedback.report.${subject}`;
}

const text = z.string().max(20_000);
const reportSchema = z.object({
  reportKey: z.string().min(1).max(100),
  kind: z.enum(["bug", "feedback"]),
  fields: z.object({ title: text, whatHappened: text, expected: text, steps: text }),
  origin: z.enum(["shake", "menu"]),
  screen: z.string().max(200).nullable(),
  screenshot: z
    .object({ uri: z.string(), width: z.number(), height: z.number(), redacted: z.boolean() })
    .nullable(),
  captureFailed: z.boolean(),
  screenshotChoice: z.enum(["default", "included", "excluded"]),
  uploaded: z.object({ storageId: z.string(), uri: z.string() }).nullable(),
  context: z
    .object({
      appVersion: z.string(),
      platform: z.enum(["ios", "android"]),
      osVersion: z.string(),
      language: z.enum(["en", "es"]),
      screen: z.string().optional(),
    })
    .nullable(),
  frozen: z.boolean(),
  createdAt: z.number(),
});
const documentSchema = z.object({ v: z.literal(1), report: reportSchema });

/** Reads the saved report, dropping it (and its capture) once it is a week old or unreadable. */
export async function readReportDraft(
  subject: string,
  now: number,
  deleteCapture: (uri: string) => Promise<void>,
): Promise<Report | null> {
  const raw = await SecureStore.getItemAsync(reportDraftKey(subject));
  if (raw === null) return null;
  let parsed: z.infer<typeof documentSchema> | null = null;
  try {
    const result = documentSchema.safeParse(JSON.parse(raw));
    parsed = result.success ? result.data : null;
  } catch {
    parsed = null;
  }
  if (parsed && now - parsed.report.createdAt < reportDraftTtlMs && parsed.report.createdAt <= now)
    return parsed.report;
  await SecureStore.deleteItemAsync(reportDraftKey(subject));
  if (parsed?.report.screenshot) await deleteCapture(parsed.report.screenshot.uri);
  return null;
}

export function clearReportDraft(subject: string) {
  return SecureStore.deleteItemAsync(reportDraftKey(subject));
}

/**
 * The machine's draft store for one unlocked admission. Saves coalesce while
 * the person types; a clear cancels any pending save so a discarded report
 * never comes back. Every write goes through the admission's lease.
 */
export function createReportDraftStore({
  lease,
  now,
  deleteCapture,
  debounceMs = 400,
  onChange,
}: {
  lease: LocalInputLease;
  now: () => number;
  deleteCapture: (uri: string) => Promise<void>;
  debounceMs?: number;
  onChange?: (saved: boolean) => void;
}): ReportDraftStore & { flush(): Promise<void> } {
  let pending: Report | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: Promise<void> = Promise.resolve();
  const write = (operation: () => Promise<void>) => {
    last = lease.run(operation).catch(() => {});
    return last;
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const report = pending;
    pending = null;
    if (!report) return last;
    onChange?.(true);
    return write(() =>
      SecureStore.setItemAsync(reportDraftKey(lease.subject), JSON.stringify({ v: 1, report })),
    );
  };
  return {
    read: async () => {
      await last;
      return readReportDraft(lease.subject, now(), deleteCapture);
    },
    save(report) {
      pending = report;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      onChange?.(false);
      void write(() => clearReportDraft(lease.subject));
    },
    flush,
  };
}
