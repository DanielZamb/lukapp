import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { amountOfMinorUnits, confirmAmount, openAmount, sendableMinorUnits, toggleAmountSign, withNativeText, type AmountSession } from "./session";
import { useFormState } from "./useAmountState";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

type Form = { amount: AmountSession; lines: { id: string; amount: AmountSession }[] };
async function owner(initial: Form) {
  const state = {} as { set: (next: Form | ((now: Form) => Form)) => boolean; read: () => Form; rendered: Form };
  function Owner() {
    const [value, set, read] = useFormState<Form>(initial);
    Object.assign(state, { set, read: read as unknown as () => Form, rendered: value });
    return null;
  }
  await act(async () => { root = create(createElement(Owner)); });
  return state;
}

test("an edit of the amount the state holds is taken; one of an amount the owner replaced is refused whole", async () => {
  const typed = openAmount("COP", "1.00");
  const state = await owner({ amount: typed, lines: [] });
  expect(state.set((now) => ({ ...now, amount: withNativeText(now.amount, "1.000") }))).toBe(true);
  const before = state.read().amount;
  const replaced = openAmount("USD");
  expect(state.set((now) => ({ ...now, amount: replaced }))).toBe(true);
  expect(state.set((now) => ({ ...now, amount: withNativeText(before, "1.0000") }))).toBe(false);
  expect(state.set((now) => ({ ...now, amount: toggleAmountSign(before), lines: [] }))).toBe(false);
  expect(state.read().amount).toBe(replaced);
  expect(state.set((now) => ({ ...now, amount: withNativeText(now.amount, "12") }))).toBe(true);
  expect(sendableMinorUnits(state.read().amount as never, "USD")).toBe(1200);
});

test("an amount the state dropped stays retired, wherever it would return; a new one is taken", async () => {
  const first = amountOfMinorUnits("COP", 500);
  const second = amountOfMinorUnits("COP", 700);
  const state = await owner({ amount: openAmount("COP"), lines: [{ id: "a", amount: first }, { id: "b", amount: second }] });
  expect(state.set((now) => ({ ...now, lines: [now.lines[1]!] }))).toBe(true);
  expect(state.set((now) => ({ ...now, lines: [{ id: "a", amount: confirmAmount(withNativeText(first, "6")) }, ...now.lines] }))).toBe(false);
  expect(state.set((now) => ({ ...now, amount: first }))).toBe(false);
  expect(state.set((now) => ({ ...now, lines: [{ id: "c", amount: openAmount("COP", "6") }, ...now.lines] }))).toBe(true);
  expect(state.read().lines.map((line) => line.id)).toEqual(["c", "b"]);
  expect(state.set((now) => ({ ...now, lines: [...now.lines].reverse() }))).toBe(true);
});

test("an amount is sent only in the currency and grammar it was typed in", () => {
  const cop = openAmount("COP", "1.000") as never;
  expect(sendableMinorUnits(cop, "COP")).toBe(100000);
  expect(sendableMinorUnits(cop, "USD")).toBeNull();
  expect(sendableMinorUnits(openAmount("USD", "1,000") as never, "USD")).toBe(100000);
  expect(sendableMinorUnits(openAmount("USD", "1,000") as never, "COP")).toBeNull();
});
