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
 * Why the amount shown still awaits the person's confirmation. The two reasons are kept apart because different edits
 * resolve them, and confirming the amount resolves both.
 *
 * `pasted`: several characters arrived at once carrying a separator, as a paste does. It ends when the text has no
 * separator left, since digits alone read the same in every convention.
 *
 * `converted`: the app rewrote a saved amount from an older format; `previous` is the text it was saved as. It ends
 * only when the text is cleared, since until then some of the rewrite is still there: a sign change, a digit or a
 * deleted separator leaves the rest of it unconfirmed.
 */
export type AmountReview = Readonly<{ pasted: boolean; converted: Readonly<{ previous: string | null }> | null }>;

export type AmountSign = "" | "+" | "-";

/**
 * One editing session of one amount field, bound to one currency. The native text is exactly what the native field
 * shows: the app never regroups it while the person types. The sign is held beside it, set by the sign key or the
 * owner and never written into the native text, so no keystroke racing the sign key can drop it. `editor` reads the
 * sign followed by the native text with the strict grammar; a sign typed into the native text as well reads as two
 * signs and is refused. A new currency starts a new session; a language change does not touch it.
 */
export type AmountSession = Readonly<{
  currency: string;
  sign: AmountSign;
  editor: AmountEditorState;
  review: AmountReview | null;
}>;

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

/** The text the native field shows: the session's text without the sign held beside it. */
export function nativeText(session: AmountSession): string {
  return session.editor.text.slice(session.sign.length);
}

function signed(format: AmountFormat, sign: AmountSign, native: string): Pick<AmountSession, "sign" | "editor"> {
  return { sign, editor: literalEditor(format, sign + native) };
}

/** Text the app opens, with its leading sign moved beside the native text. */
function opening(format: AmountFormat, text: string): Pick<AmountSession, "sign" | "editor"> {
  const sign = /^\s*([+−-])/.exec(text);
  if (!sign) return signed(format, "", text);
  return signed(format, sign[1] === "+" ? "+" : "-", text.slice(sign[0].length));
}

