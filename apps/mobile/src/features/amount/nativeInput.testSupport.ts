import { act, type ReactTestInstance } from "react-test-renderer";

export type Selection = { start: number; end: number };
export type NativeOptions = {
  platform: "ios" | "android";
  /** The order in which the platform reports a person's edit: the new text first, or the new caret first. */
  order: "text-first" | "selection-first";
  /** Whether iOS reports the caret after an edit that left its offset unchanged, such as a forward Delete. */
  reportUnmoved?: boolean;
};

const same = (a: Selection, b: Selection) => a.start === b.start && a.end === b.end;

/**
 * A stand-in for the native text field behind React Native's controlled TextInput (RN 0.83). The person's edits
 * change the native text and caret first and are reported as events; the field's re-render then sends the native
 * side a command that lands only after those events, and only while no newer native edit exists. iOS reports
 * nothing for a command; Android reports the caret it passes through while applying one.
 */
export function nativeInput(field: () => ReactTestInstance, options: NativeOptions) {
  let text: string = field().props.value;
  let selection: Selection = field().props.selection;
  let count = 0;
  let dispatched: Selection = selection;
  let lastNativeText = text;
  let lastNativeSelection: Selection = selection;
  let mostRecentEventCount = 0;
  const commands: Array<{ count: number; text: string; selection: Selection }> = [];
  const log: string[] = [];

  function rendered() {
    const value: string = field().props.value;
    const shown: Selection = field().props.selection;
    log.push(`  field ${JSON.stringify(value)}@${shown.start}-${shown.end}`);
    const update = value !== lastNativeText || !same(shown, lastNativeSelection);
    lastNativeText = value;
    lastNativeSelection = shown;
    if (update) commands.push({ count: mostRecentEventCount, text: value, selection: shown });
  }
  async function reportText(next: string) {
    log.push(`text ${JSON.stringify(next)}`);
    await act(async () => field().props.onChangeText(next));
    lastNativeText = next;
    mostRecentEventCount = count;
    rendered();
  }
  async function reportSelection(next: Selection) {
    log.push(`selection ${next.start}-${next.end}`);
    await act(async () => field().props.onSelectionChange({ nativeEvent: { selection: next } }));
    lastNativeSelection = next;
    rendered();
  }
  async function moveNativeCaret(next: Selection) {
    selection = next;
    if (options.platform === "android" && !same(next, dispatched)) {
      dispatched = next;
      await reportSelection(next);
    }
  }
  async function land() {
    while (commands.length) {
      const command = commands.shift()!;
      if (options.platform === "ios" ? command.count !== count : command.count < count) { log.push("  command dropped"); continue; }
      if (command.text !== text) {
        const caret = selection.end;
        const old = text.length;
        text = command.text;
        const passing = caret > 0 && caret < old ? Math.floor((caret * text.length) / old) : caret === 0 ? 0 : text.length;
        await moveNativeCaret({ start: passing, end: passing });
      }
      const target = { start: Math.min(command.selection.start, text.length), end: Math.min(command.selection.end, text.length) };
      if (options.platform === "ios") { selection = target; dispatched = target; } else await moveNativeCaret(target);
    }
  }
  async function edit(next: string, caret: Selection) {
    text = next;
    count++;
    const moved = !same(caret, dispatched) || (options.platform === "ios" && options.reportUnmoved === true);
    selection = caret;
    if (moved) dispatched = caret;
    if (options.order === "selection-first" && moved) await reportSelection(caret);
    await reportText(next);
    if (options.order === "text-first" && moved) await reportSelection(caret);
    await land();
  }
  function replace(start: number, end: number, inserted: string) {
    return edit(text.slice(0, start) + inserted + text.slice(end), { start: start + inserted.length, end: start + inserted.length });
  }

  return {
    get text() { return text; },
    get selection() { return selection; },
    log,
    /** Types one character over the current selection. */
    type: (character: string) => replace(selection.start, selection.end, character),
    paste: (pasted: string) => replace(selection.start, selection.end, pasted),
    backspace: () => selection.start !== selection.end ? replace(selection.start, selection.end, "")
      : selection.start === 0 ? Promise.resolve() : edit(text.slice(0, selection.start - 1) + text.slice(selection.start),
        { start: selection.start - 1, end: selection.start - 1 }),
    forwardDelete: () => selection.start !== selection.end ? replace(selection.start, selection.end, "")
      : selection.end === text.length ? Promise.resolve() : edit(text.slice(0, selection.end) + text.slice(selection.end + 1),
        { start: selection.end, end: selection.end }),
    /** An input method or autocorrect replacing a span, leaving the caret after the replacement. */
    replaceSpan: (start: number, end: number, inserted: string) => replace(start, end, inserted),
    /** The platform's undo, putting back an earlier text with its caret. */
    restore: (earlier: string, caret: number) => edit(earlier, { start: caret, end: caret }),
    /** The same text reported again, as some input methods do. */
    async repeat() { count++; await reportText(text); await land(); },
    async select(start: number, end = start) {
      selection = { start, end };
      if (!same(selection, dispatched)) { dispatched = selection; await reportSelection(selection); }
      await land();
    },
    /** A button outside the text field: its press re-renders the field, which sends the native side a command. */
    async press(onPress: () => void) {
      await act(async () => onPress());
      rendered();
      await land();
    },
    /** The text and caret the person sees equal the field's own. */
    agrees() {
      return text === field().props.value && same(selection, field().props.selection);
    },
  };
}
