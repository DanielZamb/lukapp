import * as React from "react";
import { createElement, useImperativeHandle, useState, type ComponentProps } from "react";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingFormProps } from "./PostingForm";
import { BatchNativeStack } from "./BatchNativeStack";
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
const accountSheet = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn() }));
const writes = vi.hoisted(() => ({ save: vi.fn(), post: vi.fn(), batchUpdate: vi.fn() }));
const back = vi.hoisted(() => ({ handler: undefined as (() => boolean) | undefined }));
const routeBack = vi.hoisted(() => vi.fn());
const platform = vi.hoisted(() => ({ os: "ios" }));
const confirmOne = vi.hoisted(() => vi.fn());
const queryData = vi.hoisted(() => {
  const state: { categories: Category[]; profiles: Array<{ id: string; name: string }>; currency: string } = { categories: [], profiles: [], currency: "COP" };
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
    if (name.endsWith(":listFinancialAccountProfiles")) return queryData.profiles;
    if (name.endsWith(":evaluate")) return { jars: [] };
    return [];
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "picker" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet",
  BottomSheetView: "sheet-view",
  BottomSheetScrollView: "sheet-scroll",
  BottomSheetTextInput: "input",
  BottomSheetModalProvider: "sheet-provider",
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
    update: writes.batchUpdate,
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
vi.mock("./PlaceSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./PlaceSheet")>();
  return { PlaceSheet: ({ sheetRef, ...props }: ComponentProps<typeof import("./PlaceSheet").PlaceSheet>) => {
    useImperativeHandle(sheetRef, () => ({
      ...picker, dismiss: () => { picker.dismiss(); props.onDismiss(); },
      snapToIndex: vi.fn(), snapToPosition: vi.fn(), expand: vi.fn(),
      collapse: vi.fn(), close: vi.fn(), forceClose: vi.fn(),
    }));
    return createElement("place-sheet", props, createElement(actual.PlaceSheet, { ...props, sheetRef }));
  } };
});
vi.mock("./AccountSetupForm", () => ({
  AccountSetupForm: ({ sheetRef, ...props }: ComponentProps<typeof import("./AccountSetupForm").AccountSetupForm>) => {
    useImperativeHandle(sheetRef, () => ({
      ...accountSheet, snapToIndex: vi.fn(), snapToPosition: vi.fn(), expand: vi.fn(),
      collapse: vi.fn(), close: vi.fn(), forceClose: vi.fn(),
    }));
    return createElement("setup", props);
  },
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: "screen",
  ScreenStackHeaderLeftView: "header-left",
  ScreenStackHeaderRightView: "header-right",
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
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
  queryData.profiles = [{ id: "daily", name: "My money" }, { id: "wallet", name: "Wallet" }];
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

test.each(["normal"] satisfies Array<NonNullable<PostingFormProps["entryType"]>>)(
  "%s applies its category requirement without saving or posting",
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

test.each([
  ["normal", "one"], ["transfer", "one"], ["initial", "one"],
  ["normal", "batch"], ["transfer", "batch"], ["initial", "batch"],
] satisfies [NonNullable<PostingFormProps["entryType"]>, "one" | "batch"][])(
  "%s requires a nonblank description before enabling %s posting",
  async (entryType, mode) => {
    queryData.categories = [{
      id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
      nature: "Expense", natureSource: "answered",
      classification: { kind: "fallback", version: "test" },
      style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
    }];
    await mount();
    if (mode === "batch") {
      await act(async () => { formProps().onBatch?.(); });
      await act(async () => { root?.root.findByType(BatchNativeStack).props.onAdd(); });
      expect(formProps().saveToBatch).toBe(true);
    }
    await act(async () => {
      formProps().onEntryType?.(entryType);
      formProps().onAmountChange(entryType === "initial" ? "0" : "-1");
    });
    if (entryType === "transfer") {
      await act(async () => formProps().onDestination?.());
      const place = root?.root.find((node) => String(node.type) === "place-sheet");
      await act(async () => place?.props.onSelect("wallet"));
      await act(async () => formProps().transferReview?.onConfirm());
    }
    if (entryType === "normal") {
      await act(async () => formProps().onCategory());
      if (!root) throw new Error("Post route is not mounted");
      const sheet = root.root.find((node) => String(node.type) === "category-sheet");
      await act(async () => sheet.props.onSelect("food"));
      await act(async () => sheet.props.onDone());
    }
    expect(formProps().canSubmit).toBe(false);
    if (mode === "batch") await act(async () => { formProps().onPost(); });
    expect(writes.batchUpdate).not.toHaveBeenCalled();
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

test("a negative draft can choose income without closing the picker and posts the selected direction", async () => {
  writes.save.mockImplementationOnce(async (command: PendingPosting) => ({ id: "income-saved", command }));
  writes.post.mockResolvedValueOnce({ description: "Category first salary", amount: { currency: "COP", minorUnits: 12500 } });
  const base: Category = {
    id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
    nature: "Expense", natureSource: "answered", classification: { kind: "fallback", version: "test" },
    style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
  };
  queryData.categories = [base, { ...base, id: "salary", name: "Salary", normalizedName: "salary", nature: "Income", resolvedPostingAccountCode: "income" }];
  await mount();
  await act(async () => { formProps().onAmountChange("-125"); formProps().onDescriptionChange("Category first salary"); });
  await act(async () => formProps().onCategory());
  const sheet = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "category-sheet");
  };
  expect(sheet().props.options.map((option: { key: string }) => option.key)).toEqual(["food", "salary"]);
  await act(async () => sheet().props.onSelect("salary"));
  expect(formProps()).toMatchObject({ amount: "+125", category: "F Salary", canSubmit: true });
  expect(sheet().props.options.map((option: { key: string }) => option.key)).toEqual(["food", "salary"]);
  await act(async () => sheet().props.onDone());
  await act(async () => formProps().onPost());
  expect(writes.post).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "income", payload: expect.objectContaining({ userCategoryIds: ["salary"], amount: { currency: "COP", minorUnits: 12500 } }) }));
});

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

test("paying an existing loan selects a destination instead of opening new-loan setup", async () => {
  writes.save.mockImplementation(async (command: PendingPosting) => ({ id: "saved", command }));
  writes.post.mockImplementation(async (command: PendingPosting) => ({ description: "Loan payment", amount: command.payload.amount }));
  queryData.profiles = [{ id: "daily", name: "My money" }, { id: "loan", name: "My loan" }];
  await mount();
  await act(async () => {
    formProps().onAmountChange("-10");
    formProps().onDescriptionChange("Loan payment");
    formProps().onCategory();
  });
  const category = () => root!.root.find((node) => String(node.type) === "category-sheet");
  await act(async () => category().props.onCreate());
  await act(async () => category().props.onName("Loan payment"));
  await act(async () => category().props.onAnswer("payDebt"));
  await act(async () => category().props.onConfirm());
  expect(accountSheet.present).not.toHaveBeenCalled();
  expect(picker.present).toHaveBeenCalled();
  const place = root!.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => place.props.onSelect("loan"));
  expect(formProps()).toMatchObject({ entryType: "transfer", categoryEnabled: false,
    destination: "💰 My loan", amount: "-10", description: "Loan payment" });
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
  expect(formProps()).toMatchObject({ canSubmit: false, blockedReason: "Confirm From and To before posting." });
  await act(async () => formProps().transferReview?.onConfirm());
  expect(formProps().canSubmit).toBe(true);
  await act(async () => formProps().onPost());
  expect(writes.post).toHaveBeenCalledExactlyOnceWith({ kind: "transfer", payload: {
    workspaceId: "workspace", sourceFinancialAccountProfileId: "daily", destinationFinancialAccountProfileId: "loan",
    amount: { currency: "COP", minorUnits: 1000 }, description: "Loan payment",
    accountingDate: expect.any(String), idempotencyKey: "key",
  } });
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

test("native account dismissal allows the category account door to reopen without another dismiss or automatic Post", async () => {
  platform.os = "android";
  await mount();
  expect(accountSheet.present).not.toHaveBeenCalled();
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  await act(async () => {
    formProps().onAmountChange("-10");
    formProps().onDescriptionChange("Posting reserve");
  });
  const originalDate = formProps().date;
  const category = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "category-sheet");
  };
  const setup = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "setup");
  };
  async function openAccountDoor() {
    await act(async () => formProps().onEntryType?.("normal"));
    await act(async () => formProps().onCategory());
    await act(async () => category().props.onCreate());
    await act(async () => category().props.onName("Posting reserve"));
    await act(async () => category().props.onAnswer("stillMine"));
    await act(async () => category().props.onConfirm());
    const place = root!.root.find((node) => String(node.type) === "place-sheet");
    await act(async () => place.props.onAdd());
  }
  await openAccountDoor();
  expect(accountSheet.present).toHaveBeenCalledOnce();
  expect(setup().props.value).toMatchObject({ name: "Posting reserve", amount: "0", target: { kind: "destination", sourceProfileId: "daily" } });
  await act(async () => setup().props.onDismiss());
  expect(setup().props.value).toBeNull();
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  expect(formProps()).toMatchObject({ amount: "-10", description: "Posting reserve", date: originalDate, entryType: "transfer", place: "💰 My money", destination: "Pick", category: "Pick", canSubmit: false });
  await openAccountDoor();
  expect(accountSheet.present).toHaveBeenCalledTimes(2);
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  expect(setup().props.value).toMatchObject({ name: "Posting reserve", amount: "0", target: { kind: "destination", sourceProfileId: "daily" } });
  expect(formProps()).toMatchObject({ amount: "-10", description: "Posting reserve", date: originalDate, entryType: "transfer", place: "💰 My money", destination: "Pick", category: "Pick", canSubmit: false });
  expect(root?.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "Confirm From and To")).toHaveLength(0);
  await act(async () => formProps().onPost());
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
  expect(confirmOne).not.toHaveBeenCalled();
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


