import type { AmountSelection } from "../../../../../src/money/amount";
import { editAmountSession, openedEditor, requirePastedReview, withCanonicalGroups, withEditor, type AmountSession } from "./session";

/**
 * What the field knows about the native input beyond its session. React Native reports a person's edit as the
 * whole new text and, separately, the native caret; the field answers by sending its own text and caret, which land
 * only after the native side has reported its caret for the edit.
 *
 * `owed` holds the carets the native side may still report for the last edit, one for each reading the field
 * accepted: such a report describes the native text before the field's answer landed, so it is never applied.
 * After a change the field could not read, the next report is owed whatever it is. A caret the edit did not move may
 * never be reported, so on a platform that reports carets first it is not owed, lest it swallow the next edit's.
 * `before` and `reported` keep the carets reported since the last text change. `order` is which of the two reports
 * this platform sends first for an edit. React Native 0.83 sends the text first for typing on iOS and Android, but a
 * field learns it from its own events: an owed moved caret arriving after the text, or an edit's caret arriving
 * before it. Until then the field accepts only what both orders agree on.
 */
export type NativeTrack = Readonly<{
  text: string;
  selection: AmountSelection;
  owed: readonly Readonly<{ caret: number; moved: boolean }>[] | "any";
  before: AmountSelection | null;
  reported: AmountSelection | null;
  order: "unknown" | "text-first" | "selection-first";
}>;

type Edit = Readonly<{ at: AmountSelection; kind: "replace" | "backward" | "forward"; inserted: string; caret: number }>;
type Reading = Readonly<{ edit: Edit; session: AmountSession; early: boolean }>;
type Result = { session: AmountSession; track: NativeTrack };

export function nativeTrackOf(session: AmountSession, order: NativeTrack["order"] = "unknown"): NativeTrack {
  return { text: session.editor.text, selection: session.editor.selection, owed: [], before: null, reported: null, order };
}

function sameSelection(a: AmountSelection, b: AmountSelection) {
  return a.start === b.start && a.end === b.end;
}

function at(selection: AmountSelection | null, caret: number) {
  return selection !== null && selection.start === caret && selection.end === caret;
}

/** A session the field did not produce itself, such as one its owner replaced, starts a fresh caret history. */
function rebase(track: NativeTrack, session: AmountSession): NativeTrack {
  return track.text === session.editor.text && sameSelection(track.selection, session.editor.selection)
    ? track
    : { ...nativeTrackOf(session, track.order), owed: track.owed };
}

/** Every single edit at `at` that turns `previous` into `next`: the selection replaced, or one character deleted beside a caret. */
function editsAt(previous: string, selection: AmountSelection, next: string): Edit[] {
  const edits: Edit[] = [];
  const head = previous.slice(0, selection.start);
  const tail = previous.slice(selection.end);
  if (next.length >= head.length + tail.length && next.startsWith(head) && next.endsWith(tail)) {
    const inserted = next.slice(head.length, next.length - tail.length);
    edits.push({ at: selection, kind: "replace", inserted, caret: head.length + inserted.length });
  }
  if (selection.start === selection.end) {
    const caret = selection.start;
    if (caret > 0 && previous.slice(0, caret - 1) + previous.slice(caret) === next)
      edits.push({ at: selection, kind: "backward", inserted: "", caret: caret - 1 });
    if (caret < previous.length && previous.slice(0, caret) + previous.slice(caret + 1) === next)
      edits.push({ at: selection, kind: "forward", inserted: "", caret });
  }
  return edits;
}

function moved(edit: Edit) {
  return !at(edit.at, edit.caret);
}

function separators(text: string, session: AmountSession) {
  const { group, decimal } = session.editor.format.convention;
  return [...text].filter((character) => character === group || character === decimal).length;
}

/**
 * New digits and signs are typed one by one, so the editor regroups them as it would a keystroke; nothing in them can
 * be read as another convention's separator. Any other new text is a paste, read literally.
 */
function apply(session: AmountSession, edit: Edit): AmountSession {
  const selected = editAmountSession(session, { kind: "select", selection: edit.at });
  if (edit.kind !== "replace") return editAmountSession(selected, { kind: "delete", direction: edit.kind });
  if (!edit.inserted) return editAmountSession(selected, { kind: "delete", direction: "backward" });
  if (edit.inserted.length === 1 || /^[0-9+−-]+$/.test(edit.inserted))
    return [...edit.inserted].reduce((typed, character) => editAmountSession(typed, { kind: "type", character }), selected);
  const pasted = withCanonicalGroups(editAmountSession(selected, { kind: "paste", text: edit.inserted }));
  return separators(edit.inserted, session) > 0 ? requirePastedReview(pasted) : pasted;
}

function content(session: AmountSession) {
  const { text, generatedGroups, kind } = session.editor;
  return JSON.stringify([text, generatedGroups, kind, session.review]);
}

