import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator, Animated } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftsScreen } from "./DraftsScreen";
import type { DraftListItem } from "./localEntryDrafts";
import type { IntakeCandidate } from "./intake/candidates";

const platformState = vi.hoisted(() => ({ os: "android" }));

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
const back = await vi.hoisted(async () => (await import("../ui/bottomSheet.testSupport")).backHandlers());
vi.mock("@gorhom/bottom-sheet", () => import("../ui/bottomSheet.testSupport"));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  BackHandler: back.BackHandler,
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { get OS() { return platformState.os; } },
  Easing: { out: vi.fn(), in: vi.fn(), quad: vi.fn() },
  Animated: {
    View: "animated-view",
    Value: class { interpolate() { return 0; } },
    timing: vi.fn(), sequence: vi.fn(),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  },
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  platformState.os = "android";
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function text() {
  return (
    root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ??
    ""
  );
}

const expiresAt = Date.UTC(2026, 9, 17, 12);
const drafts: DraftListItem[] = [
  {
    id: "open-1",
    status: "open",
    kind: "normal",
    description: "",
    expiresAt,
    workspaceId: "workspace",
  },
  {
    id: "post-1",
    status: "posting",
    kind: "expense",
    description: "Food",
    expiresAt,
    workspaceId: "workspace",
  },
];
const candidate: IntakeCandidate = {
  id: "candidate-groceries",
  createdAt: expiresAt,
  expiresAt: expiresAt + 2 * 24 * 60 * 60 * 1000,
  workspaceId: "workspace",
  currency: "COP",
  suggestion: {
    direction: "out",
    description: "Groceries",
    amountMinorUnits: 126400,
    accountingDate: "2026-10-17",
    financialAccountProfileId: "daily",
    userCategoryIds: ["food"],
    primaryUserCategoryId: null,
  },
  parserVersion: "parser@1",
  consentVersion: "consent@1",
};

function render(
  props: Partial<React.ComponentProps<typeof DraftsScreen>> = {},
) {
  const defaults = {
    drafts: [],
    now: [] as IntakeCandidate[],
    wait: [] as IntakeCandidate[],
    ready: [] as IntakeCandidate[],
    readyTotal: 0,
    currency: "COP" as const,
    segment: "now" as const,
    readyToShow: true,
    error: "",
    confirming: false,
    month: "October",
    places: [{ id: "daily", name: "Daily money" }],
    confirmedCount: null,
    onContinueAfterConfirmation: vi.fn(),
    onSegment: vi.fn(),
    onBack: vi.fn(),
    onSources: vi.fn(),
    onResumeDraft: vi.fn(),
    onOpenCandidate: vi.fn(),
    onConfirmReady: vi.fn(),
    onCompleteMonth: vi.fn(),
  };
  return { ...defaults, ...props };
}

function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}

test("the inbox names the month when empty and waits for loading to finish", async () => {
  await act(async () => {
    root = create(createElement(DraftsScreen, render({ readyToShow: false })));
  });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(text()).not.toContain("Review complete");
  await act(async () => { root?.update(createElement(DraftsScreen, render())); });
  expect(text()).toContain("Candidates");
  expect(text()).toContain("NOTIFICATION INTAKE");
  expect(text()).toContain("Nothing waiting");
  expect(text()).toContain("Notifications from enabled sources become Candidates here for review. No Candidates are waiting; this does not confirm capture. Remaining local Candidates never block Month Close.");
  expect(text()).not.toContain("Preview Month Close warning");
  expect(root?.root.findAllByType("button").some((node) => node.props.accessibilityRole === "radio")).toBe(false);
});

