vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
import * as React from "react";
import { createElement, forwardRef, useEffect, useImperativeHandle, useState, type ComponentProps } from "react";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingFormProps } from "./PostingForm";
import { BatchNativeStack } from "./BatchNativeStack";
import { parsePendingPosting } from "./pendingPostingSchema";
import type { CategorySheetProps } from "../categories/CategorySheet";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openAmount } from "../amount/session";

const money = (text: string, currency = "COP") => openAmount(currency, text);
const typedAmount = (text: string) => expect.objectContaining({ editor: expect.objectContaining({ text }) });
import { capture, mapping, fixture as intakeFixture } from "../intake/service.testSupport";
import { emptyState, serializeState } from "../intake/durableState";
import { NotificationCard } from "../intake/NotificationCard";
import { getFunctionName } from "convex/server";
import type { Category } from "../categories/model";
import type { BudgetJar } from "../budget/model";
import { withNativeText } from "../amount/session";
import { ThemeProvider, useSetThemeMode } from "../../ui/themeContext";
import type { ThemeMode } from "../../ui/tokens";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { SheetModal, type NativeSheetProps } from "../../ui/SheetModal";
import DateTimePicker from "@react-native-community/datetimepicker";

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
const navigation = vi.hoisted(() => {
  const state: { beforeRemove?: (event: { preventDefault(): void; data: { action: { type: string } } }) => void } = {};
  return { state, dispatch: vi.fn(), addListener: (_name: string, listener: NonNullable<typeof state.beforeRemove>) => {
    state.beforeRemove = listener; return () => { state.beforeRemove = undefined; };
  } };
});
const platform = vi.hoisted(() => ({ os: "ios" }));
const confirmOne = vi.hoisted(() => vi.fn());
const convexQuery = vi.hoisted(() => vi.fn());
const createCategory = vi.hoisted(() => vi.fn());
const queryData = vi.hoisted(() => {
  const state: { categories: Category[]; profiles: Array<{ id: string; name: string; status?: string }>; currency: string; defaultProfileId: string;
    allProfiles?: Array<{ id: string; name: string; status?: string }>;
    /** The Budget the server evaluates for a month. */
    budget: (month: string) => { month: string; jars: BudgetJar[] } } =
    { categories: [], profiles: [], currency: "COP", defaultProfileId: "daily", budget: (month) => ({ month, jars: [] }) };
  return state;
});
let candidateService: ReturnType<typeof intakeFixture>["service"];
const intakeActions = { get count() { return 1; }, get service() { return candidateService; } };


vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("@react-navigation/native", () => ({ usePreventRemove: () => {} }));
vi.mock("expo-router", () => ({
  router: { back: routeBack, replace: vi.fn(), setParams: vi.fn() },
  Redirect: "redirect",
  useNavigation: () => navigation,
  useLocalSearchParams: () => ({
    profileId: route.profileId,
    draftId: route.draftId,
    candidateId: route.candidateId,
  }),
}));
vi.mock("convex/react", () => ({
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":createUserCategory") ? createCategory : confirmOne,
  useConvex: () => ({ query: convexQuery }),
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args?: { status?: string; month?: string }) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listUserCategories")) return queryData.categories;
    if (name.endsWith(":listFinancialAccountProfiles")) return args?.status === "all" ? queryData.allProfiles ?? queryData.profiles : queryData.profiles;
    if (name.endsWith(":evaluate")) return queryData.budget(args?.month ?? "");
    return [];
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "picker" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: forwardRef(function NativeModal({ children, ...props }: NativeSheetProps & { children?: React.ReactNode }, ref) {
    useImperativeHandle(ref, () => ({
      present: () => props.onChange?.(0, 0, 0),
      dismiss: () => { props.onChange?.(-1, 0, 0); props.onDismiss?.(); },
    }));
    return createElement("sheet", props, children);
  }),
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
    financialAccountProfile: { id: queryData.defaultProfileId },
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
    apply: writes.batchUpdate,
  };
  return { usePostingBatchStorage: () => storage };
});
vi.mock("./PostingForm", async (importOriginal) => ({
  ...await importOriginal<typeof import("./PostingForm")>(),
  PostingForm: (props: PostingFormProps) => {
    form.sourceNote = props.sourceNote;
    form.props = props;
    return createElement("view");
  },
}));
vi.mock("../categories/CategorySheet", () => ({
  CategorySheet: ({ sheetRef, ...props }: CategorySheetProps) => {
    const [visible, setVisible] = useState(false);
    return createElement(SheetModal, { sheetRef, presentOnMount: false, trackPresentation: true, androidBack: true,
      busy: props.busy, onDismiss: props.onDismiss, onChange: (index) => setVisible(index >= 0),
      children: visible ? createElement("category-sheet", props) : null,
    });
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
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: "screen",
  ScreenStackHeaderLeftView: "header-left",
  ScreenStackHeaderRightView: "header-right",
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Keyboard: { dismiss: () => {} },
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
  queryData.allProfiles = undefined;
  queryData.currency = "COP";
  queryData.defaultProfileId = "daily";
  queryData.budget = (month) => ({ month, jars: [] });
  back.handler = undefined;
  vi.clearAllMocks();
  convexQuery.mockImplementation(async (_reference: unknown, args: { month: string }) => queryData.budget(args.month));
  platform.os = "ios";
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  candidate.setLegacy(null);
  candidateService = candidate.service;
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

function Appearance({ mode }: { mode: ThemeMode }) {
  const setMode = useSetThemeMode();
  useEffect(() => setMode(mode), [mode, setMode]);
  return createElement(PostRoute);
}

test.each(["light", "dark"] as const)(
  "date preserves the fdd9a85 default picker configuration in %s",
  async (mode) => {
    await act(async () => {
      root = create(createElement(ThemeProvider, null, createElement(Appearance, { mode })));
    });
    const modal = root!.root.findAllByType(BottomSheetModal).find((node) => node.findAllByType(DateTimePicker).length === 1)!;
    const { children, ref, backdropComponent, ...props } = modal.props;
    const configuration = Object.fromEntries(Object.entries(props).filter(([key, value]) => value !== undefined && typeof value !== "function" && !key.startsWith("on")));
    expect({ props: configuration, hasBackdrop: typeof backdropComponent === "function" }).toMatchSnapshot();
    expect(configuration).toEqual({
      backgroundStyle: { backgroundColor: mode === "light" ? "#ffffff" : "#0a0a0a" },
      snapPoints: ["55%"],
      enableDynamicSizing: false,
    });
    expect(backdropComponent).toBeUndefined();
  },
);

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
      formProps().onAmountChange(money("-7"));
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
      formProps().onAmountChange(money(entryType === "initial" ? "0" : "-1"));
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
  await act(async () => { formProps().onAmountChange(money("-125")); formProps().onDescriptionChange("Category first salary"); });
  await act(async () => formProps().onCategory());
  const sheet = () => {
    if (!root) throw new Error("Post route is not mounted");
    return root.root.find((node) => String(node.type) === "category-sheet");
  };
  expect(sheet().props.options.map((option: { key: string }) => option.key)).toEqual(["food", "salary"]);
  await act(async () => sheet().props.onSelect("salary"));
  expect(formProps()).toMatchObject({ amount: typedAmount("+125"), category: "F Salary", canSubmit: true });
  expect(sheet().props.options.map((option: { key: string }) => option.key)).toEqual(["food", "salary"]);
  await act(async () => sheet().props.onDone());
  await act(async () => formProps().onPost());
  expect(writes.post).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "income", payload: expect.objectContaining({ userCategoryIds: ["salary"], amount: { currency: "COP", minorUnits: 12500 } }) }));
  expect(formProps().category).toBe("Pick");
  expect(formProps().receipt).toMatchObject({
    description: "Category first salary", amount: "125", minorUnits: 12500,
    category: { name: "Salary", emoji: "F" },
  });
  await act(async () => formProps().onAnother?.());
  expect(formProps()).toMatchObject({ posted: null, receipt: undefined, amount: typedAmount("-"), description: "" });
  expect(writes.post).toHaveBeenCalledOnce();
});

test("Initial balance can enable Post without a category", async () => {
  await mount();
  await act(async () => {
    formProps().onEntryType?.("initial");
    formProps().onAmountChange(money("7"));
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
    formProps().onAmountChange(money("-10"));
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
    destination: "💰 My loan", amount: typedAmount("-10"), description: "Loan payment" });
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
  await act(async () => formProps().onAmountChange(money("-7")));
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
  expect(formProps()).toMatchObject({ amount: typedAmount("-7"), description: "PostingBack-1946" });
  const placeSheet = root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => placeSheet?.props.onDismiss());
  expect(back.handler).toBeUndefined();
  expect(writes.save).not.toHaveBeenCalled();
  expect(writes.post).not.toHaveBeenCalled();
});

