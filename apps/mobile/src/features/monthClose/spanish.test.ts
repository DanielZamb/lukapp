import * as React from "react";
import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { LanguageProvider } from "../../i18n";
import {
  candidatesDetail, closedTitle, draftsDetail, evaluateMonthClose, footerLabel, lockActionLabel, lockFailureMessage, monthLabel,
} from "./model";
import { MonthCloseScreen } from "./MonthCloseScreen";
import type { MonthClosePhase } from "./useMonthClose";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

const en = createTranslator("en");
const es = createTranslator("es");
const october = { year: 2026, month: 10 };
const readiness = evaluateMonthClose({ language: "es", period: october, periodStatus: "open", draftCount: 0, candidateCount: 2 });
const summary = { currency: "COP", spendMinorUnits: 125_050, accountCount: 1, recoveryDueMinorUnits: 0 };

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function text() { return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? ""; }
async function show(phase: MonthClosePhase, warning?: string) {
  const element = createElement(LanguageProvider, { initialPreference: "es" }, createElement(MonthCloseScreen, {
    readiness, intakeWarning: warning, summary, phase,
    onBack: vi.fn(), onReviewDrafts: vi.fn(), onAccountBalances: vi.fn(), onOverview: vi.fn(), onRecovery: vi.fn(), onHome: vi.fn(),
    onRequest: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn(),
  }));
  await act(async () => { if (root) root.update(element); else root = create(element); });
}

test("month phrases keep the month inside one message in both languages", () => {
  expect(monthLabel(october, "es")).toBe("octubre");
  expect(monthLabel(october)).toBe("October");
  expect(footerLabel(october, es)).toBe("Cierre de octubre");
  expect(lockActionLabel(october, es)).toBe("Terminar y cerrar octubre");
  expect(lockActionLabel(october, en)).toBe("Complete and lock October");
  expect(closedTitle(october, es)).toBe("Cerraste octubre");
  expect(closedTitle(october, en)).toBe("October is complete");
});

test("counted review rows agree in number in Spanish and keep English as it was", () => {
  expect(draftsDetail(1, es)).toBe("Falta 1 por revisar");
  expect(draftsDetail(3, es)).toBe("Faltan 3 por revisar");
  expect(draftsDetail(0, es)).toBe("Todo revisado");
  expect(draftsDetail(1, en)).toBe("1 still need review");
  expect(candidatesDetail(1, es)).toBe("1 sigue solo en este celular. Las notificaciones no reemplazan el extracto.");
  expect(candidatesDetail(2, es)).toBe("2 siguen solo en este celular. Las notificaciones no reemplazan el extracto.");
  expect(candidatesDetail(0, en)).toBe("None waiting");
});

test("a rejected close shows a translated message, never the server's English text", () => {
  const rejected = new ConvexError({ kind: "accounting", code: "accounting_period_invalid", message: "Accounting Period must be a real year and month" });
  expect(lockFailureMessage(rejected, es)).toBe("El mes no se cerró. Revisa que siga abierto y vuelve a intentar.");
  expect(lockFailureMessage(rejected, en)).toBe("The month was not locked. Check that it is still open and try again.");
  expect(lockFailureMessage(new Error("offline"), es)).toBe("No pudimos confirmar el cierre. Vuelve a intentar: cerramos el mismo mes sin duplicar nada.");
  expect(lockFailureMessage(new Error("offline"), en)).toBe("Could not confirm the close. Retry to lock the same month safely.");
});

test("Month Close reads in Spanish and says plainly that a closed month takes no new movements", async () => {
  await show({ kind: "review" }, "Las notificaciones están apagadas.");
  const review = text();
  for (const spanish of ["Cierre de octubre", "HAY MOVIMIENTOS POR REVISAR", "Gastos de octubre", "Por revisar", "Aviso",
    "Saldos de tus lugares", "1 lugar revisado", "Recuperar ahorros", "Nada pendiente este mes", "Terminar y cerrar octubre",
    "Al cerrar el mes, ya no recibe movimientos nuevos. Cerrar no mueve plata ni cambia saldos.",
    "Las notificaciones están apagadas. Esto no impide el cierre de mes."])
    expect(review).toContain(spanish);
  expect(review).not.toMatch(/Complete|spending|Candidates|Account balances|Financial Accounts|Savings recovery|October/);

  await show({ kind: "confirm", period: october });
  expect(text()).toContain("Al cerrar octubre, ese mes ya no recibe movimientos nuevos. Cerrar no mueve plata ni cambia saldos. Los movimientos por revisar se quedan para después.");
  expect(text()).toContain("Seguir revisando");

  await show({ kind: "closed", period: october });
  expect(text()).toContain("Cerraste octubre");
  expect(text()).toContain("El mes quedó cerrado y ya no recibe movimientos nuevos.");
  expect(text()).toContain("Ver resumen de octubre");
  expect(text()).not.toMatch(/is complete|locked|overview/);
});
