import * as React from "react";
import { createElement, useImperativeHandle, type ComponentProps } from "react";
import type { PostingFormProps } from "./PostingForm";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { seedCandidate } from "../intake/devSeed";

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
  useQuery: () => [],
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
      functionalCurrency: "COP",
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
vi.mock("../categories/CategoryPicker", () => ({ CategoryPicker: "picker" }));
vi.mock("../categories/transactionSelection", () => ({
  canPostCategories: () => true,
  needsPrimary: () => false,
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
