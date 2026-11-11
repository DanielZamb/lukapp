import type { MessageKey } from "../../i18n";

export type ReportFields = {
  title: string;
  whatHappened: string;
  expected: string;
  steps: string;
};
export type ReportField = keyof ReportFields;

/** The same limits the backend enforces on `feedback.submit`, counted after trimming. */
export const reportLimits = {
  title: { min: 3, max: 120 },
  whatHappened: { min: 1, max: 4000 },
  expected: { min: 0, max: 4000 },
  steps: { min: 0, max: 4000 },
} as const satisfies Record<ReportField, { min: number; max: number }>;

export type FieldErrors = Partial<Record<ReportField, MessageKey>>;

const tooShort: Record<ReportField, MessageKey> = {
  title: "feedback.errorTitleShort",
  whatHappened: "feedback.errorWhatHappenedRequired",
  expected: "feedback.errorTooLong",
  steps: "feedback.errorTooLong",
};

export function validateReport(fields: ReportFields): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of Object.keys(reportLimits) as ReportField[]) {
    const length = fields[field].trim().length;
    const { min, max } = reportLimits[field];
    if (length < min) errors[field] = tooShort[field];
    else if (length > max) errors[field] = field === "title" ? "feedback.errorTitleLong" : "feedback.errorTooLong";
  }
  return errors;
}

export function hasTypedText(fields: ReportFields) {
  return Object.values(fields).some((value) => value.trim().length > 0);
}

export const emptyFields: ReportFields = { title: "", whatHappened: "", expected: "", steps: "" };