export function openAmountIn(format: AmountFormat, currency: string, text = ""): AmountSession {
  return { currency, ...opening(format, openedText(format, text)), review: null };
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

function reviewOf(reason: AmountReviewReason, previous: string | null): AmountReview {
  return reason === "converted" ? { pasted: false, converted: { previous } } : { pasted: true, converted: null };
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
  const awaiting = (reason: AmountReviewReason, previous: string | null): AmountSession =>
    ({ currency, ...opening(format, opened.text), review: reviewOf(reason, previous) });
  if (opened.notice?.kind === "converted")
    return { session: awaiting("converted", stored.review?.previous ?? opened.notice.previous), notice: opened.notice };
  if (stored.review && !opened.notice) return { session: awaiting(stored.review.reason, stored.review.previous), notice: null };
  return { session: openAmountIn(format, currency, opened.text), notice: opened.notice };
}

declare const atPress: unique symbol;
/** An amount read from its owner's state at the moment of a press. Only `useAmountState` hands one out. */
export type AmountAtPress = AmountSession & { readonly [atPress]: true };

/**
 * Whether the amount may be sent: complete and not awaiting the person's confirmation. For enabling a control while
 * rendering; a handler sends `sendableMinorUnits` of the amount it reads.
 */
export function amountSendable(session: AmountSession): boolean {
  return session.editor.kind === "complete" && session.review === null;
}

/** The signed minor units to send, of an amount read at the moment of the press; null when it may not be sent. */
export function sendableMinorUnits(amount: AmountAtPress): number | null {
  return amountSendable(amount) ? displayedMinorUnits(amount) : null;
}

/**
 * The signed minor units a saved amount sends as it opens in `currency`'s editor, or null when opening it asks the
 * person to confirm it or type it again, or it is not a whole amount. This is the one answer to whether a saved
 * amount may be sent as it is, for the single-entry form and for any batch alike.
 */
export function savedAmountAsOpened(currency: string, stored: StoredAmountText): number | null {
  const { session } = openSavedAmount(currency, stored);
  return amountSendable(session) ? displayedMinorUnits(session) : null;
}

/** The signed minor units the field shows, whether or not they still await confirmation. Never send these. */
export function displayedMinorUnits(session: AmountSession): number | null {
  return session.editor.kind === "complete" ? session.editor.minorUnits : null;
}

/**
 * The text to save for this session, with the grammar it was typed in and any confirmation it still awaits. A pending
 * conversion is saved over a pending paste: it reopens awaiting confirmation through every edit a paste would, and more.
 */
export function storedAmountOf(session: AmountSession): StoredAmountText {
  const { review } = session;
  const stored = review?.converted ? { reason: "converted" as const, previous: review.converted.previous }
    : review?.pasted ? { reason: "pasted" as const, previous: null } : null;
  return {
    text: session.editor.text,
    format: amountTextFormatOf(session.editor.format.convention),
    ...(stored ? { review: stored } : {}),
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

function isBlank(text: string) {
  return /^\s*[+−-]?\s*$/.test(text);
}

/** The confirmation still awaited once the text is `text`; `pasted` says the edit itself wrote like a paste. */
function reviewAfter(review: AmountReview | null, text: string, pasted: boolean): AmountReview | null {
  const next = {
    pasted: pasted || (review?.pasted === true && hasSeparator(text)),
    converted: isBlank(text) ? null : review?.converted ?? null,
  };
  if (!next.pasted && !next.converted) return null;
  return review && review.pasted === next.pasted && review.converted === next.converted ? review : next;
}

function withText(session: AmountSession, native: string, pasted = false): AmountSession {
  return { ...session, ...signed(session.editor.format, session.sign, native), review: reviewAfter(session.review, native, pasted) };
}

/**
 * The session after the native field reported its text in a change event, the one report React Native orders against
 * the field's own writes: a write sent before the edit is dropped, one applied before it is part of the text. The text
 * is taken as it is. When the edit wrote more than one character and a separator among them, as a paste does, the
 * amount awaits confirmation; a keystroke writes one.
 */
export function withNativeText(session: AmountSession, text: string): AmountSession {
  const before = nativeText(session);
  if (text === before) return session;
  const wrote = written(before, text);
  return withText(session, text, wrote.length > 1 && hasSeparator(wrote));
}

/**
 * Writes this currency's decimal mark at `caret` in the native text, with a leading 0 when no digit comes before it,
 * and says where the caret goes. Text that already has the mark only moves the caret after it.
 */
export function withDecimalMark(session: AmountSession, caret: number): { session: AmountSession; caret: number } {
  const text = nativeText(session);
  const mark = session.editor.format.convention.decimal;
  const existing = text.indexOf(mark);
  if (existing >= 0) return { session, caret: existing + 1 };
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const insert = /^\s*[+−-]?$/.test(before) ? `0${mark}` : mark;
  const placed = at + insert.length;
  return { session: withText(session, before + insert + text.slice(at)), caret: placed };
}

/** How many digits come before the decimal mark, or null without one. */
function wholeDigits(session: AmountSession): number | null {
  const { text } = session.editor;
  const at = text.indexOf(session.editor.format.convention.decimal);
  return at < 0 ? null : text.slice(0, at).replace(/\D/g, "").length;
}

/**
 * Whether the reading moved in a way a glance could misread, measured from `seen`, the last amount the person could
 * read: the decimal mark appeared or now has a different number of digits before it, or the value changed tenfold
 * or more either way. Nothing is inferred about how the change was made.
 */
export function readingShifted(seen: AmountSession | null, next: AmountSession): boolean {
  const before = seen ? displayedMinorUnits(seen) : null;
  const after = displayedMinorUnits(next);
  if (!seen || before === null || after === null) return false;
  const mark = wholeDigits(next);
  if (mark !== null && mark !== wholeDigits(seen)) return true;
  const was = Math.abs(before);
  const is = Math.abs(after);
  return was !== 0 && is !== 0 && (is >= 10 * was || was >= 10 * is);
}

/** The person confirms the amount shown. */
export function confirmAmount(session: AmountSession): AmountSession {
  return session.review === null ? session : { ...session, review: null };
}

export function amountSign(session: AmountSession): AmountSign {
  return session.sign;
}

/** Sets the sign held beside the native text and changes nothing else, including what still awaits confirmation. */
export function withAmountSign(session: AmountSession, sign: "+" | "-"): AmountSession {
  return sign === session.sign ? session : { ...session, ...signed(session.editor.format, sign, nativeText(session)) };
}

export function toggleAmountSign(session: AmountSession): AmountSession {
  return withAmountSign(session, session.sign === "-" ? "+" : "-");
}