test("a Candidate row opens the shared form and Confirm all Ready posts the ready set", async () => {
  const onOpenCandidate = vi.fn();
  const onConfirmReady = vi.fn();
  const onResumeDraft = vi.fn();
  await act(async () => {
    root = create(
      createElement(
        DraftsScreen,
        render({
          drafts,
          now: [candidate],
          wait: [],
          ready: [candidate],
          readyTotal: 126400,
          onOpenCandidate,
          onConfirmReady,
          onResumeDraft,
        }),
      ),
    );
  });
  expect(text()).toContain("Groceries");
  expect(text()).toContain("Confirm all Ready");
  expect(button("Needs you now, 2").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(text()).toContain("Daily money");
  expect(text()).toContain("COP 1.264,00");
  expect(text()).not.toContain("Expires");
  expect(text()).toContain("Retry posting");
  expect(text()).not.toContain("Draft on this device");
  await act(async () => button("Review Groceries").props.onPress());
  expect(onOpenCandidate).toHaveBeenCalledWith("candidate-groceries");
  const confirm = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === "Confirm all Ready");
  await act(async () => confirm?.props.onPress());
  expect(onConfirmReady).toHaveBeenCalledOnce();
  await act(async () => {
    root?.update(
      createElement(
        DraftsScreen,
        render({
          drafts,
          now: [candidate],
          segment: "wait",
          onResumeDraft,
        }),
      ),
    );
  });
  expect(text()).toContain("Incomplete draft");
  expect(text()).toContain("Draft on this device");
  expect(text()).not.toContain("Retry posting");
  const draft = root?.root.findAllByType("button").find((node) =>
    node.findAllByType("text").some((child) => child.children.includes("Incomplete draft")),
  );
  await act(async () => draft?.props.onPress());
  expect(onResumeDraft).toHaveBeenCalledWith("open-1");
});

test.each(["now", "wait"] as const)("priority segments are radios with %s selected and checked", async (segment) => {
  const onSegment = vi.fn();
  await act(async () => {
    root = create(createElement(DraftsScreen, render({ now: [candidate], segment, onSegment })));
  });
  const groups = root?.root.findAllByType("view").filter((node) => node.props.accessibilityRole === "radiogroup");
  expect(groups).toHaveLength(1);
  expect(groups?.[0]?.findAllByType("button").map((node) => ({
    role: node.props.accessibilityRole,
    state: node.props.accessibilityState,
  }))).toEqual([
    { role: "radio", state: { selected: segment === "now", checked: segment === "now" } },
    { role: "radio", state: { selected: segment === "wait", checked: segment === "wait" } },
  ]);
  await act(async () => button("Needs you now, 1").props.onPress());
  await act(async () => button("Can wait, 0").props.onPress());
  expect(onSegment.mock.calls).toEqual([["now"], ["wait"]]);
});

test.each([
  { direction: "out", amountMinorUnits: 126400, currency: "COP", expected: "COP 1.264,00" },
  { direction: "in", amountMinorUnits: 126400, currency: "USD", expected: "USD 1,264.00" },
  { direction: "out", amountMinorUnits: -126400, currency: "COP", expected: "COP 1.264,00" },
  { direction: "in", amountMinorUnits: -126400, currency: "USD", expected: "USD 1,264.00" },
] as const)("a $direction Candidate with $amountMinorUnits $currency has an unsigned amount and review label", async ({ direction, amountMinorUnits, currency, expected }) => {
  const onOpenCandidate = vi.fn();
  await act(async () => {
    root = create(createElement(DraftsScreen, render({
      now: [{ ...candidate, currency, suggestion: { ...candidate.suggestion, direction, amountMinorUnits } }],
      onOpenCandidate,
    })));
  });
  const row = button("Review Groceries");
  expect(row.props.accessibilityRole).toBe("button");
  expect(row.findAllByType("text").map((node) => node.children.join(""))).toContain(expected);
  await act(async () => row.props.onPress());
  expect(onOpenCandidate).toHaveBeenCalledExactlyOnceWith(candidate.id);
});

test.each([
  { description: "  Groceries  ", title: "Groceries" },
  { description: "  ", title: "Needs review" },
])("Candidate review labels match the displayed description '$title'", async ({ description, title }) => {
  await act(async () => {
    root = create(createElement(DraftsScreen, render({
      wait: [{ ...candidate, suggestion: { ...candidate.suggestion, description } }],
      segment: "wait",
    })));
  });
  expect(button(`Review ${title}`).findAllByType("text").map((node) => node.children.join(""))).toContain(title);
});

