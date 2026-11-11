import * as React from "react";
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BottomSheetProps, BottomSheetModal } from "@gorhom/bottom-sheet";
import type { CategorySheet } from "./CategorySheet";
import { CategoryPicker } from "./CategoryPicker";
import { SheetModal } from "../../ui/SheetModal";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { getFunctionName } from "convex/server";
import type { TransactionCategories } from "./transactionSelection";

const android = vi.hoisted<{ os: string; handler?: () => boolean }>(() => ({ os: "ios" }));
vi.mock("react-native", () => ({
  View: "view",
  Platform: { get OS() { return android.os; } },
  BackHandler: { addEventListener: (_event: string, handler: () => boolean) => {
    android.handler = handler;
    return { remove: () => { android.handler = undefined; } };
  } },
}));
vi.mock("@gorhom/bottom-sheet", async () => ({
  BottomSheetModal: (await vi.importActual<{ default: typeof BottomSheetModal }>("@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal")).default,
  BottomSheetModalProvider: (await vi.importActual<{ default: typeof BottomSheetModalProvider }>("@gorhom/bottom-sheet/src/components/bottomSheetModalProvider/BottomSheetModalProvider")).default,
}));
vi.mock("@gorhom/bottom-sheet/src/constants", () => ({
  INITIAL_CONTAINER_LAYOUT: { height: 800, offset: { top: 0, bottom: 0, left: 0, right: 0 } },
  MODAL_STACK_BEHAVIOR: { replace: "replace", switch: "switch" },
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (value: unknown) => useRef({ value }).current,
}));
vi.mock("@gorhom/bottom-sheet/src/hooks", () =>
  vi.importActual<Record<string, unknown>>("@gorhom/bottom-sheet/src/hooks/useBottomSheetModalInternal"));
vi.mock("@gorhom/bottom-sheet/src/utilities", () => ({ print: () => {} }));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheetHostingContainer", () => ({
  BottomSheetHostingContainer: () => null,
}));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheet", () => ({
  default: forwardRef(function NativeSheet(props: BottomSheetProps, ref) {
    useEffect(() => { props.onChange?.(props.index ?? 0, 0, 0); }, []);
    useImperativeHandle(ref, () => ({
      forceClose: () => dismissals.push(() => props.onClose?.()),
      snapToIndex: (index: number) => props.onChange?.(index, 0, 0),
    }));
    return createElement("sheet-surface", { onPanDown: () => props.onClose?.() },
      typeof props.children === "function" ? null : props.children);
  }),
}));
const provider = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), account: vi.fn(() => true) }));
vi.mock("convex/react", () => ({
  useQuery: () => [],
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":createUserCategory") ? provider.create : vi.fn(),
}));
vi.mock("./useNatureSuggestion", () => ({ useNatureSuggestion: () => ({ suggested: null, allowed: ["spend", "receive", "stillMine", "payDebt"] }) }));
vi.mock("./CategorySheet", async () => {
  return {
    CategorySheet: (props: ComponentProps<typeof CategorySheet>) => createElement(
      SheetModal,
      {
        sheetRef: props.sheetRef, onDismiss: props.onDismiss,
        presentOnMount: false, trackPresentation: true, androidBack: true, busy: props.busy,
        snapPoints: ["92%"], enableDynamicSizing: false,
        children: createElement("category-options", { ...props, testID: "category-options" }),
      },
    ),
  };
});

