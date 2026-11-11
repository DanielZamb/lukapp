import { act, type ReactTestInstance } from "react-test-renderer";

export type Caret = { start: number; end: number };

/**
 * The native text field and keyboard behind a React Native TextInput, as recorded on a Samsung Galaxy S21 FE with
 * Samsung Keyboard (fixtures in ./fixtures). An edit changes the native text and caret, then reports the text and,
 * when the caret moved, the caret. Typing over a range and pasting first report a stale collapsed caret. A text or
 * caret the JavaScript side renders differently from what native last reported is a command that lands only while no
 * newer native edit exists, as React Native's event count rule does; `racing` lets the next edit come first. A landed
 * command that placed the caret reports that caret on Android and nothing on iOS, which applies a JavaScript write
 * with `notifyDelegate:NO` (RCTTextInputComponentView.mm, setTextAndSelection). The input is focused, as it is while
 * the person types; a remounted input is focused only when it asks for autoFocus.
 */
export function samsungPhone(input: () => ReactTestInstance, options: { platform?: "android" | "ios" } = {}) {
  const platform = options.platform ?? "android";
  let node = input();
  node.props.onFocus?.();
  let focused = true;
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
      focused = current.props.autoFocus === true;
      if (focused) node.props.onFocus?.();
      text = current.props.value;
      caret = { start: text.length, end: text.length };
      reportedText = text;
      reportedCaret = null;
      seen = count;
      pending.length = 0;
      log.push(`remount ${JSON.stringify(text)}${focused ? "" : " unfocused"}`);
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
      if (command.caret && platform === "android") await deliverCaret(caret);
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
    /** Whether the native input holds focus, so the keyboard is open on it. */
    get focused() { return focused; },
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

/**
 * The amount a person reads in `visible` (the sign shown beside the field, then the field's text), by a strict reading
 * of the convention written apart from the app's grammar: COP groups with "." and marks decimals with ",", USD the
 * other way round.
 */
export function readsAs(visible: string, cop: boolean, precision: number): number | null {
  const group = cop ? "\\." : ",";
  const decimal = cop ? "," : "\\.";
  const match = new RegExp(`^([+−-]?)(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${decimal}(\\d+))?$`).exec(visible.trim());
  if (!match || (match[3] !== undefined && (precision === 0 || match[3].length > precision))) return null;
  const v = Number(match[2].replace(/[.,]/g, "")) * 10 ** precision + Number((match[3] ?? "").padEnd(precision, "0") || "0");
  if (!Number.isSafeInteger(v)) return null;
  return match[1] && match[1] !== "+" && v ? -v : v;
}

type NativeEvent = { node: ReactTestInstance; text: string } & (
  | { kind: "change"; eventCount: number }
  | { kind: "selection"; selection: Caret }
  | { kind: "focus" | "blur" | "endEditing" });
type Command = { count: number; text: string; selection: Caret | undefined };

/**
 * One React Native 0.83 TextInput and the native view behind it, with each direction queued so a test can choose the
 * interleaving. What JavaScript renders differently from what React Native last pushed or heard becomes a
 * setTextAndSelection command carrying the event count JavaScript last saw (TextInput.js, the synchronization hook).
 * The native view applies a command only while no native edit came after that count (ReactEditText.kt
 * `canUpdateWithEventCount`, RCTTextInputComponentView.mm `setTextAndSelection`) and never reports its text; Android
 * reports the caret it placed while focused (ReactTextSelectionWatcher.kt), iOS reports nothing. Native edits happen
 * only while focused, count one event each, and report the text, then the caret if it moved. Every event carries the
 * text on iOS (TextInputEventEmitter.cpp); on Android only change and end-of-editing do. Ending editing reports blur
 * and end-of-editing (ReactTextInputManager.kt focus listener; RCTTextInputComponentView.mm `textInputDidEndEditing`).
 * A new input, one with another key, is a new native view holding the rendered text and focused only with autoFocus;
 * commands for the old view are discarded and its events still in flight arrive at the old handlers.
 */
export function reactNativeInput(input: () => ReactTestInstance, platform: "android" | "ios") {
  let node = input();
  let text: string = node.props.value ?? "";
  let caret: Caret = { start: text.length, end: text.length };
  let watched: Caret = caret;
  let focused = false;
  let count = 0;
  let heard = 0;
  let pushedText = text;
  let pushedSelection: Caret | null = null;
  const commands: Command[] = [];
  const events: NativeEvent[] = [];
  let dropped = 0;
  const same = (a: Caret | null, b: Caret) => !!a && a.start === b.start && a.end === b.end;
  const clamp = (at: Caret): Caret => ({ start: Math.min(at.start, text.length), end: Math.min(at.end, text.length) });

  function reportCaret() {
    if (same(watched, caret)) return;
    watched = caret;
    events.push({ node, text, kind: "selection", selection: caret });
  }
  function focus() {
    focused = true;
    events.push({ node, text, kind: "focus" });
    if (platform === "android") reportCaret();
  }
  function observe() {
    const current = input();
    if (current !== node) {
      node = current;
      text = node.props.value ?? "";
      caret = watched = { start: text.length, end: text.length };
      count = heard = 0;
      pushedText = text;
      pushedSelection = null;
      commands.length = 0;
      focused = false;
      if (node.props.autoFocus === true) focus();
      return;
    }
    const value: string = node.props.value ?? "";
    const selection: Caret | undefined = node.props.selection;
    const moved = !!selection && !same(pushedSelection, selection);
    if (value === pushedText && !moved) return;
    commands.push({ count: heard, text: value, selection });
    pushedText = value;
    if (selection) pushedSelection = selection;
  }
  function edit(change: (current: string, at: Caret) => { text: string; caret: Caret } | null) {
    if (!focused) return;
    const result = change(text, caret);
    if (!result || result.text === text) return;
    text = result.text;
    caret = result.caret;
    count += 1;
    events.push({ node, text, kind: "change", eventCount: count });
    reportCaret();
  }
  function stage(native: () => void) {
    observe();
    native();
  }

  return {
    get text() { return text; },
    get focused() { return focused; },
    get dropped() { return dropped; },
    /** Whether the phone reported an edit JavaScript has not received yet: no app can know that text. */
    get reporting() { return events.some((event) => event.kind === "change"); },
    /** A key of the phone's pad at the native caret: a digit, ".", "," or "-". */
    key(key: string) {
      stage(() => edit((current, at) => {
        const end = at.start + key.length;
        return { text: current.slice(0, at.start) + key + current.slice(at.end), caret: { start: end, end } };
      }));
    },
    backspace() {
      stage(() => edit((current, at) => {
        if (at.start !== at.end) return { text: current.slice(0, at.start) + current.slice(at.end), caret: { start: at.start, end: at.start } };
        if (at.start === 0) return null;
        return { text: current.slice(0, at.start - 1) + current.slice(at.end), caret: { start: at.start - 1, end: at.start - 1 } };
      }));
    },
    /** A tap in the text, which focuses the field first if it was not. */
    tap(at: number) {
      stage(() => {
        if (!focused) focus();
        caret = clamp({ start: at, end: at });
        reportCaret();
      });
    },
    /** The keyboard's Done, or a tap elsewhere: editing ends. */
    done() {
      stage(() => {
        if (!focused) return;
        focused = false;
        const order: Array<"blur" | "endEditing"> = platform === "android" ? ["blur", "endEditing"] : ["endEditing", "blur"];
        for (const kind of order) events.push({ node, text, kind });
      });
    },
    /** The native view runs the oldest command JavaScript sent it. */
    apply() {
      observe();
      const command = commands.shift();
      if (!command) return;
      if (command.count < count) { dropped += 1; return; }
      text = command.text;
      caret = clamp(command.selection ?? caret);
      if (focused && platform === "android") reportCaret();
    },
    /** JavaScript receives the oldest event the native view sent. */
    async deliver() {
      const event = events.shift();
      if (!event) return;
      const target = event.node;
      const carried = platform === "ios" ? { text: event.text } : {};
      await act(async () => {
        if (event.kind === "change") target.props.onChangeText?.(event.text);
        else if (event.kind === "selection") target.props.onSelectionChange?.({ nativeEvent: { selection: event.selection, ...carried } });
        else if (event.kind === "focus") target.props.onFocus?.({ nativeEvent: carried });
        else if (event.kind === "blur") target.props.onBlur?.({ nativeEvent: carried });
        else target.props.onEndEditing?.({ nativeEvent: { text: event.text } });
      });
      if (target === node && event.kind === "change") { pushedText = event.text; heard = event.eventCount; }
      if (target === node && event.kind === "selection") pushedSelection = event.selection;
      observe();
    },
    /** A control outside the input, such as the field's own keys. */
    async press(control: ReactTestInstance) {
      observe();
      await act(async () => control.props.onPress());
      observe();
    },
    /** Every command runs and every event arrives, until both directions are quiet. */
    async quiesce() {
      observe();
      while (events.length + commands.length > 0) {
        if (commands.length) this.apply();
        else await this.deliver();
      }
    },
  };
}
