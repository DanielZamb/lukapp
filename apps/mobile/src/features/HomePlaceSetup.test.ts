import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HomePlaceSetup } from "./HomePlaceSetup";
import type { PendingPosting } from "./posting/pendingPostingSchema";
import type { LoadResult, PostingTransport } from "./posting/usePostingEditor";

const state = vi.hoisted(() => ({
  blocked: false,
  fail: false,
  push: vi.fn(), close: vi.fn(), present: vi.fn(), dismiss: vi.fn(),
  load: vi.fn(), save: vi.fn(), post: vi.fn(), clear: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: state.push } }));
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
    return { description: "Savings", amount: command.payload.amount, financialAccountProfileId: "savings" };
  },
  clear: async () => { state.clear(); },
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
    BottomSheetScrollView: "sheet-content", BottomSheetView: "sheet-content", BottomSheetTextInput: "input",
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
async function render() {
  await act(async () => {
    root = create(createElement(HomePlaceSetup, {
      defaults: {
        workspace: { id: "workspace", functionalCurrency: "COP", timeZone: "America/Bogota",
          currentAccountingPeriod: { year: 2026, month: 10, status: "open" }, kind: "Personal", chartOfAccountsTemplate: "puc@1" },
        financialAccountProfile: { id: "daily", name: "Daily", productKind: "cash", ledgerAccountId: "ledger", workspaceId: "workspace" },
      },
      subject: "owner", onClose: state.close,
    }));
  });
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

test("Home opens the existing place form, creates a place and returns home", async () => {
  await render();
  expect(state.load).toHaveBeenCalledWith(undefined, false);
  expect(state.present).toHaveBeenCalledOnce();
  await act(async () => input("Place name").props.onChangeText("Savings"));
  await act(async () => input("Amount held").props.onChangeText("12.500"));
  await act(async () => button("Start tracking").props.onPress());
  expect(state.post).toHaveBeenCalledOnce();
  expect(state.post.mock.calls[0]).toEqual([{
    kind: "setup", target: { kind: "source" }, payload: {
      workspaceId: "workspace", name: "Savings", productKind: "bankAccount",
      amount: { currency: "COP", minorUnits: 1250000 },
      accountingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), idempotencyKey: "setup-key",
    },
  } satisfies PendingPosting]);
  expect(state.clear).toHaveBeenCalledOnce();
  expect(state.dismiss).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
});

test("an uncertain setup keeps its saved command for an identical retry", async () => {
  state.fail = true;
  await render();
  await act(async () => input("Place name").props.onChangeText("Savings"));
  await act(async () => button("Start tracking").props.onPress());
  expect(state.close).not.toHaveBeenCalled();
  expect(input("Place name").props.editable).toBe(false);
  state.fail = false;
  await act(async () => button("Retry setup").props.onPress());
  expect(state.post.mock.calls[1]).toEqual(state.post.mock.calls[0]);
  expect(state.save.mock.calls[1]).toEqual(state.save.mock.calls[0]);
  expect(state.close).toHaveBeenCalled();
});

test("pending postings open Drafts instead of being resumed by the new-place action", async () => {
  state.blocked = true;
  await render();
  expect(state.push.mock.calls).toEqual([["/drafts"]]);
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.present).not.toHaveBeenCalled();
  expect(state.post).not.toHaveBeenCalled();
});
