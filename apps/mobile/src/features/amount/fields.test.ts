import * as React from "react";
import { createElement, createRef, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
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

import { createTranslator, type Language } from "../../../../../src/i18n";
import { LanguageProvider } from "../../i18n";
import type { PendingPosting } from "../posting/pendingPostingSchema";
import { PostingForm } from "../posting/PostingForm";
import { emptyPostingForm } from "../posting/PostingForm.fixtures";
import { AccountSetupForm } from "../posting/AccountSetupForm";
import { usePostingEditor, type PostingTransport } from "../posting/usePostingEditor";
import { BudgetComposer } from "../budget/BudgetComposer";
import { BudgetEditorSheet } from "../budget/BudgetEditorSheet";
import { BudgetLimitSheet } from "../budget/BudgetLimitSheet";
import { monthInSentence, type BudgetJar } from "../budget/model";
import { useBudgetEditor, type BudgetTransport } from "../budget/useBudgetEditor";
import { RecoveryDraft, RecoveryMoveScreen } from "../recovery/RecoveryScreens";
import type { RecoveryCandidate, RecoveryPlace, RecoveryPlanView } from "../recovery/model";
import { useRecoveryEditor, type RecoveryEditorTransport } from "../recovery/useRecoveryEditor";
import { useRecoveryMove, type RecoveryMoveTransport } from "../recovery/useRecoveryMove";
import { amountOfMinorUnits, openAmount } from "./session";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

type Currency = "COP" | "USD";
type Field = {
  name: string;
  input: (language: Language, currency: Currency) => string;
  submit: (language: Language) => string;
  owner: (currency: Currency, sent: number[]) => ReactElement;
  /** Text in the field before typing, which the person clears first. */
  starts?: boolean;
  accepts?: (minorUnits: number) => boolean;
  /** The owner's own replacement of the amount, when it has one, as the person or the app triggers it. */
  replaces?: string;
};
/** The rendered owner's replacement of its amount. */
let replaceOwnerAmount: () => void = () => {};

const account = (currency: Currency) => ({ workspaceId: "workspace", financialAccountProfileId: "cash", currency, timeZone: "America/Bogota" });
function postingTransport(sent: number[]): PostingTransport {
  let key = 0;
  return {
    load: async () => ({ kind: "none" }),
    save: async (command) => ({ id: "saved", command }),
    post: async (command: PendingPosting) => {
      sent.push(command.payload.amount.minorUnits);
      return { description: "", amount: command.payload.amount };
    },
    clear: async () => {}, abort: async () => {}, newKey: () => `key-${++key}`,
  };
}
const noop = () => {};
const formHandlers = { onDescriptionChange: noop, onBack: noop, onPlace: noop, onCategory: noop, onDate: noop, onDone: noop };

function PostComposer({ currency, sent, batch }: { currency: Currency; sent: number[]; batch: boolean }) {
  const editor = usePostingEditor(account(currency), postingTransport(sent));
  replaceOwnerAmount = editor.resetComposer;
  return createElement(PostingForm, {
    ...emptyPostingForm, ...formHandlers, currency, amount: editor.amount, onAmountChange: editor.setAmount,
    amountNotice: editor.amountNotice, signLocked: editor.signLocked, editable: editor.editable, canSubmit: editor.canSubmit,
    saveToBatch: batch,
    onPost: () => {
      if (!batch) { void editor.submit(); return; }
      const captured = editor.captureForBatch();
      if (captured) sent.push(captured.command.payload.amount.minorUnits);
    },
  });
}

function PlaceSetup({ currency, sent }: { currency: Currency; sent: number[] }) {
  const editor = usePostingEditor(account(currency), postingTransport(sent));
  replaceOwnerAmount = () => editor.setSetup({ name: "Trip", productKind: "savingsAccount", emoji: "🏦", amount: openAmount(currency, "0"),
    date: "2026-11-10", target: { kind: "source" } });
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current || !editor.editable) return;
    started.current = true;
    editor.setSetup({ name: "Trip", productKind: "savingsAccount", emoji: "🏦", amount: openAmount(currency, "0"),
      date: "2026-11-10", target: { kind: "source" } });
  });
  return createElement(AccountSetupForm, {
    sheetRef: createRef<BottomSheetModal>(), value: editor.setup, currency, editable: editor.editable, busy: editor.busy,
    pending: editor.pending, error: editor.error, canSubmit: editor.canSubmit, onChange: editor.changeSetup,
    onSubmit: () => void editor.submit(), onDismiss: noop,
  });
}

