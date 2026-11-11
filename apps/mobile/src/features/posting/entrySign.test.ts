import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport", Text: "text", View: "view", Pressable: "button", ScrollView: "scroll",
  TextInput: "input", ActivityIndicator: "spinner", Platform: { OS: "android", select: (values: { android?: unknown }) => values.android },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet", BottomSheetScrollView: "scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
  BottomSheetView: "view",
}));

import { LanguageProvider } from "../../i18n";
import { AmountField } from "../amount/AmountField";
import { samsungPhone } from "../amount/phone.testSupport";
import type { LocalEntryDraft, LocalEntryDraftsPort, LocalEntryFacts } from "../localEntryDrafts";
import type { PendingPosting } from "./pendingPostingSchema";
import { PostingForm } from "./PostingForm";
import { emptyPostingForm } from "./PostingForm.fixtures";
import { usePostingEditor, type IntakeBinding, type PostingDraftsSession, type PostingTransport } from "./usePostingEditor";

/**
 * Where an entry's sign comes from now that the amount field has no sign key: the nature of its category for a new
 * entry (Income is money in, Expense money out), money out when it has none, and the saved or suggested sign when it
 * reopens. These render the real form and type on the test phone, so the sign is never set through the field.
 */
const account = { workspaceId: "workspace", financialAccountProfileId: "bank", currency: "COP", timeZone: "America/Bogota" } as const;
let root: ReactTestRenderer | undefined;
let editor: ReturnType<typeof usePostingEditor>;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

function transport() {
  let key = 0;
  return {
    load: vi.fn(async () => ({ kind: "none" as const })),
    save: vi.fn(async (command: PendingPosting, draftId?: string) => ({ id: draftId ?? "saved", command })),
    post: vi.fn(async (command: PendingPosting) => ({ description: "", amount: command.payload.amount })),
    clear: vi.fn(async () => {}), abort: vi.fn(async () => {}), newKey: () => `entry-${++key}`,
  } satisfies PostingTransport;
}
const noop = () => {};

function Composer({ api, session }: { api: PostingTransport; session: PostingDraftsSession }) {
  editor = usePostingEditor(account, api, session);
  return createElement(PostingForm, {
    ...emptyPostingForm, currency: "COP", amount: editor.amount, onAmountChange: editor.setAmount, amountNotice: editor.amountNotice,
    editable: editor.editable, canSubmit: editor.canSubmit, entryType: editor.entryType, onEntryType: editor.setEntryType,
    onDescriptionChange: noop, onBack: noop, onPlace: noop, onCategory: noop, onDate: noop, onDone: noop,
    onPost: () => void editor.submit(),
  });
}

async function render(session: PostingDraftsSession = {}, api = transport()) {
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Composer, { api, session })));
  });
  return { api, phone: samsungPhone(input) };
}
const input = () => root!.root.find((node) => node.type === "input" && node.props.accessibilityLabel === "Signed amount");
/** The sign the form shows beside the amount, by its spoken name. */
const signShown = () => root!.root.findAll((node) => node.type === "text"
  && (node.props.accessibilityLabel === "minus" || node.props.accessibilityLabel === "plus"))
  .map((node) => `${node.props.accessibilityLabel} ${node.children.join("")}`);
const alerts = () => root!.root.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert")
  .map((node) => node.children.join(""));
const choose = async (ids: string[], nature: "Income" | "Expense" | null) => {
  await act(async () => editor.setCategories({ ids, primaryId: null }, nature));
};
const post = async () => { await act(async () => { await editor.submit(); }); };