test("canceling Add a place preserves the unsaved Post without saving", async () => {
  platform.os = "android";
  await mount();
  await act(async () => formProps().onAmountChange(money("-7")));
  await act(async () => formProps().onDescriptionChange("PostingBack-1946"));
  await act(async () => formProps().onPlace());
  const placeSheet = root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => placeSheet?.props.onAdd());
  expect(back.handler).toBeUndefined();
  const setup = () => root?.root.find((node) => String(node.type) === "setup");
  expect(setup()?.props.value).toMatchObject({ name: "", amount: typedAmount("0"), target: { kind: "source" } });
  await act(async () => setup()?.props.onDismiss());
  expect(setup()?.props.value).toBeNull();
  expect(formProps()).toMatchObject({ amount: typedAmount("-7"), description: "PostingBack-1946" });
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
    formProps().onAmountChange(money("-10"));
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
  expect(setup().props.value).toMatchObject({ name: "Posting reserve", amount: typedAmount("0"), target: { kind: "destination", sourceProfileId: "daily" } });
  await act(async () => setup().props.onDismiss());
  expect(setup().props.value).toBeNull();
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  expect(formProps()).toMatchObject({ amount: typedAmount("-10"), description: "Posting reserve", date: originalDate, entryType: "transfer", place: "💰 My money", destination: "Pick", category: "Pick", canSubmit: false });
  await openAccountDoor();
  expect(accountSheet.present).toHaveBeenCalledTimes(2);
  expect(accountSheet.dismiss).not.toHaveBeenCalled();
  expect(setup().props.value).toMatchObject({ name: "Posting reserve", amount: typedAmount("0"), target: { kind: "destination", sourceProfileId: "daily" } });
  expect(formProps()).toMatchObject({ amount: typedAmount("-10"), description: "Posting reserve", date: originalDate, entryType: "transfer", place: "💰 My money", destination: "Pick", category: "Pick", canSubmit: false });
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
    formProps().onAmountChange(money("-7"));
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
  expect(formProps()).toMatchObject({ amount: typedAmount("-7"), description: "PostingCheck-2122", category: "Pick", canSubmit: false });
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

test("a Candidate separates source and captured facts from its editable description", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh();
  candidateService = candidate.service;
  route.candidateId = "capture-1";
  await mount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(form.sourceNote).toContain("Source app.bank.");
  expect(form.sourceNote).toContain("Captured ");
  expect(form.sourceNote).toContain("Original amount 450 COP.");
  expect(form.props?.description).toBe("Market");
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
    formProps().onAmountChange(money("+125,00"));
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
  expect(formProps()).toMatchObject({ amount: typedAmount("+125,00"), description: "From Savings", date: originalDate, place: "💰 My money", destination: "💰 Savings", canSubmit: false, category: "Pick" });
  const place = () => root?.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => formProps().onPlace());
  expect(place()?.props.excludedId).toBe("savings");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 Savings")).toHaveLength(0);
  await act(async () => formProps().onDestination?.());
  expect(place()?.props.excludedId).toBe("daily");
  expect(place()?.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === "💰 My money")).toHaveLength(0);
  await act(async () => formProps().transferReview?.onSwap());
  expect(formProps()).toMatchObject({ amount: typedAmount("+125,00"), description: "From Savings", date: originalDate, place: "💰 Savings", destination: "💰 My money", canSubmit: false, category: "Pick" });
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
    formProps().onAmountChange(money(amount, currency));
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

