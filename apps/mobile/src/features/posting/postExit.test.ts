import * as React from "react";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { PostingFormProps } from "./PostingForm";

const memory = vi.hoisted(() => new Map<string, string>());
const back = await vi.hoisted(async () => (await import("../../ui/bottomSheet.testSupport")).backHandlers());
const nav = vi.hoisted(() => {
  type Removal = { data: { action: { type: string } }; preventDefault(): void };
  const listeners = new Set<(event: Removal) => void>();
  const stack: string[] = [];
  function remove(action: { type: string }) {
    let prevented = false;
    for (const listener of [...listeners]) listener({ data: { action }, preventDefault: () => { prevented = true; } });
    if (!prevented) stack.pop();
  }
  return {
    stack,
    navigation: {
      addListener: (_name: string, listener: (event: Removal) => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      dispatch: remove,
    },
    router: { back: () => remove({ type: "GO_BACK" }), canGoBack: () => stack.length > 1, push: vi.fn(), replace: vi.fn(), setParams: vi.fn() },
    /** Android system Back: a screen handler first, otherwise the stack pops the screen. */
    systemBack: () => { if (!back.press()) remove({ type: "GO_BACK" }); },
  };
});
const params = vi.hoisted(() => ({ draftId: undefined as string | undefined, candidateId: undefined as string | undefined }));
const form = vi.hoisted(() => ({ props: undefined as PostingFormProps | undefined }));
const post = vi.hoisted(() => ({ action: vi.fn() }));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { memory.set(key, value); },
  deleteItemAsync: async (key: string) => { memory.delete(key); },
}));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", () => {
  let next = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` };
});
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: nav.router, Redirect: "redirect", useNavigation: () => nav.navigation,
    useLocalSearchParams: () => ({ draftId: params.draftId, candidateId: params.candidateId }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
const queries = vi.hoisted(() => ({
  categories: [{
    id: "food", workspaceId: "workspace-1", name: "Food", normalizedName: "food", nature: "Expense", natureSource: "answered",
    classification: { kind: "fallback", version: "test" }, style: { emoji: "F", tone: "primary" }, resolvedPostingAccountCode: "expense",
  }],
  profiles: [{ id: "account-1", name: "Bank", emoji: "🏦" }, { id: "wallet", name: "Wallet", emoji: "👛" }],
  budget: { jars: [] },
  convex: { query: async () => ({ jars: [] }) },
}));
vi.mock("convex/react", () => ({
  useAction: () => post.action,
  useConvex: () => queries.convex,
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listUserCategories")) return queries.categories;
    if (name.endsWith(":listFinancialAccountProfiles")) return queries.profiles;
    if (name.endsWith(":evaluate")) return queries.budget;
    return undefined;
  },
}));
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "picker" }));
vi.mock("react-native-screens", () => ({ ScreenStack: "stack", ScreenStackItem: "screen", ScreenStackHeaderLeftView: "header-left", ScreenStackHeaderRightView: "header-right" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace-1", functionalCurrency: "COP", timeZone: "America/Bogota", currentAccountingPeriod: { year: 2026, month: 10 } },
  financialAccountProfile: { id: "account-1", name: "Bank" },
}) }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("./postingBatchStorage", () => {
  const storage = { load: async () => ({ queue: [], receipts: { count: 0, net: 0 } }), apply: async () => { throw new Error("Batch outside scope"); } };
  return { usePostingBatchStorage: () => storage };
});
vi.mock("./PostingForm", async () => {
  const { createElement: element } = await import("react");
  return { PostingForm: (props: PostingFormProps) => { form.props = props; return element("form", null, props.secondaryActions); } };
});
vi.mock("../categories/CategoryPicker", () => ({ CategoryPicker: () => null }));
vi.mock("./PlaceSheet", () => ({ PlaceSheet: () => null }));
vi.mock("./AccountSetupForm", () => ({ AccountSetupForm: () => null }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  BackHandler: back.BackHandler,
  KeyboardAvoidingView: "keyboard-viewport",
  Keyboard: { dismiss: () => {} },
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { OS: "android" },
  Easing: { out: () => {}, in: () => {}, quad: () => {} },
  Animated: {
    View: "animated-view", Value: class { interpolate() { return 0; } },
    timing: () => {}, sequence: () => {}, loop: () => ({ start: () => {}, stop: () => {} }),
  },
}));

import PostRoute from "../../../app/post";
import DraftsRoute from "../../../app/drafts";
import { LocalInput } from "../../local-auth/localInput";
import { IntakeContext } from "../intake/IntakeProvider";
import { capture, fixture, now } from "../intake/service.testSupport";
import { beginPostIn, keepIn, parseLocalEntryDocument, readRaw, writeDocument, type LocalEntryDocument, type LocalEntryFacts } from "../localEntryDrafts";

let root: ReactTestRenderer | undefined;
let f: ReturnType<typeof fixture>;
const taxi: LocalEntryFacts = {
  workspaceId: "workspace-1", currency: "COP", entryType: "normal", amountText: "-12.000", accountingDate: "2026-10-20",
  description: "Taxi", profileId: "wallet", destinationId: null, categories: { ids: ["food"], primaryId: null },
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  memory.clear();
  nav.router.push.mockClear();
  nav.router.replace.mockClear();
  post.action.mockReset().mockImplementation(async (payload: { description: string; amount: unknown }) => ({ description: payload.description, amount: payload.amount }));
  form.props = undefined;
  f = fixture();
  f.setPages([{ captures: [capture, { ...capture, captureId: "capture-2", description: "Bakery" }], nextCursor: null }]);
  await f.service.refresh();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function providers(child: ReactElement) {
  return createElement(LocalInput.Provider, { value: f.lease }, createElement(IntakeContext.Provider, { value: f.service }, child));
}
async function openPost(input: { draftId?: string; candidateId?: string } = {}) {
  params.draftId = input.draftId;
  params.candidateId = input.candidateId;
  nav.stack.splice(0, nav.stack.length, "drafts", "post");
  form.props = undefined;
  await act(async () => { root = create(providers(createElement(PostRoute))); });
  await act(async () => {});
}
async function closePost() {
  await act(async () => root?.unmount());
  root = undefined;
}
function props() {
  if (!form.props) throw new Error("Post form is not mounted");
  return form.props;
}
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function has(label: string) {
  return root?.root.findAllByType("button").some((node) => node.props.accessibilityLabel === label) ?? false;
}
function text() {
  return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? "";
}
function sheet() {
  return root?.root.findAll((node) => String(node.type) === "sheet")[0] ?? null;
}
async function stored() {
  return parseLocalEntryDocument(await readRaw("owner"), Date.now()).document.drafts;
}
async function seed(document: LocalEntryDocument) {
  await writeDocument("owner", document);
}
async function type(amount: string, description: string) {
  await act(async () => {
    props().onAmountChange(amount);
    props().onDescriptionChange(description);
  });
}

test("an entry with nothing entered leaves without a prompt", async () => {
  await openPost();
  expect(has("Keep draft")).toBe(false);
  await act(async () => props().onBack());
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts"]);
  expect(await stored()).toEqual([]);
});

test("Keep draft keeps an incomplete entry, returns to the caller and lists it in Drafts", async () => {
  await openPost();
  await type("-12.000", "Taxi");
  await act(async () => button("Keep draft").props.onPress());
  expect(nav.stack).toEqual(["drafts"]);
  const [kept] = await stored();
  expect(kept).toMatchObject({ status: "open", facts: { description: "Taxi", amountText: "-12.000", profileId: "account-1", categories: { ids: [], primaryId: null } } });
  await closePost();
  await act(async () => { root = create(providers(createElement(DraftsRoute))); });
  expect(text()).toContain("Taxi");
  expect(text()).toContain("Draft on this device");
});

test("reopening a Draft restores every fact, and saving changes updates that same Draft", async () => {
  await seed(keepIn({ v: 1, drafts: [] }, { facts: taxi }, now, () => "taxi").document);
  await openPost({ draftId: "taxi" });
  expect(props()).toMatchObject({ amount: "-12.000", description: "Taxi", entryType: "normal", place: "👛 Wallet", category: "F Food", date: "October 20, 2026" });
  await act(async () => props().onDescriptionChange("Taxi home"));
  await act(async () => props().onBack());
  expect(sheet()?.props.accessibilityLabel).toBe("Unsaved entry");
  expect(text()).toContain("Save changes to this draft?");
  await act(async () => button("Save changes").props.onPress());
  expect(nav.stack).toEqual(["drafts"]);
  const drafts = await stored();
  expect(drafts.map((draft) => draft.id)).toEqual(["taxi"]);
  expect(drafts[0]).toMatchObject({ status: "open", facts: { ...taxi, description: "Taxi home" } });
  await closePost();
  await openPost({ draftId: "taxi" });
  expect(props()).toMatchObject({ amount: "-12.000", description: "Taxi home", place: "👛 Wallet", category: "F Food" });
});

test("Discard changes leaves the earlier Draft as it was", async () => {
  await seed(keepIn({ v: 1, drafts: [] }, { facts: taxi }, now, () => "taxi").document);
  await openPost({ draftId: "taxi" });
  await act(async () => props().onDescriptionChange("Taxi home"));
  await act(async () => props().onBack());
  await act(async () => button("Discard changes").props.onPress());
  expect(nav.stack).toEqual(["drafts"]);
  expect((await stored()).map((draft) => draft.status === "open" ? draft.facts : null)).toEqual([taxi]);
});

test("the leave prompt appears only with unsaved input", async () => {
  await seed(keepIn({ v: 1, drafts: [] }, { facts: taxi }, now, () => "taxi").document);
  await openPost({ draftId: "taxi" });
  expect(has("Save changes")).toBe(false);
  await act(async () => props().onBack());
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts"]);
  await closePost();
  await openPost();
  await type("-", "C");
  expect(has("Keep draft")).toBe(true);
  await type("-", "");
  expect(has("Keep draft")).toBe(false);
  await act(async () => props().onBack());
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts"]);
});

test("Discard draft in the editor removes only that Draft after confirmation", async () => {
  const two = keepIn(keepIn({ v: 1, drafts: [] }, { facts: taxi }, now, () => "taxi").document,
    { facts: { ...taxi, description: "Lunch" } }, now, () => "lunch");
  await seed(two.document);
  await openPost({ draftId: "taxi" });
  await act(async () => button("Discard draft").props.onPress());
  expect(sheet()?.props.accessibilityLabel).toBe("Discard this draft?");
  expect(text()).toContain("Taxi · COP 12.000,00");
  await act(async () => button("Cancel").props.onPress());
  expect(sheet()).toBeNull();
  await act(async () => button("Discard draft").props.onPress());
  await act(async () => { nav.systemBack(); });
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts", "post"]);
  expect((await stored()).map((draft) => draft.id)).toEqual(["taxi", "lunch"]);
  await act(async () => button("Discard draft").props.onPress());
  await act(async () => button("Discard").props.onPress());
  expect(nav.stack).toEqual(["drafts"]);
  expect((await stored()).map((draft) => draft.id)).toEqual(["lunch"]);
});

test("a Draft whose posting outcome is unknown offers no keep or discard and leaves without a prompt", async () => {
  const posting = beginPostIn({ v: 1, drafts: [] }, { command: { kind: "expense", payload: {
    workspaceId: "workspace-1", financialAccountProfileId: "account-1", amount: { currency: "COP", minorUnits: 900000 },
    accountingDate: "2026-10-23", description: "Rent", idempotencyKey: "rent-key",
  } } }, now, () => "rent");
  await seed(posting.document);
  await openPost({ draftId: "rent" });
  expect(props()).toMatchObject({ pending: true, description: "Rent" });
  expect(has("Discard draft")).toBe(false);
  expect(has("Keep draft")).toBe(false);
  await act(async () => props().onBack());
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts"]);
  expect((await stored()).map((draft) => [draft.id, draft.status])).toEqual([["rent", "posting"]]);
});

test.each(["Keep draft", "Discard", "Continue editing", "Android Back"] as const)(
  "%s from the leave prompt returns to the same caller twice in a row without stacking",
  async (choice) => {
    for (const round of [1, 2]) {
      await openPost();
      await type("-5.000", `Coffee ${round}`);
      await act(async () => { nav.systemBack(); });
      expect(text()).toContain("Keep this entry as a draft?");
      if (choice === "Android Back") await act(async () => { nav.systemBack(); });
      else await act(async () => button(choice).props.onPress());
      if (choice === "Keep draft" || choice === "Discard") {
        expect(nav.stack).toEqual(["drafts"]);
      } else {
        expect(sheet()).toBeNull();
        expect(nav.stack).toEqual(["drafts", "post"]);
        expect(props().description).toBe(`Coffee ${round}`);
        await act(async () => props().onBack());
        await act(async () => button("Discard").props.onPress());
        expect(nav.stack).toEqual(["drafts"]);
      }
      await closePost();
    }
    const descriptions = (await stored()).map((draft) => draft.status === "open" ? draft.facts.description : "");
    expect(descriptions).toEqual(choice === "Keep draft" ? ["Coffee 1", "Coffee 2"] : []);
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(nav.router.replace).not.toHaveBeenCalled();
  },
);

test("discarding from the review form returns to the inbox twice in a row without stacking", async () => {
  for (const [id, label] of [["capture-1", "Market"], ["capture-2", "Bakery"]] as const) {
    await openPost({ candidateId: id });
    await act(async () => button("Discard this Candidate").props.onPress());
    expect(sheet()?.props.accessibilityLabel).toBe("Discard this Candidate?");
    expect(text()).toContain(`${label} · COP 450,00`);
    await act(async () => button("Discard").props.onPress());
    expect(nav.stack).toEqual(["drafts"]);
    expect(f.service.read(id)).toBeNull();
    await closePost();
  }
  expect(f.state().records.map((row) => [row.id, row.kind])).toEqual([["capture-1", "terminal"], ["capture-2", "terminal"]]);
  expect(nav.router.push).not.toHaveBeenCalled();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

test("Cancel and Android Back close the Candidate confirmation before leaving the form", async () => {
  await openPost({ candidateId: "capture-1" });
  await act(async () => button("Discard this Candidate").props.onPress());
  await act(async () => button("Cancel").props.onPress());
  expect(sheet()).toBeNull();
  await act(async () => button("Discard this Candidate").props.onPress());
  await act(async () => { nav.systemBack(); });
  expect(sheet()).toBeNull();
  expect(nav.stack).toEqual(["drafts", "post"]);
  expect(f.service.read("capture-1")?.status.kind).toBe("review");
});

test("a Candidate changed behind its form is not discarded at the newer revision", async () => {
  await openPost({ candidateId: "capture-1" });
  const row = f.service.read("capture-1");
  if (!row) throw new Error("missing Candidate");
  await act(async () => { await f.service.updateReview(row.id, 0, { ...row.review, description: "Changed elsewhere" }); });
  await act(async () => button("Discard this Candidate").props.onPress());
  await act(async () => button("Discard").props.onPress());
  expect(sheet()).toBeNull();
  expect(text()).toContain("This Candidate changed since you opened it. Check it and try again.");
  expect(nav.stack).toEqual(["drafts", "post"]);
  expect(f.service.read("capture-1")?.review.description).toBe("Changed elsewhere");
});

test("a Candidate with a dispatched confirmation offers no discard in its form", async () => {
  await f.service.beginConfirmation("capture-1", 0);
  await openPost({ candidateId: "capture-1" });
  expect(props().pending).toBe(true);
  expect(has("Discard this Candidate")).toBe(false);
  await closePost();
  await openPost({ candidateId: "capture-2" });
  expect(has("Discard this Candidate")).toBe(true);
});
