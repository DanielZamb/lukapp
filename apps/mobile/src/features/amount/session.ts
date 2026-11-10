import {
  createAmountEditor,
  editAmount,
  formatMinorUnits,
  type AmountEdit,
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
 * An amount the person must confirm before it is sent: text the app rewrote from an older saved format, or pasted
 * text that carried a separator. `minorUnits` is the magnitude shown for confirmation; once the amount becomes any
 * other number the person has typed it themselves and the requirement is gone.
 */
export type AmountReview = Readonly<{ reason: AmountReviewReason; previous: string | null; minorUnits: number }>;

/**
 * One editing session of one amount field, bound to one currency. Every keystroke advances the same session, so
 * the editor keeps knowing which separators it generated. A new currency starts a new session; a language change
 * does not touch it.
 */
export type AmountSession = Readonly<{ currency: string; editor: AmountEditorState; review: AmountReview | null }>;

/**
 * The editor for opened text. Text already written exactly as the editor would group it, such as a saved amount
 * or one the app formatted, gets the separators it would have had if typed, so a later digit regroups it instead of
 * leaving a short or long group. Anything else opens literally.
 */
export function openedEditor(format: AmountFormat, text: string): AmountEditorState {
  const literal = createAmountEditor(format, text);
  if (literal.kind !== "complete") return literal;
  const typed = createAmountEditor(format, literal.text.split(format.convention.group).join(""));
  return typed.text === literal.text ? typed : literal;
}

/** The session with its canonical text's separators treated as the editor's own, keeping its caret. */
export function withCanonicalGroups(session: AmountSession): AmountSession {
  const { editor } = session;
  const opened = openedEditor(editor.format, editor.text);
  return opened.text === editor.text && opened.generatedGroups.length > editor.generatedGroups.length
    ? withEditor(session, editAmount(opened, { kind: "select", selection: editor.selection }))
    : session;
}

export function openAmountIn(format: AmountFormat, currency: string, text = ""): AmountSession {
  return { currency, editor: openedEditor(format, text), review: null };
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

function magnitude(editor: AmountEditorState) {
  return editor.kind === "complete" ? Math.abs(editor.minorUnits) : null;
}

function requireReview(session: AmountSession, reason: AmountReviewReason, previous: string | null): AmountSession {
  const minorUnits = magnitude(session.editor);
  return minorUnits === null ? session : { ...session, review: { reason, previous, minorUnits } };
}

/**
 * A session for saved text, read under the grammar it was saved in. Text the app rewrote into the current format,
 * and text saved while it still awaited confirmation, open awaiting confirmation.
 */
export function openSavedAmount(
  currency: string,
  stored: StoredAmountText,
  format: AmountFormat = amountFormat(currency),
): { session: AmountSession; notice: AmountNotice | null } {
  const opened = openStoredAmountText(stored, currency, format);
  const session = openAmountIn(format, currency, opened.text);
  if (opened.notice?.kind === "converted")
    return { session: requireReview(session, "converted", stored.review?.previous ?? opened.notice.previous), notice: opened.notice };
  if (stored.review && !opened.notice) return { session: requireReview(session, stored.review.reason, stored.review.previous), notice: null };
  return { session, notice: opened.notice };
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

/** The session with a new editor state. A confirmation still applies only while the amount keeps its magnitude. */
export function withEditor(session: AmountSession, editor: AmountEditorState): AmountSession {
  const review = session.review && magnitude(editor) === session.review.minorUnits ? session.review : null;
  return { ...session, editor, review };
}

export function editAmountSession(session: AmountSession, edit: AmountEdit): AmountSession {
  return withEditor(session, editAmount(session.editor, edit));
}

/** Pasted text that carried a separator must be confirmed before it is sent, so a copied 1.234 is never sent unseen. */
export function requirePastedReview(session: AmountSession): AmountSession {
  return requireReview(session, "pasted", null);
}

/** The person confirms the amount shown. */
export function confirmAmount(session: AmountSession): AmountSession {
  return session.review === null ? session : { ...session, review: null };
}

export function amountSign(session: AmountSession): "+" | "-" | "" {
  const sign = session.editor.text.trimStart()[0];
  return sign === "+" ? "+" : sign === "-" || sign === "−" ? "-" : "";
}

/** Writes `sign` in front of the amount without retyping it, so its digits, grouping and caret stay as they were. */
export function withAmountSign(session: AmountSession, sign: "+" | "-"): AmountSession {
  const current = amountSign(session);
  if (current === sign && session.editor.text.startsWith(sign)) return session;
  const { text, selection } = session.editor;
  const signed = /^[+−-]/.test(text);
  let editor = editAmount(session.editor, { kind: "select", selection: { start: 0, end: signed ? 1 : 0 } });
  editor = editAmount(editor, { kind: "type", character: sign });
  const fromEnd = text.length - selection.end;
  const caret = Math.max(1, Math.min(editor.text.length, editor.text.length - fromEnd));
  editor = editAmount(editor, { kind: "select", selection: { start: caret, end: caret } });
  return withEditor(session, editor);
}

export function toggleAmountSign(session: AmountSession): AmountSession {
  return withAmountSign(session, amountSign(session) === "-" ? "+" : "-");
}