test.each(["one", "batch"] as const)("category creation and cancellation preserve the actual %s posting draft", async (mode) => {
  platform.os = "android";
  queryData.categories = [{
    id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
    nature: "Expense", natureSource: "answered", classification: { kind: "fallback", version: "test" },
    style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
  }];
  await mount();
  if (mode === "batch") {
    await act(async () => formProps().onBatch?.());
    await act(async () => root!.root.findByType(BatchNativeStack).props.onAdd());
  }
  await act(async () => { formProps().onAmountChange(money("-7")); formProps().onDescriptionChange("Navigation lunch"); });
  const date = formProps().date;
  const sheet = () => root!.root.find((node) => String(node.type) === "category-sheet");
  await act(async () => formProps().onCategory());
  await act(async () => sheet().props.onSelect("food"));
  await act(async () => sheet().props.onCreate());
  await act(async () => sheet().props.onName("Unfinished category"));
  await act(async () => { expect(back.handler?.()).toBe(true); });
  expect(formProps()).toMatchObject({ amount: typedAmount("-7"), description: "Navigation lunch", date, category: "F Food" });
  await act(async () => formProps().onCategory());
  expect(sheet().props.editor).toBeNull();
  await act(async () => sheet().props.onCreate());
  await act(async () => sheet().props.onName("Lunch category"));
  await act(async () => sheet().props.onAnswer("spend"));
  const category = { ...queryData.categories[0], id: "lunch", name: "Lunch category" };
  createCategory.mockResolvedValueOnce({ kind: "category", category });
  await act(async () => { const confirm = sheet().props.onConfirm; confirm(); confirm(); });
  expect(createCategory).toHaveBeenCalledOnce();
  queryData.categories.push(category);
  await act(async () => root!.update(createElement(PostRoute)));
  expect(root!.root.findAll((node) => String(node.type) === "category-sheet")).toHaveLength(0);
  expect(formProps()).toMatchObject({ amount: typedAmount("-7"), description: "Navigation lunch", date, category: "F Food · F Lunch category", canSubmit: true });
  if (mode === "batch") expect(root!.root.findByType(BatchNativeStack).props.composing).toBe(true);
  expect(routeBack).not.toHaveBeenCalled();
  expect(writes.save).not.toHaveBeenCalled(); expect(writes.post).not.toHaveBeenCalled();
});

test("Candidate navigation waits for persistent review before dispatching removal", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1";
  await mount();
  await act(async () => { form.props?.onDescriptionChange("Saved before leaving"); });
  const preventDefault = vi.fn();
  await act(async () => { navigation.state.beforeRemove?.({ preventDefault, data: { action: { type: "GO_BACK" } } }); });
  expect(preventDefault).toHaveBeenCalledOnce(); expect(navigation.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
  expect(candidateService.read("capture-1")?.review.description).toBe("Saved before leaving");
});


test("a failed Candidate review write prevents navigation and retains the previous saved review", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  candidate.failWrite();
  await act(async () => { form.props?.onDescriptionChange("Unsaved edit"); });
  const preventDefault = vi.fn();
  await act(async () => { navigation.state.beforeRemove?.({ preventDefault, data: { action: { type: "GO_BACK" } } }); });
  expect(preventDefault).toHaveBeenCalledOnce(); expect(navigation.dispatch).not.toHaveBeenCalled();
  expect(candidateService.read("capture-1")?.review.description).toBe("Market");
});

test("SEN90-R1-02 Candidate removal waits for exact review write reconciliation after a lost response", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  candidate.afterWrite(() => { candidate.afterWrite(() => {}); throw new Error("write response lost"); });
  await act(async () => { form.props?.onDescriptionChange("Saved before removal"); });
  await act(async () => { navigation.state.beforeRemove?.({ preventDefault: vi.fn(), data: { action: { type: "GO_BACK" } } }); });
  expect(navigation.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
  expect(candidateService.read("capture-1")?.review.description).toBe("Saved before removal");
  expect(candidateService.read("capture-1")?.recordRevision).toBe(1);
});

test("a Candidate's kept notification is shown in Post, and tapping it fills the form and the saved review", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  candidate.setPages([{ captures: [{ ...capture, direction: null, amountMinorUnits: null, currency: null, description: "",
    text: "Compra por $32.000 en TIENDA D1. Saldo disponible: $1.250.300" }], nextCursor: null }]);
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  type Card = { props: { notification: { text: string }; onUseAmount(minor: number): void; onUseDescription(text: string): void } };
  const card = () => form.props?.notification as unknown as Card;
  expect(card().props.notification.text).toContain("TIENDA D1");
  expect(form.props?.amount.editor.text).toBe("-32000,00"); expect(form.props?.description).toBe("TIENDA D1");
  await act(async () => { card().props.onUseAmount(125_030_000); });
  expect(form.props?.amount.editor.text).toBe("-1250300");
  await act(async () => { card().props.onUseDescription("Tienda de barrio"); });
  expect(form.props?.description).toBe("Tienda de barrio");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(candidateService.read("capture-1")?.review).toMatchObject({ amountMinorUnits: 125_030_000, direction: "out", description: "Tienda de barrio" });
});

