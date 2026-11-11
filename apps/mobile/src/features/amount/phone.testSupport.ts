import { act, type ReactTestInstance } from "react-test-renderer";

export type Caret = { start: number; end: number };

/**
 * The native text field and keyboard behind a React Native TextInput, as recorded on a Samsung Galaxy S21 FE with
 * Samsung Keyboard (fixtures in ./fixtures). An edit changes the native text and caret, then reports the text and,
 * when the caret moved, the caret. Typing over a range and pasting first report a stale collapsed caret. A text or
 * caret the JavaScript side renders differently from what native last reported is a command that lands only while no
 * newer native edit exists, as React Native's event count rule does; `racing` lets the next edit come first. The
 * input is focused, as it is while the person types; a remounted input is focused again, as autoFocus does.
 */
export function samsungPhone(input: () => ReactTestInstance) {
  let node = input();
  node.props.onFocus?.();
  let text: string = node.props.value;
  let caret: Caret = { start: text.length, end: text.length };
  let count = 0;
  let seen = 0;
  let reportedText = text;
  let reportedCaret: Caret | null = null;
  const pending: Array<{ count: number; text: string; caret: Caret | undefined }> = [];
  const log: string[] = [];

  function observe() {
    const current = input();
    if (current !== node) {
      node = current;
      node.props.onFocus?.();
      text = current.props.value;
      caret = { start: text.length, end: text.length };
      reportedText = text;
      reportedCaret = null;
      seen = count;
      pending.length = 0;
      log.push(`remount ${JSON.stringify(text)}`);
      return;
    }
    const value: string = current.props.value;
    const selection: Caret | undefined = current.props.selection;
    const moved = selection && (!reportedCaret || selection.start !== reportedCaret.start || selection.end !== reportedCaret.end);
    if (value !== reportedText || moved) {
      pending.push({ count: seen, text: value, caret: selection });
      reportedText = value;
      if (selection) reportedCaret = selection;
    }
  }
  async function deliverText(next: string) {
    log.push(`text ${JSON.stringify(next)}`);
    seen = count;
    reportedText = next;
    const target = node;
    await act(async () => target.props.onChangeText?.(next));
    observe();
  }
  async function deliverCaret(next: Caret) {
    log.push(`caret ${next.start}-${next.end}`);
    reportedCaret = next;
    const target = node;
    await act(async () => target.props.onSelectionChange?.({ nativeEvent: { selection: next } }));
    observe();
  }
  async function land() {
    while (pending.length) {
      const command = pending.shift()!;
      if (command.count < count) { log.push("  command dropped"); continue; }
      text = command.text;
      caret = command.caret ?? { start: Math.min(caret.start, text.length), end: Math.min(caret.end, text.length) };
      if (command.caret) await deliverCaret(caret);
    }
  }
  type Change = (current: string, at: Caret) => { next: string; at: Caret } | null;
  async function edit(change: Change, options: { racing?: boolean; stale?: boolean; reportCaret?: boolean } = {}) {
    observe();
    if (!options.racing) await land();
    const result = change(text, caret);
    if (!result) return;
    if (options.stale) await deliverCaret({ start: caret.end, end: caret.end });
    const moved = result.at.start !== caret.start || result.at.end !== caret.end;
    text = result.next;
    caret = result.at;
    count += 1;
    await deliverText(result.next);
    if (moved && options.reportCaret !== false) await deliverCaret(result.at);
    await land();
  }
  const insert = (inserted: string): Change => (current, at) => {
    const end = at.start + inserted.length;
    return { next: current.slice(0, at.start) + inserted + current.slice(at.end), at: { start: end, end } };
  };

  return {
    log,
    get text() { return text; },
    get caret() { return caret; },
    /** Types each key at the native caret: digits, ".", ",", "-". */
    async type(keys: string, options: { racing?: boolean } = {}) {
      for (const key of keys) await edit(insert(key), { ...options, stale: caret.start !== caret.end });
    },
    async backspace(options: { racing?: boolean } = {}) {
      await edit((current, at) => {
        if (at.start !== at.end) return insert("")(current, at);
        if (at.start === 0) return null;
        return { next: current.slice(0, at.start - 1) + current.slice(at.end), at: { start: at.start - 1, end: at.start - 1 } };
      }, options);
    },
    /** The ".-" key tapped twice quickly: the composing "." before the caret becomes "-" and no caret is reported. */
    async cycleDotToMinus() {
      await edit((current, at) => {
        if (current[at.start - 1] !== ".") throw new Error("No composing point before the caret");
        return { next: current.slice(0, at.start - 1) + "-" + current.slice(at.start), at };
      }, { reportCaret: false });
    },
    /** A tap or long-press in the text, reported as one caret or range. */
    async select(start: number, end = start) {
      observe();
      await land();
      caret = { start, end };
      await deliverCaret(caret);
    },
    /** Paste from the context menu or the keyboard's clipboard: the whole clip in one change. */
    async paste(clip: string) {
      await edit(insert(clip), { stale: true });
    },
    /**
     * A control outside the text field, such as the field's own keys. What it renders lands before the next native
     * edit, unless `hold` keeps it pending so a racing keystroke can come first.
     */
    async press(control: ReactTestInstance, options: { hold?: boolean } = {}) {
      observe();
      await act(async () => control.props.onPress());
      observe();
      if (!options.hold) await land();
    },
    /** Lands what the field asked the native side to show. */
    settle: land,
    /** Delivers a text change to a handler of the input shown before a remount, as an event still in flight would. */
    async deliverToStale(handler: (text: string) => void, next: string) {
      await act(async () => handler(next));
      observe();
    },
  };
}
