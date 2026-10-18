import * as React from "react";
import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HomePlaceSetup } from "./HomePlaceSetup";
import type { PendingPosting } from "./posting/pendingPostingSchema";
import type { LoadResult, PostingTransport } from "./posting/usePostingEditor";

const state = vi.hoisted(() => ({
  blocked: false,
  fail: false,
  push: vi.fn(), reset: vi.fn(), close: vi.fn(), present: vi.fn(), dismiss: vi.fn(),
  load: vi.fn(), save: vi.fn(), post: vi.fn(), clear: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: state.push }, useNavigation: () => ({ dispatch: state.reset }) }));
vi.mock("../local-auth/interaction", () => ({ useLocalEntryInteraction: () => vi.fn() }));
vi.mock("./posting/usePostingTransport", () => {
  const transport: PostingTransport = {
  load: async (...args) => {
    state.load(...args);
    return state.blocked ? { kind: "blocked" } : { kind: "none" } satisfies LoadResult;
  },
  save: async (command) => {
    state.save(command);
    return { id: "setup-draft", command };
  },
  post: async (command) => {
    state.post(command);
    if (state.fail) throw new Error("Offline");
    return { description: command.kind === "setup" ? command.payload.name : "Entry", amount: command.payload.amount, financialAccountProfileId: "savings" };
  },
  clear: async () => { await state.clear(); },
  abort: async () => {},
  newKey: () => "setup-key",
  };
  return { usePostingTransport: () => transport };
});
vi.mock("@gorhom/bottom-sheet", async () => {
  const { createElement, useImperativeHandle } = await import("react");
  return {
    BottomSheetModal: ({ ref, children, ...props }: React.PropsWithChildren<{ ref: React.Ref<unknown> }>) => {
      useImperativeHandle(ref, () => ({ present: state.present, dismiss: state.dismiss }));
      return createElement("sheet", props, children);
    },
    BottomSheetBackdrop: "backdrop", BottomSheetScrollView: "sheet-content", BottomSheetView: "sheet-content", BottomSheetTextInput: "input",
  };
});
vi.mock("@react-native-community/datetimepicker", () => ({ default: "date-picker" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.blocked = false;
  state.fail = false;
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
function props(unlocking = true): ComponentProps<typeof HomePlaceSetup> {
  return {
      defaults: {
        workspace: { id: "workspace", functionalCurrency: "COP", timeZone: "America/Bogota",
          currentAccountingPeriod: { year: 2026, month: 10, status: "open" }, kind: "Personal", chartOfAccountsTemplate: "puc@1" },
        financialAccountProfile: { id: "daily", name: "Daily", productKind: "cash", ledgerAccountId: "ledger", workspaceId: "workspace" },
      },
      subject: "owner", unlocking, onClose: state.close,
  };
}
async function render(unlocking = true) {
  await act(async () => { root = create(createElement(HomePlaceSetup, props(unlocking))); });
}
function input(label: string) {
  const found = root.root.findAllByType("input").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing input ${label}`);
  return found;
}
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

test("the second place replaces the entire stack with its saved name after confirmation", async () => {
  await render();
  expect(state.load).toHaveBeenCalledWith(undefined, false);
  expect(state.present).toHaveBeenCalledOnce();
  await act(async () => input("Account name").props.onChangeText("Savings"));
  await act(async () => input("Balance today").props.onChangeText("12.500"));
  await act(async () => button("Add this place").props.onPress());
  expect(state.post).toHaveBeenCalledOnce();
  expect(state.post.mock.calls[0]).toEqual([{
    kind: "setup", target: { kind: "source" }, payload: {
      workspaceId: "workspace", name: "Savings", productKind: "savingsAccount", emoji: "🏦",
      amount: { currency: "COP", minorUnits: 1250000 },
      accountingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), idempotencyKey: "setup-key",
    },
  } satisfies PendingPosting]);
  expect(state.clear).toHaveBeenCalledOnce();
  expect(state.dismiss).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
  expect(state.reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "level-unlocked", params: { door: "account", accountName: "Savings" } }] } }]]);
  await act(async () => root.update(createElement(HomePlaceSetup, props(false))));
  expect(state.reset).toHaveBeenCalledOnce();
});

test("an uncertain setup keeps its saved command for an identical retry", async () => {
  state.fail = true;
  await render();
  await act(async () => input("Account name").props.onChangeText("Savings"));
  await act(async () => button("Add this place").props.onPress());
  expect(state.close).not.toHaveBeenCalled();
  expect(state.reset).not.toHaveBeenCalled();
  expect(input("Account name").props.editable).toBe(false);
  state.fail = false;
  await act(async () => root.update(createElement(HomePlaceSetup, props(false))));
  await act(async () => button("Retry setup").props.onPress());
  expect(state.post.mock.calls[1]).toEqual(state.post.mock.calls[0]);
  expect(state.save.mock.calls[1]).toEqual(state.save.mock.calls[0]);
  expect(state.close).toHaveBeenCalled();
  expect(state.reset).toHaveBeenCalledOnce();
});

test("a later place closes without another unlock", async () => {
  await render(false);
  expect(texts()).toContain("ANOTHER PLACE");
  await act(async () => button("Add this place").props.onPress());
  expect(state.post).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalled();
  expect(state.reset).not.toHaveBeenCalled();
});

test("a live account-count update before acknowledgement does not suppress the first unlock", async () => {
  let acknowledge: (() => void) | undefined;
  state.clear.mockImplementationOnce(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
  await render();
  await act(async () => input("Account name").props.onChangeText("Travel"));
  await act(async () => button("Add this place").props.onPress());
  expect(state.reset).not.toHaveBeenCalled();
  await act(async () => root.update(createElement(HomePlaceSetup, props(false))));
  await act(async () => acknowledge?.());
  expect(state.reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "level-unlocked", params: { door: "account", accountName: "Travel" } }] } }]]);
});

test("pending postings open Drafts instead of being resumed by the new-place action", async () => {
  state.blocked = true;
  await render();
  expect(state.push.mock.calls).toEqual([["/drafts"]]);
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.present).not.toHaveBeenCalled();
  expect(state.post).not.toHaveBeenCalled();
});

function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }

test("prototype defaults save a blank name and balance with today's hidden date", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T02:00:00Z"));
  try {
    await render();
    expect(texts()).toContain("THIS OPENS LEVEL 1");
    expect(texts()).toContain("Name you recognize");
    expect(texts()).not.toContain("Starting date");
    expect(root.root.findAllByType("button").filter((node) => node.props.accessibilityRole === "radio")
      .map((node) => [node.props.accessibilityLabel, node.props.accessibilityState.selected]))
      .toEqual([["Checking", false], ["Savings", true], ["Wallet", false]]);
    expect(root.root.find((node) => String(node.type) === "sheet").props).toMatchObject({ snapPoints: ["80%"], enablePanDownToClose: true,
      enableDynamicSizing: false, keyboardBehavior: "interactive" });
    await act(async () => input("Account name").props.onChangeText("   "));
    await act(async () => button("Add this place").props.onPress());
    expect(state.post.mock.calls[0]?.[0].payload).toMatchObject({ name: "New account", productKind: "savingsAccount",
      emoji: "🏦", amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-10-18" });
  } finally { vi.useRealTimers(); }
});

test.each([
  { label: "Checking", productKind: "bankAccount", emoji: "💰" },
  { label: "Savings", productKind: "savingsAccount", emoji: "🏦" },
  { label: "Wallet", productKind: "cash", emoji: "👛" },
])("$label maps to the existing account command and a default look", async ({ label, productKind, emoji }) => {
  await render();
  await act(async () => button(label).props.onPress());
  await act(async () => input("Balance today").props.onChangeText("abc"));
  await act(async () => button("Add this place").props.onPress());
  expect(state.post.mock.calls[0]?.[0].payload).toMatchObject({ productKind, emoji, amount: { minorUnits: 0 } });
});

test("custom look uses the first character and survives changing the kind", async () => {
  await render();
  await act(async () => button("Checking").props.onPress());
  expect(texts()).toContain("💰");
  await act(async () => button("Choose emoji").props.onPress());
  expect(root.root.findAllByType("button").filter((node) => node.props.accessibilityRole === "radio")).toHaveLength(13);
  await act(async () => input("Custom emoji").props.onChangeText("🦊extra"));
  await act(async () => button("Use this").props.onPress());
  await act(async () => root.root.findAll((node) => String(node.type) === "sheet")[1].props.onDismiss());
  await act(async () => button("Wallet").props.onPress());
  await act(async () => button("Add this place").props.onPress());
  expect(state.post.mock.calls[0]?.[0].payload).toMatchObject({ productKind: "cash", emoji: "🦊" });
});

test("pan dismissal drops an unsubmitted draft", async () => {
  await render();
  await act(async () => input("Account name").props.onChangeText("Discard me"));
  await act(async () => root.root.find((node) => String(node.type) === "sheet").props.onDismiss());
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.post).not.toHaveBeenCalled();
});
