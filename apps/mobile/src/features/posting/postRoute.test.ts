import * as React from "react";
import { createElement, useImperativeHandle, useState, type ComponentProps } from "react";
import type { PostingFormProps } from "./PostingForm";
import { parsePendingPosting } from "./pendingPostingSchema";
import type { CategorySheetProps } from "../categories/CategorySheet";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { seedCandidate } from "../intake/devSeed";
import { getFunctionName } from "convex/server";
import type { Category } from "../categories/model";

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});
const route = vi.hoisted(() => ({
  profileId: undefined as string | undefined,
  draftId: undefined as string | undefined,
  candidateId: undefined as string | undefined,
}));
const form = vi.hoisted(() => {
  const state: { sourceNote?: string; props?: PostingFormProps } = {};
  return state;
});
const picker = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn() }));
const writes = vi.hoisted(() => ({ save: vi.fn(), post: vi.fn() }));
const back = vi.hoisted(() => ({ handler: undefined as (() => boolean) | undefined }));
const routeBack = vi.hoisted(() => vi.fn());
const platform = vi.hoisted(() => ({ os: "ios" }));
const confirmOne = vi.hoisted(() => vi.fn());
const queryData = vi.hoisted(() => {
  const state: { categories: Category[]; currency: string } = { categories: [], currency: "COP" };
  return state;
});
const intakeActions = vi.hoisted(() => ({
  read: vi.fn(async (id: string) =>
    id === "candidate-1"
      ? seedCandidate("workspace", "daily", "COP")
      : undefined,
  ),
  consume: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  router: { back: routeBack, replace: vi.fn(), setParams: vi.fn() },
  Redirect: "redirect",
  useLocalSearchParams: () => ({
    profileId: route.profileId,
    draftId: route.draftId,
    candidateId: route.candidateId,
  }),
}));
vi.mock("convex/react", () => ({
  useAction: () => confirmOne,
  useConvex: () => ({ query: vi.fn() }),
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listUserCategories")) return queryData.categories;
    if (name.endsWith(":listFinancialAccountProfiles")) return [
      { id: "daily", name: "My money" },
      { id: "wallet", name: "Wallet" },
    ];
    if (name.endsWith(":evaluate")) return { jars: [] };
    return [];
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "picker" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet",
  BottomSheetView: "sheet-view",
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({
    workspace: {
      id: "workspace",
      functionalCurrency: queryData.currency,
      timeZone: "America/Bogota",
    },
    financialAccountProfile: { id: "daily", name: "My money" },
  }),
}));
vi.mock("../../local-auth/interaction", () => ({
  useLocalEntryInteraction: () => vi.fn(),
}));
vi.mock("../useLocalEntryDrafts", () => ({
  useLocalEntryDrafts: () => ({ port: null, items: [], count: 0, error: "" }),
}));
vi.mock("../useIntakeCandidates", () => ({
  useIntakeCandidates: () => intakeActions,
}));
vi.mock("./usePostingTransport", () => {
  const transport = {
    load: vi.fn(async () => ({ kind: "none" })),
    save: writes.save,
    post: writes.post,
    clear: vi.fn(),
    abort: vi.fn(),
    newKey: () => "key",
  };
  return { usePostingTransport: () => transport };
});
vi.mock("./postingBatchStorage", () => {
  const storage = {
    load: async () => ({ queue: [], receipts: { count: 0, net: 0 } }),
    update: vi.fn(),
  };
  return { usePostingBatchStorage: () => storage };
});
vi.mock("./PostingForm", () => ({
  PostingForm: (props: PostingFormProps) => {
    form.sourceNote = props.sourceNote;
    form.props = props;
    return createElement("view");
  },
}));
vi.mock("../categories/CategorySheet", () => ({
  CategorySheet: ({ sheetRef, ...props }: CategorySheetProps) => {
    const [visible, setVisible] = useState(false);
    useImperativeHandle(sheetRef, () => ({
      present: () => setVisible(true),
      dismiss: () => { setVisible(false); props.onDismiss(); },
      snapToIndex: vi.fn(), snapToPosition: vi.fn(), expand: vi.fn(),
      collapse: vi.fn(), close: vi.fn(), forceClose: vi.fn(),
    }));
    return visible ? createElement("category-sheet", props) : null;
  },
}));
vi.mock("./PlaceSheet", () => ({
  PlaceSheet: ({ sheetRef, ...props }: ComponentProps<typeof import("./PlaceSheet").PlaceSheet>) => {
    useImperativeHandle(sheetRef, () => ({
      ...picker, snapToIndex: vi.fn(), snapToPosition: vi.fn(), expand: vi.fn(),
      collapse: vi.fn(), close: vi.fn(), forceClose: vi.fn(),
    }));
    return createElement("place-sheet", props);
  },
}));
vi.mock("./AccountSetupForm", () => ({ AccountSetupForm: "setup" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: "screen",
  ScreenStackHeaderLeftView: "header-left",
  ScreenStackHeaderRightView: "header-right",
}));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  ActivityIndicator: "spinner",
  BackHandler: { addEventListener: (_event: string, handler: () => boolean) => {
    back.handler = handler;
    return { remove: () => { back.handler = undefined; } };
  } },
  Platform: { get OS() { return platform.os; } },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import PostRoute from "../../../app/post";

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  route.profileId = undefined;
  route.draftId = undefined;
  route.candidateId = undefined;
  form.sourceNote = undefined;
  form.props = undefined;
  queryData.categories = [];
  queryData.currency = "COP";
  back.handler = undefined;
  vi.clearAllMocks();
  platform.os = "ios";
  intakeActions.read.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root = create(createElement(PostRoute));
  });
  await act(async () => {});
}

