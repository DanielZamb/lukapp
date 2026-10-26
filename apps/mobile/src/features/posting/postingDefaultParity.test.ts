import * as React from "react";
import {
  createElement as h,
  createRef,
  useEffect,
  type ReactElement,
} from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PostingForm } from "./PostingForm";
import { BatchNativeStack } from "./BatchNativeStack";
import { ComposeModeToggle } from "./ComposeModeToggle";
import { PlaceSheet } from "./PlaceSheet";
import { AccountSetupForm } from "./AccountSetupForm";
import { PostingImpactSheet } from "../budget/PostingImpactSheet";
import { ThemeProvider, useSetThemeMode } from "../../ui/themeContext";
import { emptyPostingForm } from "./PostingForm.fixtures";
import type { usePostingBatch, QueuedPosting } from "./usePostingBatch";
import type { PlaceDraft } from "./usePostingEditor";
import type { PostingBudgetImpact } from "../budget/postingImpact";
import type { ThemeMode } from "../../ui/tokens";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet",
  BottomSheetScrollView: "sheet-scroll",
  BottomSheetView: "sheet-view",
  BottomSheetTextInput: "input",
  BottomSheetFooter: "sheet-footer",
  BottomSheetBackdrop: "backdrop",
}));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: (
    props: React.PropsWithChildren<{
      headerConfig?: { children?: React.ReactNode; hidden?: boolean };
    }>,
  ) =>
    h(
      "stack-page",
      null,
      props.headerConfig?.hidden ? null : props.headerConfig?.children,
      props.children,
    ),
  ScreenStackHeaderLeftView: "header-left",
  ScreenStackHeaderRightView: "header-right",
}));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  KeyboardAvoidingView: "keyboard",
  Platform: { OS: "ios" },
  Keyboard: { dismiss: vi.fn() },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  StyleSheet: {
    create: (value: unknown) => value,
    flatten: flat,
    hairlineWidth: 1,
    absoluteFill: {},
  },
}));