test("a new entry with no category opens as money out, and no control in the form sets the sign", async () => {
  const { api, phone } = await render();
  expect(signShown()).toEqual(["minus −"]);
  expect(root!.root.findByType(AmountField).findAll((node) => typeof node.props.onPress === "function")).toEqual([]);
  expect(root!.root.findAll((node) => typeof node.props.onPress === "function"
    && /sign|minus|plus|[+−]/i.test(String(node.props.accessibilityLabel ?? "")))).toEqual([]);
  await phone.type("12,50");
  expect(editor.direction).toBe("out");
  expect(editor.snapshot()?.minorUnits).toBe(-1250);
  for (const [at, typed] of [[0, "+"], [5, "+"], [0, "-"], [2, "−"]] as const) {
    await phone.select(at);
    await phone.type(typed);
    expect(alerts()).toEqual(["Type only digits and separators, for example 1.234,50"]);
    expect(editor.canSubmit).toBe(false);
    expect(signShown(), "a typed sign never becomes the entry's sign").toEqual(["minus −"]);
    await phone.backspace();
  }
  expect(phone.text).toBe("12,50");
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits])).toEqual([["expense", 1250]]);
});

test("a category's nature sets the sign, and changing the category changes the sign but not the typed text or its input", async () => {
  const { api, phone } = await render();
  await phone.type("12,50");
  const typedInto = input();
  await choose(["salary"], "Income");
  expect(signShown()).toEqual(["plus +"]);
  expect(phone.text).toBe("12,50");
  expect(input()).toBe(typedInto);
  expect(editor.direction).toBe("in");
  await choose(["food"], "Expense");
  expect(signShown()).toEqual(["minus −"]);
  expect(phone.text).toBe("12,50");
  expect(input()).toBe(typedInto);
  expect(editor.direction).toBe("out");
  await choose(["salary"], "Income");
  await phone.backspace();
  await phone.type("9");
  expect(phone.text).toBe("12,59");
  expect(signShown(), "typing keeps the category's sign").toEqual(["plus +"]);
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits, command.payload]))
    .toEqual([["income", 1259, expect.objectContaining({ userCategoryIds: ["salary"] })]]);
});

test("a category chosen before any digit sets the sign the typed amount is sent with", async () => {
  const { api, phone } = await render();
  await choose(["salary"], "Income");
  expect(signShown()).toEqual(["plus +"]);
  await phone.type("300");
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits])).toEqual([["income", 30000]]);
});

test("a category without a nature leaves the sign as it was", async () => {
  const { phone } = await render();
  await phone.type("5");
  await choose(["unsorted"], null);
  expect(signShown()).toEqual(["minus −"]);
  await choose(["salary"], "Income");
  await choose(["unsorted"], null);
  expect(signShown()).toEqual(["plus +"]);
  expect(phone.text).toBe("5");
});

test("clearing the categories keeps the sign of the last nature chosen, so money in without a category starts from an Income category", async () => {
  const { api, phone } = await render();
  await phone.type("40");
  await choose(["salary"], "Income");
  await choose([], null);
  expect(editor.categories.ids).toEqual([]);
  expect(signShown()).toEqual(["plus +"]);
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits])).toEqual([["income", 4000]]);
  expect(signShown(), "the next entry opens as money out again").toEqual(["minus −"]);
});

function draftsPort(drafts: LocalEntryDraft[]) {
  return {
    keep: vi.fn(async ({ draftId }) => draftId ?? "kept"),
    read: vi.fn(async (id: string) => drafts.find((draft) => draft.id === id) ?? null),
    discard: vi.fn(async () => "discarded" as const),
  } satisfies LocalEntryDraftsPort;
}
const factsWith = (amountText: string, categories: string[]): LocalEntryFacts => ({
  workspaceId: "workspace", currency: "COP", entryType: "normal", amountText, amountFormat: "cop/1",
  accountingDate: "2026-10-16", description: "Kept", profileId: "bank", destinationId: null,
  categories: { ids: categories, primaryId: null },
});