let root: ReactTestRenderer | undefined;
let frames: FrameRequestCallback[];
let dismissals: Array<() => void>;
beforeEach(() => {
  android.os = "ios";
  android.handler = undefined;
  frames = [];
  dismissals = [];
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function flushFrames() {
  await act(async () => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  });
}

async function flushDismissals() {
  await act(async () => { dismissals.splice(0).forEach((dismiss) => dismiss()); });
}
function Harness() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState<TransactionCategories>({ ids: [], primaryId: null });
  return createElement(BottomSheetModalProvider, null,
    createElement("caller-draft", { testID: "caller-draft", value, open: () => setVisible(true) }),
    createElement(CategoryPicker, { workspaceId: "workspace", value, onChange: setValue, visible,
      onAccountSetup: provider.account,
      onClose: () => { provider.close(); setVisible(false); },
    }));
}
function options() { return root!.root.findByProps({ testID: "category-options" }); }
async function open() {
  await act(async () => root!.root.findByProps({ testID: "caller-draft" }).props.open());
  await flushFrames();
}
async function edit(answer: "spend" | "stillMine" = "spend") {
  await act(async () => options().props.onCreate());
  await act(async () => options().props.onName("Lunch category"));
  await act(async () => options().props.onAnswer(answer));
}
async function mount() {
  provider.close.mockClear(); provider.account.mockClear(); provider.create.mockReset();
  await act(async () => { root = create(createElement(Harness)); });
  await open();
}
test("creation returns once after native dismissal and preserves its selection", async () => {
  await mount(); await edit();
  provider.create.mockResolvedValue({ kind: "category", category: { id: "lunch", nature: "Expense" } });
  await act(async () => options().props.onConfirm());
  expect(provider.close).not.toHaveBeenCalled();
  await flushDismissals();
  expect(provider.close).toHaveBeenCalledOnce();
  expect(root!.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(0);
  expect(root!.root.findByProps({ testID: "caller-draft" }).props).toMatchObject({ value: { ids: ["lunch"], primaryId: null } });
});
test("Done returns once and the picker can reopen", async () => {
  await mount();
  await act(async () => options().props.onDone());
  expect(provider.close).not.toHaveBeenCalled();
  await flushDismissals();
  expect(provider.close).toHaveBeenCalledOnce();
  await open();
  expect(options().props.editor).toBeNull();
});
test("account handoff follows native dismissal and returns once", async () => {
  await mount(); await edit("stillMine");
  provider.account.mockReturnValue(true);
  await act(async () => options().props.onConfirm());
  expect(provider.close).not.toHaveBeenCalled();
  await flushDismissals();
  expect(provider.close).toHaveBeenCalledOnce();
  expect(provider.account).toHaveBeenCalledOnce();
  expect(provider.create).not.toHaveBeenCalled();
});
test("invalid and failed creation stay open and retry returns once", async () => {
  await mount();
  await act(async () => options().props.onCreate());
  await act(async () => options().props.onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
  await act(async () => options().props.onName("Lunch category"));
  await act(async () => options().props.onAnswer("spend"));
  provider.create.mockRejectedValueOnce(new Error("offline"));
  await act(async () => options().props.onConfirm());
  expect(options().props.editor).toMatchObject({ name: "Lunch category", answer: "spend" });
  expect(provider.close).not.toHaveBeenCalled();
  provider.create.mockResolvedValueOnce({ kind: "category", category: { id: "lunch", nature: "Expense" } });
  await act(async () => options().props.onConfirm());
  expect(provider.close).not.toHaveBeenCalled();
  await flushDismissals();
  expect(provider.close).toHaveBeenCalledOnce();
});

test("Android Back and repeated confirm cannot leave while creation is pending", async () => {
  android.os = "android";
  await mount(); await edit();
  let finish: ((result: unknown) => void) | undefined;
  provider.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { const confirm = options().props.onConfirm; confirm(); confirm(); });
  expect(provider.create).toHaveBeenCalledOnce();
  await act(async () => { expect(android.handler?.()).toBe(true); });
  expect(dismissals).toHaveLength(0);
  expect(provider.close).not.toHaveBeenCalled();
  await act(async () => finish?.({ kind: "category", category: { id: "lunch", nature: "Expense" } }));
  await flushDismissals();
  expect(provider.close).toHaveBeenCalledOnce();
});
test("swipe cancellation returns once and each reopened editor starts fresh", async () => {
  await mount();
  for (let iteration = 0; iteration < 3; iteration += 1) {
    await edit();
    await act(async () => root!.root.find((node) => String(node.type) === "sheet-surface").props.onPanDown());
    expect(provider.close).toHaveBeenCalledTimes(iteration + 1);
    await open();
    expect(options().props.editor).toBeNull();
  }
});

test("Android Back before acknowledgement is ignored and the next Back closes the picker once", async () => {
  android.os = "android";
  provider.close.mockClear();
  await act(async () => { root = create(createElement(Harness)); });
  await act(async () => root!.root.findByProps({ testID: "caller-draft" }).props.open());
  await act(async () => { expect(android.handler?.()).toBe(true); });
  await flushFrames();
  await flushDismissals();
  expect(root!.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(1);
  expect(provider.close).not.toHaveBeenCalled();
  await act(async () => { expect(android.handler?.()).toBe(true); });
  await flushDismissals();
  expect(root!.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(0);
  expect(provider.close).toHaveBeenCalledOnce();
  await open();
  expect(options().props.editor).toBeNull();
});