test("a foreign-currency Candidate shows why it is not Ready", async () => {
  await act(async () => {
    root = create(
      createElement(
        DraftsScreen,
        render({
          now: [{ ...candidate, currency: "USD" }],
          currency: "COP",
        }),
      ),
    );
  });
  expect(text()).toContain("Uses USD. This workspace uses COP.");
  expect(text()).toContain("0 ready to add");
});

test("Drafts still render when Candidates fail to load", async () => {
  await act(async () => {
    root = create(
      createElement(
        DraftsScreen,
        render({
          drafts,
          readyToShow: true,
          error: "Could not load Candidates on this device.",
        }),
      ),
    );
  });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(text()).toContain("Could not load Candidates on this device.");
  expect(text()).toContain("Food");
});


test.each(["I understand", "Back"])("%s acknowledges the reconciliation warning and stops its pulse", async (action) => {
  const props = render({ now: [candidate], ready: [candidate] });
  await act(async () => { root = create(createElement(DraftsScreen, props)); });
  const animation = vi.mocked(Animated.loop).mock.results.at(-1)?.value;
  expect(animation?.start).toHaveBeenCalledOnce();
  await act(async () => button("Open reconciliation warning").props.onPress());
  expect(animation?.stop).toHaveBeenCalledOnce();
  expect(text()).toContain("Notifications are a shortcut, not a statement");
  expect(text()).toContain("Notification Intake may miss, delay, or duplicate activity. Reconcile against your financial accounts.");
  expect(text()).toContain("A missing notification can leave activity out.");
  expect(text()).toContain("A delayed or repeated notification can create the wrong review queue.");
  expect(text()).toContain("Only your account history can settle the difference.");
  await act(async () => button(action).props.onPress());
  expect(root?.root.findAllByType("button").some((node) => node.props.accessibilityLabel === "Open reconciliation warning")).toBe(false);
  expect(text()).toContain("1 ready to add");
});

test("the Month Close preview counts Candidates, returns to review, and continues only on request", async () => {
  const onCompleteMonth = vi.fn();
  const props = render({ drafts, now: [candidate], wait: [{ ...candidate, id: "later" }], onCompleteMonth });
  await act(async () => { root = create(createElement(DraftsScreen, props)); });
  await act(async () => button("Preview Month Close warning").props.onPress());
  expect(text()).toContain("Complete October");
  expect(text()).toContain("2");
  expect(text()).toContain("Candidates on this phone still need a decision");
  expect(text()).toContain("Review any October activity now.");
  expect(text()).toContain("this does not block Month Close.");
  expect(onCompleteMonth).not.toHaveBeenCalled();
  await act(async () => button("Review Candidates").props.onPress());
  expect(text()).toContain("Groceries");
  await act(async () => button("Preview Month Close warning").props.onPress());
  await act(async () => button("Continue Month Close anyway").props.onPress());
  expect(onCompleteMonth).toHaveBeenCalledOnce();
});

test("Sources opens the canonical intake setup through its navigation callback", async () => {
  const onSources = vi.fn();
  await act(async () => { root = create(createElement(DraftsScreen, render({ onSources }))); });
  await act(async () => button("Sources").props.onPress());
  expect(onSources).toHaveBeenCalledOnce();
  expect(text()).not.toContain("just now");
});

test("an empty segment explains that nothing is waiting later", async () => {
  const onSegment = vi.fn();
  await act(async () => { root = create(createElement(DraftsScreen, render({ now: [candidate], segment: "wait", onSegment }))); });
  expect(text()).toContain("Nothing waiting later.");
  await act(async () => button("Needs you now, 1").props.onPress());
  expect(onSegment).toHaveBeenCalledExactlyOnceWith("now");
});

