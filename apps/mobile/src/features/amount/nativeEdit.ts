import type { AmountSelection } from "../../../../../src/money/amount";
import { editAmountSession, type AmountSession } from "./session";

/** What changed between two texts: `[start, end)` of the old text became `inserted`. */
export type TextChange = Readonly<{ start: number; end: number; inserted: string }>;

/**
 * React Native reports the field's whole new text, not the key that was pressed. The change is the old selection
 * replaced by the new characters when that explains the new text, and otherwise the span between the longest
 * shared prefix and suffix. Both explanations produce exactly the new text; they differ at most in which of several
 * identical neighbouring characters was the new one.
 */
export function textChange(previous: string, selection: AmountSelection, next: string): TextChange {
  const tail = previous.length - selection.end;
  const inserted = next.length - selection.start - tail;
  if (inserted >= 0 && next.startsWith(previous.slice(0, selection.start)) && next.endsWith(previous.slice(selection.end)))
    return { start: selection.start, end: selection.end, inserted: next.slice(selection.start, selection.start + inserted) };
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return { start: prefix, end: previous.length - suffix, inserted: next.slice(prefix, next.length - suffix) };
}

/**
 * Advances the session by the edit that turned its text into `next`. One new character is typed, so the editor can
 * regroup it and recognise its own separators. Several new characters are a paste, read literally. A removed
 * character is a Backspace at the caret, or the removal of the selected span.
 */
export function applyNativeText(session: AmountSession, next: string): AmountSession {
  const { text, selection } = session.editor;
  if (next === text) return session;
  const change = textChange(text, selection, next);
  const collapsed = selection.start === selection.end;
  if (!change.inserted) {
    const single = change.end - change.start === 1;
    if (single && collapsed && (selection.end === change.end || selection.end === change.start)) {
      const at = selection.end;
      return editAmountSession(editAmountSession(session, { kind: "select", selection: { start: at, end: at } }),
        { kind: "delete", direction: at === change.end ? "backward" : "forward" });
    }
    return editAmountSession(editAmountSession(session, { kind: "select", selection: { start: change.start, end: change.end } }),
      { kind: "delete", direction: "backward" });
  }
  const selected = editAmountSession(session, { kind: "select", selection: { start: change.start, end: change.end } });
  return change.inserted.length === 1
    ? editAmountSession(selected, { kind: "type", character: change.inserted })
    : editAmountSession(selected, { kind: "paste", text: change.inserted });
}

/** The caret React Native shows right after the change, before the field re-renders with the session's text. */
export function nativeCaretAfter(session: AmountSession, next: string): number {
  const change = textChange(session.editor.text, session.editor.selection, next);
  return change.start + change.inserted.length;
}