test("a new entry passes no source note", async () => {
  await mount();
  expect(form.sourceNote).toBeUndefined();
});

function formProps() {
  if (!form.props) throw new Error("Post form is not mounted");
  return form.props;
}

test.each(["normal", "transfer"] satisfies Array<NonNullable<PostingFormProps["entryType"]>>)(
  "%s requires a selected category before enabling Post, without saving or posting",
  async (entryType) => {
    queryData.categories = [{
      id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
      nature: "Expense", natureSource: "answered",
      classification: { kind: "fallback", version: "test" },
      style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
    }];
    await mount();
    await act(async () => {
      formProps().onAmountChange("-7");
      formProps().onDescriptionChange("PostingPalette-2134");
      formProps().onEntryType?.(entryType);
    });
    if (entryType === "transfer") {
      await act(async () => formProps().onDestination?.());
      const place = root?.root.find((node) => String(node.type) === "place-sheet");
      await act(async () => place?.props.onSelect("wallet"));
    }
    expect(formProps()).toMatchObject({ category: "Pick", canSubmit: false });
    await act(async () => formProps().onCategory());
    const sheet = () => {
      if (!root) throw new Error("Post route is not mounted");
      return root.root.find((node) => String(node.type) === "category-sheet");
    };
    await act(async () => sheet().props.onSelect("food"));
    await act(async () => sheet().props.onDone());
    expect(formProps()).toMatchObject({ category: "F Food", canSubmit: true });
    await act(async () => formProps().onCategory());
    await act(async () => sheet().props.onSelect("food"));
    await act(async () => sheet().props.onDone());
    expect(formProps()).toMatchObject({ category: "Pick", canSubmit: false });
    expect(writes.save).not.toHaveBeenCalled();
    expect(writes.post).not.toHaveBeenCalled();
    expect(confirmOne).not.toHaveBeenCalled();
  },
);

test.each(["normal", "transfer", "initial"] satisfies Array<NonNullable<PostingFormProps["entryType"]>>)(
  "%s requires a nonblank description before enabling Post",
  async (entryType) => {
    queryData.categories = [{
      id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
      nature: "Expense", natureSource: "answered",
      classification: { kind: "fallback", version: "test" },
      style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
    }];
    await mount();
    await act(async () => {
      formProps().onEntryType?.(entryType);
      formProps().onAmountChange(entryType === "initial" ? "0" : "-1");
    });
    if (entryType === "transfer") {
      await act(async () => formProps().onDestination?.());
      const place = root?.root.find((node) => String(node.type) === "place-sheet");
      await act(async () => place?.props.onSelect("wallet"));
    }
    if (entryType !== "initial") {
      await act(async () => formProps().onCategory());
      if (!root) throw new Error("Post route is not mounted");
      const sheet = root.root.find((node) => String(node.type) === "category-sheet");
      await act(async () => sheet.props.onSelect("food"));
      await act(async () => sheet.props.onDone());
    }
    expect(formProps().canSubmit).toBe(false);
    await act(async () => formProps().onDescriptionChange(" \t\n "));
    expect(formProps().canSubmit).toBe(false);
    await act(async () => formProps().onDescriptionChange(" Lunch "));
    expect(formProps().canSubmit).toBe(true);
    await act(async () => formProps().onDescriptionChange(""));
    expect(formProps().canSubmit).toBe(false);
    expect(writes.save).not.toHaveBeenCalled();
    expect(writes.post).not.toHaveBeenCalled();
    expect(confirmOne).not.toHaveBeenCalled();
  },
);