function outcome(session: AmountSession) {
  return JSON.stringify([content(session), session.editor.selection.start, session.editor.selection.end]);
}

/**
 * A result whose caret the events cannot place. When the field shows the native text unchanged it keeps its own
 * caret, so React Native sends no caret and the native report, in the same text, can be applied. Otherwise the caret
 * goes to the end and the next native report, which describes text the field replaced, is dropped.
 */
function unplaced(session: AmountSession, result: AmountSession, next: string, order: NativeTrack["order"]): Result {
  const { start, end } = session.editor.selection;
  if (result.editor.text === next) {
    const kept = editAmountSession(result, { kind: "select", selection: { start: Math.min(start, next.length), end: Math.min(end, next.length) } });
    const owed = order === "selection-first" || (kept.editor.selection.end === end && kept.editor.selection.start === start) ? [] : "any";
    return { session: kept, track: { ...nativeTrackOf(kept, order), owed } };
  }
  const last = result.editor.text.length;
  const placed = editAmountSession(result, { kind: "select", selection: { start: last, end: last } });
  return { session: placed, track: { ...nativeTrackOf(placed, order), owed: order === "selection-first" ? [] : "any" } };
}

/**
 * The native text as literal input, used when the events cannot identify the edit, so the field never applies a
 * guessed edit. Text that brings new separators awaits confirmation, as a paste does.
 */
function resynchronise(session: AmountSession, next: string, order: NativeTrack["order"]): Result {
  let result = withEditor(session, openedEditor(session.editor.format, next));
  if (separators(next, session) > separators(session.editor.text, session)) result = requirePastedReview(result);
  return unplaced(session, result, next, order);
}

/**
 * Advances the session by the person's edit that turned its text into `next`. The edit is read at the selection the
 * session held before the change and, for a platform that reports the caret first, at the selection before the last
 * report. When the readings leave different text, nothing is guessed: the session restarts from the native text.
 * When they leave the same text, the platform's order chooses the caret, or the caret is not guessed. So an order
 * learned wrongly can misplace a caret, visibly, but never change a digit. Backspace and forward Delete beside two
 * equal characters leave the same text, and touch keyboards have only Backspace, so that pair reads as Backspace.
 */
export function nativeTextChange(session: AmountSession, track: NativeTrack, next: string): Result {
  const known = rebase(track, session);
  const previous = session.editor.text;
  if (next === previous) return { session, track: known };
  const read = (edit: Edit): Reading => ({ edit, session: apply(session, edit), early: moved(edit) && at(known.reported, edit.caret) });
  const current = editsAt(previous, session.editor.selection, next).map(read);
  const prior = known.before ? editsAt(previous, known.before, next).map(read).filter((reading) => reading.early) : [];
  const readings = [...current, ...prior];
  if (!readings.length || new Set(readings.map((reading) => content(reading.session))).size > 1) return resynchronise(session, next, known.order);
  const placed = (candidates: Reading[]) => {
    if (!candidates.length) return undefined;
    if (new Set(candidates.map((reading) => outcome(reading.session))).size === 1) return candidates[0];
    const tie = candidates.length === 2 && candidates.every((reading) => current.includes(reading))
      && candidates.some((reading) => reading.edit.kind === "forward");
    return tie ? candidates.find((reading) => reading.edit.kind === "backward") : undefined;
  };
  const preferred = known.order === "text-first" ? current : known.order === "selection-first" ? prior : readings;
  const chosen = placed(preferred) ?? placed(readings);
  if (chosen) {
    const order = readings.every((reading) => reading.early) ? "selection-first" : known.order;
    const owed = readings.flatMap((reading) => reading.early || (order === "selection-first" && !moved(reading.edit))
      ? [] : [{ caret: reading.edit.caret, moved: moved(reading.edit) }]);
    return { session: chosen.session, track: { ...nativeTrackOf(chosen.session, order), owed } };
  }
  return unplaced(session, readings[0].session, next, known.order);
}

/**
 * Applies a native caret report that refers to the session's own text. The report still owed for the last edit
 * refers to the native text before the field's answer landed, so it is dropped and React Native puts the native
 * caret back at the session's. Receiving it confirms that this platform reports the text first.
 */
export function nativeSelectionChange(session: AmountSession, track: NativeTrack, selection: AmountSelection): Result {
  const known = rebase(track, session);
  const report = { start: selection.start, end: selection.end };
  const { text, selection: current } = session.editor;
  if (known.owed === "any") return { session, track: { ...known, owed: [] } };
  const match = known.owed.find((owed) => at(report, owed.caret));
  if (match) return { session, track: { ...known, owed: [], order: match.moved ? "text-first" : known.order } };
  const settled = { ...known, owed: [] };
  if (report.start < 0 || report.start > report.end || report.end > text.length || sameSelection(report, current))
    return { session, track: { ...settled, reported: report } };
  const next = editAmountSession(session, { kind: "select", selection: report });
  return { session: next, track: { ...settled, selection: report, before: current, reported: report } };
}