test.each([1, 3])("acknowledged confirmation shows the %i record count and deletion copy", async (count) => {
  const onContinueAfterConfirmation = vi.fn();
  await act(async () => { root = create(createElement(DraftsScreen, render({ confirmedCount: count, drafts, onContinueAfterConfirmation }))); });
  expect(text()).toContain(count === 1 ? "Record added" : "3 records added");
  expect(text()).toContain("Lukapp checked and posted each one. The notification text was deleted from this phone after confirmation.");
  await act(async () => button("Back to Candidates").props.onPress());
  expect(onContinueAfterConfirmation).toHaveBeenCalledOnce();
});

test("the last confirmed record can continue to Month Close", async () => {
  const onCompleteMonth = vi.fn();
  await act(async () => { root = create(createElement(DraftsScreen, render({ confirmedCount: 1, onCompleteMonth }))); });
  await act(async () => button("Continue to Month Close").props.onPress());
  expect(onCompleteMonth).toHaveBeenCalledOnce();
});

test("Confirm all Ready stays disabled without Ready Candidates or during confirmation", async () => {
  await act(async () => { root = create(createElement(DraftsScreen, render({ now: [candidate] }))); });
  expect(button("Confirm all Ready").props.disabled).toBe(true);
  await act(async () => { root?.update(createElement(DraftsScreen, render({ now: [candidate], ready: [candidate], confirming: true }))); });
  expect(button("Confirm all Ready").props.disabled).toBe(true);
});

test("unresolved Candidates identify themselves with their original notification text", async () => {
  const onOpenCandidate = vi.fn();
  const body = "Recibiste 45,00 en tu cuenta\nTe llegó dinero de MARIA EJEMPLO con tu llave.";
  const row: IntakeCandidate = { ...candidate, suggestion: { ...candidate.suggestion, description: "", amountMinorUnits: null, direction: "in" },
    notification: { text: body, packageName: "com.nu.production", at: expiresAt } };
  await act(async () => { root = create(createElement(DraftsScreen, render({ now: [row], onOpenCandidate }))); });
  expect(text()).toContain(body);
  await act(async () => { button(`Review ${body}`).props.onPress(); });
  expect(onOpenCandidate).toHaveBeenCalledWith(candidate.id);
});

test("Other notifications is folded, counted, and each row opens its Candidate", async () => {
  const onOpenCandidate = vi.fn();
  const promo: IntakeCandidate = { ...candidate, id: "promo", suggestion: { ...candidate.suggestion, amountMinorUnits: null, direction: null, description: "" },
    notification: { text: "Nu\nAprovecha 30% de descuento este fin de semana", packageName: "com.nu.production", at: expiresAt } };
  await act(async () => {
    root = create(createElement(DraftsScreen, render({ otherNotifications: [promo], onOpenCandidate })));
  });
  expect(text()).toContain("Other notifications · 1");
  expect(text()).not.toContain("Aprovecha 30%");
  const fold = button("Other notifications, 1");
  expect(fold.props.accessibilityState.expanded).toBe(false);
  await act(async () => { fold.props.onPress(); });
  expect(text()).toContain("Aprovecha 30% de descuento este fin de semana");
  await act(async () => { button("Review Aprovecha 30% de descuento este fin de semana").props.onPress(); });
  expect(onOpenCandidate).toHaveBeenCalledWith("promo");
});

async function mountSpanish(props: React.ComponentProps<typeof DraftsScreen>) {
  const { LanguageProvider } = await import("../i18n");
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "es" }, createElement(DraftsScreen, props)));
  });
}

const englishInboxCopy = ["Candidates", "NOTIFICATION INTAKE", "Sources", "ready to add", "Confirm all Ready", "Needs you now",
  "Can wait", "Retry posting", "Draft on this device", "Preview Month Close warning", "Needs review"];

