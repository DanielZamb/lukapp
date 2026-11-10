import {
  createAmountEditor,
  editAmount,
  formatMinorUnits,
  type AmountEdit,
  type AmountEditorState,
  type AmountFormat,
} from "../../../../../src/money/amount";
import { amountFormat } from "./currencyFormat";
import { amountTextFormatOf, openStoredAmountText, type AmountNotice, type StoredAmountText } from "./storedText";

/**
 * One editing session of one amount field, bound to one currency. Every keystroke advances the same session, so
 * the editor keeps knowing which separators it generated. A new currency starts a new session; a language change
 * does not touch it.
 */
export type AmountSession = Readonly<{ currency: string; editor: AmountEditorState }>;

export function openAmountIn(format: AmountFormat, currency: string, text = ""): AmountSession {
  return { currency, editor: createAmountEditor(format, text) };
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

/** A session for saved text, read under the grammar it was saved in. */
export function openSavedAmount(
  currency: string,
  stored: StoredAmountText,
  format: AmountFormat = amountFormat(currency),
): { session: AmountSession; notice: AmountNotice | null } {
  const opened = openStoredAmountText(stored, currency, format);
  return { session: openAmountIn(format, currency, opened.text), notice: opened.notice };
}

/** The signed minor units of a complete amount. Anything else, including incomplete or refused text, is null. */
export function amountMinorUnits(session: AmountSession): number | null {
  return session.editor.kind === "complete" ? session.editor.minorUnits : null;
}

export function amountText(session: AmountSession) {
  return session.editor.text;
}

/** The text to save for this session, with the grammar it was typed in. */
export function storedAmountOf(session: AmountSession): StoredAmountText {
  return { text: session.editor.text, format: amountTextFormatOf(session.editor.format.convention) };
}

export function editAmountSession(session: AmountSession, edit: AmountEdit): AmountSession {
  return { ...session, editor: editAmount(session.editor, edit) };
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
  return { ...session, editor };
}

export function toggleAmountSign(session: AmountSession): AmountSession {
  return withAmountSign(session, amountSign(session) === "-" ? "+" : "-");
}