test("a Candidate without kept text still shows its notification source and unavailable-text card", async () => {
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  const card = form.props?.notification;
  if (!React.isValidElement<ComponentProps<typeof NotificationCard>>(card)) throw new Error("Missing notification card");
  expect(card.type).toBe(NotificationCard);
  expect(card.props.notification).toEqual({ text: "", packageName: "app.bank", at: Date.parse("2026-10-24T02:00:00Z") });
});

test("an existing unresolved incoming Candidate shows its body and can use its unmarked amount without rewriting evidence", async () => {
  const text = "Recibiste 45,00 en tu cuenta\nTe llegó dinero de MARIA EJEMPLO con tu llave.";
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  candidate.setPages([{ captures: [{ ...capture, text, consentVersion: "notification-disclosure@3" }], nextCursor: null }]);
  await candidate.service.refresh();
  candidate.setValue(serializeState({ ...candidate.state(), records: candidate.state().records.map((row) => row.kind !== "active" ? row : {
    ...row, parserVersion: "suggest-v1", review: { ...row.review, amountMinorUnits: null, direction: null, description: "" },
    originalSuggestion: { ...row.originalSuggestion, amountMinorUnits: null, direction: null, description: "", currency: null },
  }) }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  const card = form.props?.notification;
  if (!React.isValidElement<ComponentProps<typeof NotificationCard>>(card)) throw new Error("Missing notification card");
  expect(card.props.notification.text).toBe(text);
  expect(form.props?.amount.editor.text).toBe("");
  await act(async () => { card.props.onUseAmount(4_500); });
  expect(form.props?.amount.editor.text).toBe("45");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(candidateService.read("capture-1")?.review).toMatchObject({ amountMinorUnits: 4_500, direction: "in" });
  expect(candidateService.read("capture-1")?.originalSuggestion.amountMinorUnits).toBeNull();
});

test("a batch save refused because a stored entry awaits its result closes the composer to show that entry", async () => {
  queryData.categories = [{
    id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food",
    nature: "Expense", natureSource: "answered",
    classification: { kind: "fallback", version: "test" },
    style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
  }];
  const sent = { id: "taxi", command: { kind: "expense" as const, payload: {
    workspaceId: "workspace", financialAccountProfileId: "daily", amount: { currency: "COP", minorUnits: 1000 },
    accountingDate: "2026-10-20", description: "Taxi", idempotencyKey: "taxi",
  } } };
  writes.batchUpdate.mockResolvedValueOnce({
    batch: { queue: [sent], pendingItemId: "taxi", receipts: { count: 0, net: 0 } },
    applied: false,
  });
  await mount();
  await act(async () => { formProps().onBatch?.(); });
  await act(async () => { root?.root.findByType(BatchNativeStack).props.onAdd(); });
  await act(async () => { formProps().onAmountChange(money("-1")); formProps().onDescriptionChange("Lunch"); });
  await act(async () => formProps().onCategory());
  const sheet = root?.root.find((node) => String(node.type) === "category-sheet");
  await act(async () => sheet?.props.onSelect("food"));
  await act(async () => sheet?.props.onDone());
  await act(async () => { formProps().onPost(); });
  const shown = root?.root.findByType(BatchNativeStack).props;
  expect({
    composing: shown?.composing,
    rows: shown?.batch.queue.map((row: { id: string }) => row.id),
    error: shown?.batch.error,
  }).toEqual({
    composing: false,
    rows: ["taxi"],
    error: "An entry in this batch was sent and its result is not known yet. Post again to check it before changing the batch.",
  });
});

test("Post pre-selects the default place from the current defaults read, and a place passed by the caller still wins", async () => {
  queryData.defaultProfileId = "wallet";
  await mount();
  expect(formProps().place).toBe("💰 Wallet");
  await act(async () => root?.unmount());
  queryData.defaultProfileId = "daily";
  await mount();
  expect(formProps().place).toBe("💰 My money");
  await act(async () => root?.unmount());
  queryData.defaultProfileId = "wallet";
  route.profileId = "daily";
  await mount();
  expect(formProps().place).toBe("💰 My money");
});


const closedWallet = () => {
  queryData.profiles = [{ id: "daily", name: "Daily", status: "open" }, { id: "savings", name: "Savings", status: "open" }];
  queryData.allProfiles = [...queryData.profiles, { id: "wallet", name: "Wallet", status: "closed" }, { id: "card", name: "Card", status: "undoing" }];
};
function placeSheetIds() {
  if (!root) throw new Error("Post route is not mounted");
  return (root.root.find((node) => String(node.type) === "place-sheet").props.places as { id: string }[]).map((place) => place.id);
}

test("an entry that names a closed Place keeps it visible as closed and posts nothing until another open Place is chosen", async () => {
  closedWallet();
  route.profileId = "wallet";
  await mount();
  await act(async () => {
    formProps().onAmountChange(money("-7"));
    formProps().onDescriptionChange("Taxi");
  });
  expect(formProps()).toMatchObject({ place: "💰 Wallet (closed)", blockedReason: "Wallet is closed. Choose another place.", canSubmit: false });
  await act(async () => formProps().onPlace());
  expect(placeSheetIds()).toEqual(["daily", "savings"]);
  await act(async () => root!.root.find((node) => String(node.type) === "place-sheet").props.onSelect("savings"));
  expect(formProps().place).toBe("💰 Savings");
  expect(formProps().blockedReason).not.toBe("Wallet is closed. Choose another place.");
  expect(writes.post).not.toHaveBeenCalled();
});

test("an entry naming a Place being undone says why it cannot post there", async () => {
  closedWallet();
  route.profileId = "card";
  await mount();
  expect(formProps()).toMatchObject({ place: "💰 Card (being undone)",
    blockedReason: "Card is being undone and takes no new movements. Choose another place.", canSubmit: false });
});

test("a Candidate whose source maps to a closed Place shows it as closed and is not confirmed until re-pointed", async () => {
  closedWallet();
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "wallet" }] }));
  await candidate.service.refresh(); candidateService = candidate.service; route.candidateId = "capture-1"; await mount();
  expect(formProps()).toMatchObject({ place: "💰 Wallet (closed)", blockedReason: "Wallet is closed. Choose another place.", canSubmit: false });
  expect(candidateService.read("capture-1")).toBeDefined();
  expect(confirmOne).not.toHaveBeenCalled();
});

