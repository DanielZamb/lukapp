import * as React from "react";
import { createElement } from "react";
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
const form = vi.hoisted(() => ({ sourceNote: undefined as string | undefined }));
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
  router: { back: vi.fn(), replace: vi.fn(), setParams: vi.fn() },
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
    save: vi.fn(),
    post: vi.fn(),
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
vi.mock("./usePostingEditor", () => ({
  usePostingEditor: () => ({
    amount: "-",
    description: "",
    date: "2026-10-17",
    entryType: "normal",
    profileId: "daily",
    destinationId: null,
    categories: { ids: [], primaryId: null },
    direction: "out",
    editable: true,
    loading: false,
    busy: false,
    pending: false,
    canSubmit: false,
    canKeepDraft: false,
    error: "",
    posted: null,
    setup: null,
    lockEntryType: false,
    blockedByPendingPostings: false,
    setAmount: vi.fn(),
    setDescription: vi.fn(),
    setEntryType: vi.fn(),
    setProfileId: vi.fn(),
    setDestinationId: vi.fn(),
    setSetup: vi.fn(),
    setCategories: vi.fn(),
    setDate: vi.fn(),
    submit: vi.fn(),
    keepDraft: vi.fn(),
    dismissPosted: vi.fn(),
  }),
}));
vi.mock("./PostingForm", () => ({
  PostingForm: (props: { sourceNote?: string }) => {
    form.sourceNote = props.sourceNote;
    return createElement("view");
  },
}));
vi.mock("../categories/CategoryPicker", () => ({ CategoryPicker: "picker" }));
vi.mock("../categories/transactionSelection", () => ({
  canPostCategories: () => true,
  needsPrimary: () => false,
}));
vi.mock("../intake/facts", () => ({
  factsFromCandidate: () => ({}),
  suggestionOf: () => ({}),
}));
vi.mock("./PlaceSheet", () => ({ PlaceSheet: "place-sheet" }));
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
  Platform: { OS: "ios" },
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