const food = { id: "food", name: "Food", emoji: "🛒" };
function budgetTransport(sent: number[]): BudgetTransport {
  let key = 0;
  return {
    send: async (command) => {
      if (command.kind === "amount") sent.push(command.args.limit.minorUnits);
      return { revision: { id: "r", kind: "set", categoryId: "food", limitMinorUnits: 0 } } as never;
    },
    newKey: () => `budget-${++key}`, reportFailure: () => false, onSaved: noop,
  };
}
const jar: BudgetJar & { revisionId: string } = { category: food, limitMinorUnits: 400_000, consumptionMinorUnits: 100_000, revisionId: "r1" };

function Composer({ currency, sent }: { currency: Currency; sent: number[] }) {
  const editor = useBudgetEditor({ workspaceId: "workspace", month: "2026-11", currency, initialCategoryId: "food", jar: null, removedLimits: [] },
    budgetTransport(sent));
  replaceOwnerAmount = editor.onResetAmount;
  return createElement(BudgetComposer, { ...editor, category: food, currency, spentMinorUnits: 100_000, color: "#047857",
    onSave: () => void editor.submit(), onBack: noop });
}
function AddSheet({ currency, sent }: { currency: Currency; sent: number[] }) {
  const editor = useBudgetEditor({ workspaceId: "workspace", month: "2026-11", currency, initialCategoryId: "food", jar: null, removedLimits: [] },
    budgetTransport(sent));
  replaceOwnerAmount = () => editor.onAmount(amountOfMinorUnits(currency, 250_000));
  return createElement(BudgetEditorSheet, { ...editor, title: "Add Budget", monthLabel: "November 2026", currency, policyCopy: "",
    categories: [food], categoryFixed: false, onSave: () => void editor.submit(), onDismiss: noop });
}
function LimitSheet({ currency, sent }: { currency: Currency; sent: number[] }) {
  const seed = { workspaceId: "workspace", month: "2026-11", currency, jar, removedLimits: [] };
  const editor = useBudgetEditor(seed, budgetTransport(sent));
  replaceOwnerAmount = editor.onResetAmount;
  return createElement(BudgetLimitSheet, { ...editor, month: "2026-11", currency, jar: seed.jar, color: "#047857",
    previousMonth: "2026-10", previousSpendMinorUnits: 0, onLimit: noop, onSave: () => void editor.submit(),
    onSpendNothing: noop, onRemove: noop, onDismiss: noop });
}