test("the inbox reads as one Spanish list: Por revisar, Atender ya, Puede esperar and the Ready set", async () => {
  await mountSpanish(render({ drafts, now: [candidate], ready: [candidate], readyTotal: 126400, segment: "now", month: "octubre" }));
  const shown = text();
  for (const copy of ["Por revisar", "LECTURA DE NOTIFICACIONES", "Fuentes", "1 listo para registrar", "Atender ya", "Puede esperar",
    "Revisa lo que hay que atender ya o registra todos los que están listos.", "Reintentar registro", "Ver el aviso del Cierre de mes", "Daily money"])
    expect(shown).toContain(copy);
  for (const copy of englishInboxCopy) expect(shown).not.toContain(copy);
  expect(button("Revisar Groceries")).toBeTruthy();
  expect(button("Atender ya, 2")).toBeTruthy();
  expect(root?.root.findAllByProps({ label: "Registrar los listos" }).length).toBeGreaterThan(0);

  await act(async () => button("Ver el aviso del Cierre de mes").props.onPress());
  expect(text()).toContain("Cerrar octubre");
  expect(text()).toContain("movimiento por revisar en este celular todavía necesita una decisión");
  expect(text()).toContain("Revisa ahora los movimientos de octubre.");
});

test("the Spanish inbox counts Ready Candidates and confirmed records", async () => {
  await mountSpanish(render({ now: [candidate, { ...candidate, id: "second" }], ready: [candidate, { ...candidate, id: "second" }] }));
  expect(text()).toContain("2 listos para registrar");
  await act(async () => root?.unmount());
  await mountSpanish(render({ now: [candidate], confirmedCount: 1 }));
  expect(text()).toContain("Movimiento registrado");
  expect(root?.root.findAllByProps({ label: "Volver a Por revisar" }).length).toBeGreaterThan(0);
  await act(async () => root?.unmount());
  await mountSpanish(render({ confirmedCount: 3 }));
  expect(text()).toContain("3 movimientos registrados");
  expect(root?.root.findAllByProps({ label: "Seguir al Cierre de mes" }).length).toBeGreaterThan(0);
});

test("stored Candidate errors and currency mismatches read in Spanish, never as raw codes", async () => {
  await mountSpanish(render({ now: [
    { ...candidate, id: "usd", currency: "USD" },
    { ...candidate, id: "locked", error: "Locked Period" },
    { ...candidate, id: "conflict", error: "idempotency_key_conflict" },
    { ...candidate, id: "pending", error: "Confirmation pending. Open to retry." },
    { ...candidate, id: "unknown", error: "Something the server said" },
  ] }));
  const shown = text();
  expect(shown).toContain("Está en USD. Este espacio usa COP.");
  expect(shown).toContain("Ese mes ya está cerrado.");
  expect(shown).toContain("Este movimiento ya se había enviado con otros datos.");
  expect(shown).toContain("La confirmación está pendiente. Ábrelo para reintentar.");
  expect(shown).toContain("No pudimos registrar este movimiento");
  for (const raw of ["Locked Period", "idempotency_key_conflict", "Confirmation pending", "Something the server said"]) expect(shown).not.toContain(raw);
});

test("discarded notices and other notifications show Spanish reasons and Colombian dates", async () => {
  const { formatDateTime, formatShortDate } = await import("../i18n");
  const at = Date.UTC(2026, 10, 10, 15, 30);
  await mountSpanish(render({
    now: [candidate],
    discardNotices: [{ reason: "Security alert", time: at }],
    otherNotifications: [{ ...candidate, id: "promo", notification: { text: "Banco\nTienes un descuento", packageName: "bank.app", at } }],
  }));
  await act(async () => button("Otras notificaciones, 1").props.onPress());
  expect(text()).toContain("Tienes un descuento");
  expect(text()).toContain(`Banco · ${formatShortDate("es", at)}`);
  expect(formatShortDate("es", at)).toMatch(/^\d{1,2} nov$/);
  await act(async () => root?.root.findAllByProps({ label: "Notificaciones descartadas" })[0]!.props.onPress());
  expect(text()).toContain("NO QUEDARON POR REVISAR");
  expect(text()).toContain("Alerta de seguridad");
  expect(text()).toContain(formatDateTime("es", at));
  expect(text()).not.toContain("Security alert");
});
