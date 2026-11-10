import {
  createAmountEditor,
  formatMinorUnits,
  parseAmount,
  type AmountEditorState,
  type AmountFormat,
} from "../../../../../src/money/amount";
import { amountFormat } from "./currencyFormat";
import {
  amountTextFormatOf,
  openStoredAmountText,
  type AmountNotice,
  type AmountReviewReason,
  type StoredAmountText,
} from "./storedText";

/**
 * An amount the person must confirm before it is sent: text the app rewrote from an older saved format, or text that
 * arrived several characters at once, such as a paste, carrying a separator. The requirement holds through every
 * later edit while the text still has a separator, so editing and restoring cannot skip it.
 */
export type AmountReview = Readonly<{ reason: AmountReviewReason; previous: string | null }>;

/**
 * One editing session of one amount field, bound to one currency. The text is exactly what the native field shows:
 * the app never regroups it while the person types, so the amount is always the text read with the strict grammar.
 * A new currency starts a new session; a language change does not touch it.
 */
export type AmountSession = Readonly<{ currency: string; editor: AmountEditorState; review: AmountReview | null }>;

/** The editor state for text exactly as written, read with the strict grammar and never rewritten. */
export function literalEditor(format: AmountFormat, text: string): AmountEditorState {
  const base = { format, text, selection: { start: text.length, end: text.length }, generatedGroups: [] };
  const parsed = parseAmount(text, format);
  if (parsed.kind === "parsed") return { ...base, kind: "complete", minorUnits: parsed.minorUnits };
  const { issue } = parsed;
  return issue.code === "empty" || issue.code === "incomplete" ? { ...base, kind: "incomplete", issue } : { ...base, kind: "invalid", issue };
}

/**
 * Text the app opens, such as a saved amount or one it formatted. Text grouped exactly as the format groups its digits
 * opens without the group marks, which reads the same and leaves the field holding only what the person types. Any
 * other text opens as written.
 */
function openedText(format: AmountFormat, text: string): string {
  const signed = text.replace(/^−/, "-");
  const ungrouped = signed.split(format.convention.group).join("");
  return ungrouped !== signed && createAmountEditor(format, ungrouped).text === signed ? ungrouped : text;
}

export function openAmountIn(format: AmountFormat, currency: string, text = ""): AmountSession {
  return { currency, editor: literalEditor(format, openedText(format, text)), review: null };
}

export function openAmount(currency: string, text = ""): AmountSession {
  return openAmountIn(amountFormat(currency), currency, text);
}

/** A session holding an amount the app already knows, such as a suggestion, a saved limit or a reopened command. */
export function amountOfMinorUnits(
  currency: string,
  minorUnits: number,
  options: { sign?: "+" | "-"; hideZeroDecimals?: boolean; format?: AmountFormat } = {},
): AmountSession {
  const format = options.format ?? amountFormat(currency);
  const sign = minorUnits < 0 ? "-" : options.sign ?? "";
  return openAmountIn(format, currency, `${sign}${formatMinorUnits(Math.abs(minorUnits), format, options)}`);
}

function requireReview(session: AmountSession, reason: AmountReviewReason, previous: string | null): AmountSession {
  return { ...session, review: { reason, previous } };
}

/**
 * A session for saved text, read under the grammar it was saved in. Text the app rewrote into the current format,
 * and text saved while it still awaited confirmation, open exactly as they are shown for confirmation.
 */
export function openSavedAmount(
  currency: string,
  stored: StoredAmountText,
  format: AmountFormat = amountFormat(currency),
): { session: AmountSession; notice: AmountNotice | null } {
  const opened = openStoredAmountText(stored, currency, format);
  const awaiting = (reason: AmountReviewReason, previous: string | null) =>
    requireReview({ currency, editor: literalEditor(format, opened.text), review: null }, reason, previous);
  if (opened.notice?.kind === "converted")
    return { session: awaiting("converted", stored.review?.previous ?? opened.notice.previous), notice: opened.notice };
  if (stored.review && !opened.notice) return { session: awaiting(stored.review.reason, stored.review.previous), notice: null };
  return { session: openAmountIn(format, currency, opened.text), notice: opened.notice };
}

/** The signed minor units to send: a complete amount the person does not still have to confirm. Anything else is null. */
export function amountMinorUnits(session: AmountSession): number | null {
  return session.review === null ? displayedMinorUnits(session) : null;
}

/** The signed minor units the field shows, whether or not they still await confirmation. Never send these. */
export function displayedMinorUnits(session: AmountSession): number | null {
  return session.editor.kind === "complete" ? session.editor.minorUnits : null;
}

/** The text to save for this session, with the grammar it was typed in and any confirmation it still awaits. */
export function storedAmountOf(session: AmountSession): StoredAmountText {
  return {
    text: session.editor.text,
    format: amountTextFormatOf(session.editor.format.convention),
    ...(session.review ? { review: { reason: session.review.reason, previous: session.review.previous } } : {}),
  };
}

function hasSeparator(text: string) {
  return /[.,]/.test(text);
}

/** The characters an edit wrote where `previous` became `next`: what lies between their common start and end. */
function written(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = 0;
  while (end < previous.length - start && end < next.length - start
    && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end++;
  return next.slice(start, next.length - end);
}

function withText(session: AmountSession, text: string, review: AmountReview | null): AmountSession {
  return { ...session, editor: literalEditor(session.editor.format, text), review: review && hasSeparator(text) ? review : null };
}

/**
 * The session after the native field reported its text. The text is taken as it is. When the edit wrote more than
 * one character and a separator among them, as a paste does, the amount awaits confirmation; a keystroke writes one.
 * A confirmation still pending stays while the text has any separator.
 */
export function withNativeText(session: AmountSession, text: string): AmountSession {
  if (text === session.editor.text) return session;
  const wrote = written(session.editor.text, text);
  const pasted = wrote.length > 1 && hasSeparator(wrote);
  return withText(session, text, pasted ? { reason: "pasted", previous: null } : session.review);
}

/**
 * Writes this currency's decimal mark at `caret`, with a leading 0 when no digit comes before it, and says where the
 * caret goes. Text that already has the mark only moves the caret after it.
 */
export function withDecimalMark(session: AmountSession, caret: number): { session: AmountSession; caret: number } {
  const { text, format } = session.editor;
  const mark = format.convention.decimal;
  const existing = text.indexOf(mark);
  if (existing >= 0) return { session, caret: existing + 1 };
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const insert = /^\s*[+−-]?$/.test(before) ? `0${mark}` : mark;
  return { session: withText(session, before + insert + text.slice(at), session.review), caret: at + insert.length };
}

/** The person confirms the amount shown. */
export function confirmAmount(session: AmountSession): AmountSession {
  return session.review === null ? session : { ...session, review: null };
}

export function amountSign(session: AmountSession): "+" | "-" | "" {
  const sign = session.editor.text.trimStart()[0];
  return sign === "+" ? "+" : sign === "-" || sign === "−" ? "-" : "";
}

/** Writes `sign` in front of the amount and changes nothing else. */
export function withAmountSign(session: AmountSession, sign: "+" | "-"): AmountSession {
  const { text } = session.editor;
  const next = sign + text.trimStart().replace(/^[+−-]/, "");
  return next === text ? session : withText(session, next, session.review);
}

export function toggleAmountSign(session: AmountSession): AmountSession {
  return withAmountSign(session, amountSign(session) === "-" ? "+" : "-");
}