const candidate: RecoveryCandidate = {
  journalEntryId: "exp-1", title: "Laptop repair", accountingDate: "2026-09-09",
  amountMinorUnits: 400_000, financialAccountProfileId: "daily", placeName: "Daily",
};
const places: RecoveryPlace[] = [
  { id: "savings", name: "Savings", productKind: "savingsAccount" },
  { id: "daily", name: "Daily", productKind: "bankAccount" },
];
function Proposal({ currency, sent }: { currency: Currency; sent: number[] }) {
  const transport: RecoveryEditorTransport = {
    save: async (request) => { sent.push(request.installmentMinorUnits); return {} as never; },
    newKey: () => "plan-key", reportFailure: () => false, onSaved: noop, keep: async () => {}, forget: async () => {},
  };
  const editor = useRecoveryEditor({ workspaceId: "workspace", currency, candidate, destinations: places }, transport);
  replaceOwnerAmount = () => editor.onMonths(6);
  return createElement(RecoveryDraft, { ...editor, candidate, currency, destinations: places, onSave: () => void editor.submit(), onBack: noop });
}
const plan = (currency: Currency): RecoveryPlanView => ({
  canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined,
  contributionHistory: [], status: "active", id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1",
  sourceTitle: "Laptop repair", destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000, impliedAnnualRateBps: 1800,
  activationDate: "2026-09-01", activationMonth: "2026-09", currency, recoveredMinorUnits: 0, remainingMinorUnits: 1_200_000,
  targetMinorUnits: 1_380_000, dueMinorUnits: 230_000,
});
function Move({ currency, sent }: { currency: Currency; sent: number[] }) {
  const transport: RecoveryMoveTransport = {
    move: async (request) => { sent.push(request.amount.minorUnits); return {} as never; },
    newKey: () => "move-key", reportFailure: () => false, onMoved: noop, keep: async () => {}, forget: async () => {},
  };
  const move = useRecoveryMove({ workspaceId: "workspace", timeZone: "America/Bogota", plan: plan(currency), sources: places }, transport);
  return createElement(RecoveryMoveScreen, { ...move, plan: plan(currency), sources: places, onBack: noop });
}

const label = (language: Language) => createTranslator(language).t;
const fields: Field[] = [
  { name: "Post one entry", replaces: "the composer is reset", input: (l) => label(l)("posting.formAmountA11y"), submit: (l) => label(l)("posting.formPost"),
    owner: (currency, sent) => createElement(PostComposer, { currency, sent, batch: false }) },
  { name: "Post batch row", replaces: "the composer is reset", input: (l) => label(l)("posting.formAmountA11y"), submit: (l) => label(l)("posting.formAddToBatch"),
    owner: (currency, sent) => createElement(PostComposer, { currency, sent, batch: true }) },
  { name: "place setup balance", replaces: "a new place draft opens", input: (l) => label(l)("posting.setupBalance"), submit: (l) => label(l)("posting.setupSubmit"), starts: true,
    owner: (currency, sent) => createElement(PlaceSetup, { currency, sent }) },
  { name: "Budget creation", replaces: "the amount is reset", input: (l) => label(l)("budget.monthlyLimitA11y"), submit: (l) => label(l)("budget.saveLimit"),
    owner: (currency, sent) => createElement(Composer, { currency, sent }) },
  { name: "Budget add sheet", replaces: "a shortcut replaces the amount", input: (l, c) => label(l)("budget.limitInA11y", { currency: c }), submit: (l) => label(l)("budget.saveBudget"),
    owner: (currency, sent) => createElement(AddSheet, { currency, sent }) },
  { name: "Budget limit sheet", replaces: "the amount is reset", input: (l, c) => label(l)("lifecycle.limitInputA11y", { currency: c }),
    submit: (l) => label(l)("budget.saveMonth", { month: monthInSentence("2026-11", l) }),
    starts: true, owner: (currency, sent) => createElement(LimitSheet, { currency, sent }) },
  { name: "Recovery proposal", replaces: "a month count replaces the amount", input: (l, c) => label(l)("recovery.draftMonthly", { currency: c }), submit: (l) => label(l)("recovery.draftActivate"),
    starts: true, accepts: (minor) => minor >= 100_000 && minor <= 400_000,
    owner: (currency, sent) => createElement(Proposal, { currency, sent }) },
  { name: "Recovery Move money", input: (l, c) => label(l)("recovery.moveAmountA11y", { currency: c }), submit: (l) => label(l)("recovery.moveSubmit"),
    starts: true, owner: (currency, sent) => createElement(Move, { currency, sent }) },
];

let switchCurrency: (currency: Currency) => void = () => {};
/** The field's owner in a workspace whose currency can change while the screen is open. */
function Workspace({ field, initial, sent }: { field: Field; initial: Currency; sent: number[] }) {
  const [currency, setCurrency] = useState(initial);
  switchCurrency = setCurrency;
  return field.owner(currency, sent);
}