test("Initial balance can enable Post without a category", async () => {
  await mount();
  await act(async () => {
    formProps().onEntryType?.("initial");
    formProps().onAmountChange("7");
    formProps().onDescriptionChange("Opening");
  });
  expect(formProps()).toMatchObject({ categoryEnabled: false, canSubmit: true });
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
});

test.each(["source", "destination"])("Android Back from %s preserves unsaved Post fields", async (target) => {
  platform.os = "android";
  await mount();
  expect(back.handler).toBeUndefined();
  await act(async () => formProps().onAmountChange("-7"));
  await act(async () => formProps().onDescriptionChange("PostingBack-1946"));
  if (target === "destination") await act(async () => formProps().onEntryType?.("transfer"));
  await act(async () => target === "source" ? formProps().onPlace() : formProps().onDestination?.());
  expect(picker.present).toHaveBeenCalledOnce();
  expect(back.handler).toBeTypeOf("function");
  let handled = false;
  await act(async () => { handled = back.handler?.() ?? false; });
  expect(handled).toBe(true);
  expect(picker.dismiss).toHaveBeenCalledOnce();
  expect(routeBack).not.toHaveBeenCalled();
  expect(formProps()).toMatchObject({ amount: "-7", description: "PostingBack-1946" });
  const placeSheet = root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => placeSheet?.props.onDismiss());
  expect(back.handler).toBeUndefined();
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
});

test("canceling Add a place preserves the unsaved Post without saving", async () => {
  platform.os = "android";
  await mount();
  await act(async () => formProps().onAmountChange("-7"));
  await act(async () => formProps().onDescriptionChange("PostingBack-1946"));
  await act(async () => formProps().onPlace());
  const placeSheet = root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => placeSheet?.props.onAdd());
  expect(back.handler).toBeUndefined();
  const setup = () => root?.root.find((node) => String(node.type) === "setup");
  expect(setup()?.props.value).toMatchObject({ name: "", amount: "0", target: { kind: "source" } });
  await act(async () => setup()?.props.onDismiss());
  expect(setup()?.props.value).toBeNull();
  expect(formProps()).toMatchObject({ amount: "-7", description: "PostingBack-1946" });
  expect(routeBack).not.toHaveBeenCalled();
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
});

test("Android Back dismisses the unsaved category editor and preserves the Post composer", async () => {
  platform.os = "android";
  await mount();
  await act(async () => {
    formProps().onAmountChange("-7");
    formProps().onDescriptionChange("PostingCheck-2122");
    formProps().onCategory();
  });
  const categorySheet = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "category-sheet");
  };
  await act(async () => categorySheet().props.onCreate());
  await act(async () => categorySheet().props.onName("Dining"));
  expect(categorySheet().props.editor).toMatchObject({ kind: "custom", name: "Dining" });
  let handled = false;
  await act(async () => { handled = back.handler?.() ?? false; });
  expect(handled).toBe(true);
  expect(root?.root.findAll((node) => String(node.type) === "category-sheet")).toHaveLength(0);
  expect(formProps()).toMatchObject({ amount: "-7", description: "PostingCheck-2122", category: "Pick", canSubmit: false });
  expect(routeBack).not.toHaveBeenCalled();
  expect(back.handler).toBeUndefined();
  await act(async () => formProps().onCategory());
  expect(categorySheet().props.editor).toBeNull();
  expect(categorySheet().props.options).toEqual([]);
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
  expect(confirmOne).not.toHaveBeenCalled();
});

test("a local entry draft passes Draft on this device", async () => {
  route.draftId = "open-1";
  await mount();
  expect(form.sourceNote).toBe("Draft on this device");
});

test("a Candidate passes From drafts without an application name", async () => {
  route.candidateId = "candidate-1";
  await mount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(form.sourceNote).toBe("From drafts");
});

test.each([
  ["EUR", "12,50", 1250], ["MXN", "12,50", 1250], ["JPY", "100", 100], ["BHD", "1,234", 1234],
] satisfies [string, string, number][])("posting preserves the %s workspace currency and precision", async (currency, amount, minorUnits) => {
  queryData.currency = currency;
  writes.save.mockImplementationOnce(async (command: unknown) => ({ id: "currency-draft", command: parsePendingPosting(command) }));
  writes.post.mockResolvedValueOnce({ description: "Opening money", amount: { currency, minorUnits } });
  await mount();
  await act(async () => {
    formProps().onEntryType?.("initial");
    formProps().onAmountChange(amount);
    formProps().onDescriptionChange("Opening money");
  });
  await act(async () => { formProps().onPost(); });
  expect(writes.save).toHaveBeenCalledWith(expect.objectContaining({
    kind: "opening", payload: expect.objectContaining({ amount: { currency, minorUnits } }),
  }), undefined);
  expect(writes.post).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ amount: { currency, minorUnits } }),
  }));
});