test("incoming account creation offers an explicit swap with two-account picker filters and posts Savings to My money", async () => {
  queryData.profiles = [{ id: "daily", name: "My money" }];
  writes.save.mockImplementation(async (command: PendingPosting) => ({ id: "saved", command }));
  writes.post.mockImplementation(async (command: PendingPosting) => {
    if (command.kind === "setup") {
      queryData.profiles = [...queryData.profiles, { id: "savings", name: "Savings" }];
      return { financialAccountProfileId: "savings", description: "Savings", amount: command.payload.amount };
    }
    return { description: "From Savings", amount: command.payload.amount };
  });
  await mount();
  await act(async () => {
    formProps().onAmountChange("+125,00");
    formProps().onDescriptionChange("From Savings");
  });
  const originalDate = formProps().date;
  await act(async () => formProps().onCategory());
  const category = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "category-sheet");
  };
  await act(async () => category().props.onCreate());
  await act(async () => category().props.onName("Savings"));
  await act(async () => category().props.onAnswer("stillMine"));
  await act(async () => category().props.onConfirm());
  await act(async () => root?.root.find((node) => String(node.type) === "place-sheet").props.onAdd());
  const setup = root?.root.find((node) => String(node.type) === "setup");
  expect(accountSheet.present).toHaveBeenCalledOnce();
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  await act(async () => setup?.props.onSubmit());
  expect(accountSheet.dismiss).toHaveBeenCalledOnce();
  expect(root?.root.find((node) => String(node.type) === "setup").props.value).toBeNull();
  await act(async () => root?.root.find((node) => String(node.type) === "setup").props.onDismiss());
  expect(accountSheet.dismiss).toHaveBeenCalledOnce();
  expect(writes.post).toHaveBeenCalledOnce();
  expect(formProps()).toMatchObject({ amount: "+125,00", description: "From Savings", date: originalDate, place: "💰 My money", destination: "💰 Savings", canSubmit: false, category: "Pick" });
  const place = () => root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => formProps().onPlace());
  expect(place()?.props.excludedId).toBe("savings");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 Savings")).toHaveLength(0);
  await act(async () => formProps().onDestination?.());
  expect(place()?.props.excludedId).toBe("daily");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 My money")).toHaveLength(0);
  await act(async () => formProps().transferReview?.onSwap());
  expect(formProps()).toMatchObject({ amount: "+125,00", description: "From Savings", date: originalDate, place: "💰 Savings", destination: "💰 My money", canSubmit: false, category: "Pick" });
  expect(place()?.props.excludedId).toBe("savings");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 My money")).toHaveLength(1);
  await act(async () => formProps().onPlace());
  expect(place()?.props.excludedId).toBe("daily");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 Savings")).toHaveLength(1);
  await act(async () => formProps().onPost());
  expect(writes.post).toHaveBeenCalledOnce();
  await act(async () => formProps().transferReview?.onConfirm());
  expect(formProps().canSubmit).toBe(true);
  await act(async () => formProps().onPost());
  expect(writes.post.mock.calls[1][0]).toEqual({ kind: "transfer", payload: {
    workspaceId: "workspace", sourceFinancialAccountProfileId: "savings", destinationFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 12500 }, accountingDate: expect.any(String), description: "From Savings", idempotencyKey: "key",
  } });
  expect(confirmOne).not.toHaveBeenCalled();
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