async function render(field: Field, initial: Currency, language: Language) {
  const sent: number[] = [];
  let currency = initial;
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(Workspace, { field, initial, sent })));
  });
  const input = () => root!.root.find((node) => node.type === "input" && node.props.accessibilityLabel === field.input(language, currency));
  const control = (name: string) => root!.root.find((node: ReactTestInstance) =>
    typeof node.type === "string" && (node.props.accessibilityLabel === name || node.props.label === name) && !!node.props.onPress);
  const submit = async () => { await act(async () => { await control(field.submit(language)).props.onPress(); }); };
  /** The Save handler as this render hands it out; a bottom sheet's portal hands out the previous render's. */
  const saveHandler = () => { const press = control(field.submit(language)).props.onPress as () => unknown; return async () => { await act(async () => { await press(); }); }; };
  const type = async (characters: string) => {
    for (const character of characters) {
      const node = input();
      const value = node.props.value as string;
      await act(async () => node.props.onChangeText(value + character));
      const end = value.length + 1;
      await act(async () => input().props.onSelectionChange?.({ nativeEvent: { selection: { start: end, end } } }));
    }
  };
  const decimal = async () => {
    const name = createTranslator(language).t(currency === "COP" ? "amount.decimalCommaA11y" : "amount.decimalPointA11y", { currency });
    await act(async () => control(name).props.onPress());
  };
  const alerts = () => root!.root.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert")
    .map((node) => node.children.join(""));
  if (field.starts) await act(async () => input().props.onChangeText(""));
  /** The workspace currency becomes `next`; `during` runs before the owner's render, as a late native event does. */
  const switchTo = async (next: Currency, during: () => void = () => {}) => {
    await act(async () => { switchCurrency(next); currency = next; during(); });
  };
  return { sent, input, submit, saveHandler, type, decimal, alerts, switchTo };
}

const wrongKeyHint = {
  COP: { en: "Use the comma for decimals, for example 12,50", es: "Usa la coma para los decimales, por ejemplo 12,50" },
  USD: { en: "Use the point for decimals, for example 12.50", es: "Usa el punto para los decimales, por ejemplo 12.50" },
} as const;
const foreignHint = {
  COP: { en: "Write the amount like this: 1.234,50", es: "Escribe el monto así: 1.234,50" },
  USD: { en: "Write the amount like this: 1,234.50", es: "Escribe el monto así: 1,234.50" },
} as const;

for (const field of fields) {
  for (const currency of ["COP", "USD"] as const) {
    test(`${field.name}, ${currency}: a Save handler from the render before the last keystroke sends the amount as typed`, async () => {
      const screen = await render(field, currency, "en");
      await screen.type("150");
      const stale = screen.saveHandler();
      await screen.type("0");
      await stale();
      expect(screen.sent).toEqual([150000]);
    });

    for (const language of ["en", "es"] as const) {
      test(`${field.name}, ${currency}, ${language}: digits and the decimal key send 1234.50 as 123450 minor units`, async () => {
        const screen = await render(field, currency, language);
        await screen.type("1234");
        await screen.decimal();
        await screen.type("50");
        expect(screen.input().props.value.replace(/^[+-]/, "")).toBe(currency === "COP" ? "1234,50" : "1234.50");
        await screen.submit();
        expect(screen.sent).toEqual([123450]);
      });

      test(`${field.name}, ${currency}, ${language}: the phone's other separator key is refused with a hint`, async () => {
        const screen = await render(field, currency, language);
        await screen.type(currency === "COP" ? "12.50" : "12,50");
        expect(screen.alerts()).toContain(wrongKeyHint[currency][language]);
        await screen.submit();
        expect(screen.sent).toEqual([]);
      });

      test(`${field.name}, ${currency}, ${language}: a pasted amount in the other convention is refused`, async () => {
        const screen = await render(field, currency, language);
        await act(async () => screen.input().props.onChangeText(currency === "COP" ? "1,234.50" : "1.234,50"));
        expect(screen.alerts()).toContain(foreignHint[currency][language]);
        await screen.submit();
        expect(screen.sent).toEqual([]);
      });
    }

    test.each([
      ["1.234", { COP: 123400, USD: null }], ["1,234", { COP: null, USD: 123400 }],
      ["12.50", { COP: null, USD: 1250 }], ["12,50", { COP: 1250, USD: null }],
    ] as const)(`${field.name}, ${currency}: typed %s sends the amount it reads in this currency, or nothing`, async (typed, reads) => {
      const screen = await render(field, currency, "en");
      await screen.type(typed);
      await screen.submit();
      const minor = reads[currency];
      expect(screen.sent).toEqual(minor !== null && (field.accepts?.(minor) ?? true) ? [minor] : []);
    });
  }
}