function flat(value: unknown): Record<string, unknown> {
  return Array.isArray(value)
    ? Object.assign({}, ...value.map(flat))
    : typeof value === "object" && value !== null
      ? Object.fromEntries(Object.entries(value))
      : {};
}
const noop = () => {};
const handlers = {
  onAmountChange: noop,
  onDescriptionChange: noop,
  onBack: noop,
  onPlace: noop,
  onCategory: noop,
  onDate: noop,
  onPost: noop,
  onDone: noop,
  onEntryType: noop,
};
let mounted: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = undefined;
  vi.unstubAllGlobals();
});
function Appearance({
  mode,
  children,
}: React.PropsWithChildren<{ mode: ThemeMode }>) {
  const setMode = useSetThemeMode();
  useEffect(() => setMode(mode), [mode, setMode]);
  return children;
}
function effectiveTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(effectiveTree);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (
        key === "style" ||
        key === "contentContainerStyle" ||
        key === "backgroundStyle"
      ) {
        const style =
          typeof item === "function" ? item({ pressed: false }) : item;
        return [[key, effectiveTree(flat(style))]];
      }
      if (
        typeof item === "function" ||
        key.startsWith("on") ||
        key === "ref" ||
        key === "allowFontScaling" ||
        key === "accessibilityLabel"
      )
        return [];
      if (item === undefined) return [];
      return [[key, effectiveTree(item)]];
    }),
  );
}
const entry: QueuedPosting = {
  id: "one",
  command: {
    kind: "expense",
    payload: {
      workspaceId: "workspace",
      financialAccountProfileId: "wallet",
      accountingDate: "2026-10-26",
      description: "Taxi to work",
      amount: { currency: "COP", minorUnits: 1250000 },
      idempotencyKey: "one",
    },
  },
};
const batch = (
  queue: QueuedPosting[] = [],
): ReturnType<typeof usePostingBatch> => ({
  queue,
  busy: false,
  editable: true,
  error: "",
  posted: null,
  keep: vi.fn(),
  remove: noop,
  postAll: vi.fn(),
});
const batchProps = {
  currency: "COP",
  composing: false,
  compose: null,
  onCancel: noop,
  onAdd: noop,
  onEdit: noop,
  onBack: noop,
  onOne: noop,
  rowFor: () => ({
    category: "Transport",
    place: "Wallet",
    emoji: "🚕",
    color: "#6d28d9",
  }),
};
const place: PlaceDraft = {
  name: "Trip",
  productKind: "savingsAccount",
  emoji: "🐷",
  amount: "0",
  date: "2026-10-26",
};
const setupProps = {
  sheetRef: createRef<BottomSheetModal>(),
  currency: "COP",
  editable: true,
  busy: false,
  pending: false,
  error: "",
  canSubmit: true,
  onChange: noop,
  onSubmit: noop,
  onDismiss: noop,
};
const hits = [
  {
    category: { id: "food", name: "Food", emoji: "🍔" },
    overMinorUnits: 1250000,
  },
  {
    category: { id: "family", name: "Family", emoji: "👪" },
    overMinorUnits: 500000,
  },
] satisfies PostingBudgetImpact;
const examples: [string, () => ReactElement][] = [
  ["one-empty", () => h(PostingForm, { ...emptyPostingForm, ...handlers })],
  [
    "one-filled",
    () =>
      h(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        amount: "-12.500",
        description: "Taxi to work",
        place: "👛 Wallet",
        category: "🚕 Transport",
        canSubmit: true,
        batchCount: 3,
      }),
  ],
  [
    "one-transfer",
    () =>
      h(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        entryType: "transfer",
        destination: "Savings",
        transferReview: {
          required: true,
          canConfirm: true,
          onSwap: noop,
          onConfirm: noop,
        },
      }),
  ],
  [
    "one-retry",
    () =>
      h(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        amount: "-12.500",
        description: "Taxi to work",
        editable: false,
        pending: true,
        error: "Offline",
        canSubmit: true,
      }),
  ],
  [
    "one-posted",
    () =>
      h(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        posted: "Taxi to work · −COP 12.500",
      }),
  ],
  [
    "add-to-batch",
    () =>
      h(PostingForm, { ...emptyPostingForm, ...handlers, saveToBatch: true }),
  ],
  ["batch-empty", () => h(BatchNativeStack, { ...batchProps, batch: batch() })],
  [
    "batch-filled",
    () => h(BatchNativeStack, { ...batchProps, batch: batch([entry]) }),
  ],
  [
    "mode-count",
    () => h(ComposeModeToggle, { mode: "batch", count: 3, onMode: noop }),
  ],
  [
    "place-picker",
    () =>
      h(PlaceSheet, {
        sheetRef: createRef<BottomSheetModal>(),
        title: "From",
        search: "",
        onSearch: noop,
        places: [
          { id: "wallet", name: "Wallet", emoji: "👛" },
          { id: "savings", name: "Savings", emoji: "🐷" },
        ],
        selectedId: "wallet",
        disabled: false,
        onDismiss: noop,
        onSelect: noop,
        onAdd: noop,
      }),
  ],
  ["place-setup", () => h(AccountSetupForm, { ...setupProps, value: place })],
  [
    "place-setup-retry",
    () =>
      h(AccountSetupForm, {
        ...setupProps,
        value: place,
        pending: true,
        editable: false,
        error: "Offline",
      }),
  ],
  [
    "impact",
    () =>
      h(PostingImpactSheet, {
        currency: "COP",
        description: "Family meal",
        hits,
        onContinue: noop,
        onReconsider: noop,
      }),
  ],
];

test.each(["light", "dark"] as const)(
  "posting default native styles and copy stay identical in %s",
  async (mode) => {
    for (const [name, element] of examples) {
      await act(async () => {
        mounted = create(
          h(ThemeProvider, null, h(Appearance, { mode }, element())),
        );
      });
      expect(effectiveTree(mounted?.toJSON())).toMatchSnapshot(name);
      await act(async () => mounted?.unmount());
      mounted = undefined;
    }
  },
);