test.each([
  ["+12,50", ["salary"], "plus +", "income"],
  ["-12,50", ["food"], "minus −", "expense"],
  ["+12,50", [], "plus +", "income"],
  ["-12,50", [], "minus −", "expense"],
] as const)("a Draft saved as %s with categories %j reopens with its sign and keeps it while the amount is retyped", async (text, categories, shown, kind) => {
  const draft: LocalEntryDraft = { id: "kept-1", createdAt: 1, expiresAt: 2, status: "open", facts: factsWith(text, [...categories]) };
  const { api, phone } = await render({ drafts: draftsPort([draft]), draftId: "kept-1" });
  expect(signShown()).toEqual([shown]);
  expect(phone.text).toBe("12,50");
  await phone.select(0, 5);
  await phone.backspace();
  await phone.type("7");
  expect(signShown()).toEqual([shown]);
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits])).toEqual([[kind, 700]]);
});

function candidate(amountText: string): IntakeBinding {
  return {
    id: "candidate", facts: factsWith(amountText, []),
    originalSuggestion: { direction: amountText.startsWith("-") ? "out" : "in", description: "Kept", amount: { currency: "COP", minorUnits: 126400 },
      accountingDate: "2026-10-16", financialAccountProfileId: "bank", userCategoryIds: [], primaryUserCategoryId: null },
    frozen: false, held: null, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const), confirm: vi.fn(),
  };
}

test.each([
  ["-1.264", [["minus", "−"]], "out"],
  ["1.264", [], "in"],
] as const)("a notification Candidate suggested as %s keeps its direction while the amount is retyped", async (text, shown, direction) => {
  const binding = candidate(text);
  const { phone } = await render({ intake: binding });
  expect(signShown()).toEqual(shown.map(([name, glyph]) => `${name} ${glyph}`));
  expect(editor.direction).toBe(direction);
  await phone.select(0, phone.text.length);
  await phone.backspace();
  await phone.type("2000");
  expect(editor.direction).toBe(direction);
  await post();
  expect(binding.confirm).toHaveBeenCalledWith(expect.objectContaining({ direction, amount: { currency: "COP", minorUnits: 200000 } }));
});

const batchRow = (kind: "income" | "expense", categories: string[]): PendingPosting => ({
  kind, payload: { workspaceId: "workspace", amount: { currency: "COP", minorUnits: 125000 }, accountingDate: "2026-10-17",
    description: "Row", idempotencyKey: "row-key", financialAccountProfileId: "bank", ...(categories.length ? { userCategoryIds: categories } : {}) },
});

test.each([
  ["income", ["salary"]], ["income", []], ["expense", ["food"]], ["expense", []],
] as const)("a batch row saved as %s with categories %j reopens in the composer with its direction", async (kind, categories) => {
  const { api, phone } = await render();
  await act(async () => { editor.editBatchDraft({ command: batchRow(kind, [...categories]) }); });
  expect(editor.direction).toBe(kind === "income" ? "in" : "out");
  expect(signShown()).toEqual(kind === "expense" ? ["minus −"] : []);
  expect(input().props.value).toBe("1250,00");
  await phone.select(0, "1250,00".length);
  await phone.backspace();
  await phone.type("9");
  expect(editor.direction).toBe(kind === "income" ? "in" : "out");
  await post();
  expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload.amount.minorUnits])).toEqual([[kind, 900]]);
});

test("a transfer sends the typed magnitude whatever sign the amount holds; From and To decide where the money goes", async () => {
  for (const nature of [null, "Income"] as const) {
    const { api, phone } = await render();
    if (nature) await choose(["salary"], nature);
    await act(async () => editor.setEntryType("transfer"));
    await phone.type("500");
    await act(async () => editor.setDestinationId("card"));
    await act(async () => editor.confirmTransferReview());
    await post();
    expect(api.post.mock.calls.map(([command]) => [command.kind, command.payload])).toEqual([["transfer", expect.objectContaining({
      sourceFinancialAccountProfileId: "bank", destinationFinancialAccountProfileId: "card", amount: { currency: "COP", minorUnits: 50000 },
    })]]);
    await act(async () => root?.unmount()); root = undefined;
  }
});