const byName = (name: string) => fields.find((field) => field.name === name)!;
test.each([
  ["COP", "COP 1.234,50 each · COP 938 extra saving", "COP 234,50 remaining", "COP 234,50 left"],
  ["USD", "USD 1,234.50 each · USD 938 extra saving", "USD 234.50 remaining", "USD 234.50 left"],
] as const)("in %s the preview a person sees before saving is the amount that is sent", async (currency, plan, composer, sheet) => {
  for (const [name, preview] of [["Recovery proposal", plan], ["Budget creation", composer], ["Budget limit sheet", sheet]] as const) {
    const screen = await render(byName(name), currency, "en");
    await screen.type("1234");
    await screen.decimal();
    await screen.type("50");
    const shown = root!.root.findAll((node) => node.props.detail === preview
      || node.props.accessibilityValue?.text === preview);
    expect(shown.length, name).toBeGreaterThan(0);
    await screen.submit();
    expect(screen.sent, name).toEqual([123450]);
    await act(async () => root?.unmount()); root = undefined;
  }
});

test("third review, finding 2: a place name handler from the render before the last balance keystroke keeps the balance as typed", async () => {
  const screen = await render(fields.find((field) => field.name === "place setup balance")!, "COP", "en");
  await screen.type("150");
  const staleName = root!.root.find((node) => node.type === "input" && node.props.accessibilityLabel === "Place name").props.onChangeText as (text: string) => void;
  await screen.type("0");
  await act(async () => staleName("Trip"));
  expect(screen.input().props.value).toBe("1500");
  await screen.submit();
  expect(screen.sent).toEqual([150000]);
});

for (const field of fields)
  test(`${field.name}: a COP keystroke that arrives after the workspace currency becomes USD changes nothing on screen or sent`, async () => {
    const outcome = async (late: boolean) => {
      const screen = await render(field, "COP", "en");
      await screen.type("1.00");
      const old = screen.input().props.onChangeText as (text: string) => void;
      await screen.switchTo("USD", () => { if (late) old("1.000"); });
      const shown = screen.input().props.value as string;
      await screen.submit();
      await act(async () => root?.unmount());
      root = undefined;
      return { shown, sent: [...screen.sent] };
    };
    const quiet = await outcome(false);
    const raced = await outcome(true);
    expect(raced).toEqual(quiet);
    expect(quiet.shown, "the owner reopened its amount in USD").not.toMatch(/^1\.00/);
  });

for (const field of fields.filter((each) => each.replaces))
  test(`${field.name}: a keystroke that arrives after ${field.replaces} changes nothing on screen or sent`, async () => {
    const outcome = async (late: boolean) => {
      const screen = await render(field, "COP", "en");
      await screen.type("15");
      const old = screen.input().props.onChangeText as (text: string) => void;
      await act(async () => { replaceOwnerAmount(); if (late) old("150"); });
      const shown = screen.input().props.value as string;
      await screen.submit();
      await act(async () => root?.unmount());
      root = undefined;
      return { shown, sent: [...screen.sent] };
    };
    const quiet = await outcome(false);
    const raced = await outcome(true);
    expect(raced).toEqual(quiet);
    expect(raced.shown).not.toMatch(/150$/);
  });