test("a transfer confirmation kept from an earlier pair does not confirm the pair chosen since", async () => {
  queryData.profiles = [{ id: "daily", name: "My money" }, { id: "wallet", name: "Wallet" }, { id: "card", name: "Card" }];
  await mount();
  await act(async () => {
    formProps().onEntryType?.("transfer");
    formProps().onAmountChange(money("-1"));
    formProps().onDescriptionChange("Top up");
  });
  const place = () => root!.root.find((node) => String(node.type) === "place-sheet");
  await act(async () => formProps().onDestination?.());
  await act(async () => place().props.onSelect("wallet"));
  const shown = formProps().transferReview;
  expect(shown?.pair).toEqual({ from: "daily", to: "wallet" });
  await act(async () => formProps().onDestination?.());
  await act(async () => place().props.onSelect("card"));
  await act(async () => shown?.onConfirm(shown.pair));
  expect(formProps().transferReview?.required).toBe(true);
  expect(formProps().canSubmit).toBe(false);
  await act(async () => { formProps().onPost(); });
  expect(writes.post).not.toHaveBeenCalled();
  await act(async () => formProps().transferReview?.onConfirm(formProps().transferReview?.pair));
  await act(async () => { formProps().onPost(); });
  expect(writes.post.mock.calls.map(([command]) => command.kind === "transfer" && [command.payload.sourceFinancialAccountProfileId,
    command.payload.destinationFinancialAccountProfileId])).toEqual([["daily", "card"]]);
});

const foodCategory: Category = {
  id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food", nature: "Expense", natureSource: "answered",
  classification: { kind: "fallback", version: "test" }, style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
};
const foodJar: BudgetJar = { category: { id: "food", name: "Food", emoji: "F" }, limitMinorUnits: 1_000_000, consumptionMinorUnits: 0 };

