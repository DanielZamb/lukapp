import { act, type ReactTestInstance } from "react-test-renderer";

/**
 * Types keys into an amount input the way the phone reports them: each key at the end of the text, its text change,
 * then its caret. With `replacing`, the first key replaces the whole text, as typing over a long-press selection does.
 */
export async function typeAmount(input: () => ReactTestInstance, keys: string, options: { replacing?: boolean } = {}) {
  let replacing = options.replacing === true;
  for (const key of keys) {
    const value = replacing ? "" : String(input().props.value ?? "");
    replacing = false;
    await act(async () => input().props.onChangeText(value + key));
    const end = value.length + 1;
    await act(async () => input().props.onSelectionChange?.({ nativeEvent: { selection: { start: end, end } } }));
  }
}