/** A Food expense ready to post: amount, description and category, chosen the way the form's controls do. */
async function foodExpense(amount: string) {
  queryData.categories = [foodCategory];
  writes.save.mockImplementation(async (command: PendingPosting) => ({ id: "saved", command }));
  writes.post.mockImplementation(async (command: PendingPosting) => ({ description: "Lunch", amount: command.payload.amount }));
  await mount();
  await act(async () => {
    formProps().onAmountChange(money(amount));
    formProps().onDescriptionChange("Lunch");
  });
  await act(async () => formProps().onCategory());
  const sheet = () => root!.root.find((node) => String(node.type) === "category-sheet");
  await act(async () => sheet().props.onSelect("food"));
  await act(async () => sheet().props.onDone());
}
const posted = () => writes.post.mock.calls.map(([command]) => (command as PendingPosting).payload.amount.minorUnits);
const warning = () => root!.root.findAll((node) => node.props.label === "Continue anyway" && typeof node.props.onPress === "function")[0];

test("fourth review, finding 2: Continue on a Budget warning never posts an amount the warning was not checked against", async () => {
  queryData.budget = (month) => ({ month, jars: [foodJar] });
  await foodExpense("-120000");
  await act(async () => { await formProps().onPost(); });
  expect(warning()).toBeDefined();
  await act(async () => formProps().onAmountChange(withNativeText(formProps().amount, "240000")));
  await act(async () => { warning().props.onPress(); });
  expect(posted()).toEqual([]);
  await act(async () => { await formProps().onPost(); });
  await act(async () => { warning().props.onPress(); });
  expect(posted()).toEqual([24_000_000]);
});

test("fourth review, finding 3: a kept Post handler checks the Budget of the month the entry is in at the press", async () => {
  queryData.budget = (month) => ({ month, jars: month === "2026-09" ? [foodJar] : [] });
  await foodExpense("-120000");
  const kept = formProps().onPost;
  await act(async () => root!.root.find((node) => String(node.type) === "picker").props.onChange({}, new Date(2026, 8, 15, 12)));
  await act(async () => { await kept(); });
  expect(posted()).toEqual([]);
  expect(warning()).toBeDefined();
});

test("two presses of Post open one Budget warning, and two presses of Continue post the entry once", async () => {
  queryData.budget = (month) => ({ month, jars: [foodJar] });
  await foodExpense("-120000");
  const press = formProps().onPost;
  await act(async () => { press(); press(); });
  expect(convexQuery).toHaveBeenCalledTimes(1);
  expect(posted()).toEqual([]);
  const kept = warning().props.onPress as () => void;
  await act(async () => { kept(); });
  await act(async () => { kept(); });
  await act(async () => { press(); });
  expect(posted()).toEqual([12_000_000]);
});

async function marketCandidateWithFood() {
  queryData.categories = [foodCategory];
  const candidate = intakeFixture();
  candidate.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, workspaceId: "workspace", financialAccountProfileId: "daily" }] }));
  await candidate.service.refresh();
  candidateService = candidate.service;
  route.candidateId = "capture-1";
  confirmOne.mockResolvedValue({ status: "posted", description: "Market", amount: { currency: "COP", minorUnits: -45000 } });
  await mount();
  await act(async () => { await Promise.resolve(); });
  await act(async () => formProps().onCategory());
  const sheet = () => root!.root.find((node) => String(node.type) === "category-sheet");
  await act(async () => sheet().props.onSelect("food"));
  await act(async () => sheet().props.onDone());
}

test("fifth review: Post on a money-out Candidate with a category confirms it when no Budget is crossed", async () => {
  queryData.budget = (month) => ({ month, jars: [] });
  await marketCandidateWithFood();
  await act(async () => { await formProps().onPost(); });
  expect(confirmOne).toHaveBeenCalledTimes(1);
});

test("fifth review: a money-out Candidate that crosses a Budget is warned first and confirmed only on Continue", async () => {
  queryData.budget = (month) => ({ month, jars: [{ ...foodJar, limitMinorUnits: 10_000 }] });
  await marketCandidateWithFood();
  await act(async () => { await formProps().onPost(); });
  expect(confirmOne).not.toHaveBeenCalled();
  expect(warning()).toBeDefined();
  await act(async () => { warning().props.onPress(); });
  expect(confirmOne).toHaveBeenCalledTimes(1);
});
