import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { formatDateTime } from "../../../../../src/i18n/format";
import { intakeActionError, intakeWarning } from "./presentation";
import type { IntakeSnapshot } from "./service";

const since = Date.UTC(2026, 10, 10, 13, 45);
const snapshot = (status: Record<string, unknown>, drain: IntakeSnapshot["drain"] = null) => ({ status: {
  epoch: "e", storageState: "healthy", enabled: true, access: "granted", connection: "connected", notices: [], gap: null, ...status,
}, drain }) as unknown as IntakeSnapshot;

test("a capture gap names its cause and the moment it began in each language", () => {
  const gap = snapshot({ gap: { reason: "overflow", since, rejectedCount: 2 } });
  expect(intakeWarning(gap, createTranslator("en"))).toBe(
    `Notification capture has a gap since ${formatDateTime("en", since)} because too many alerts arrived at once. Reconcile missed activity with your accounts.`);
  expect(intakeWarning(gap, createTranslator("es"))).toBe(
    `La lectura de notificaciones tuvo un vacío desde el ${formatDateTime("es", since)} porque llegaron demasiadas alertas a la vez. Compara con tus cuentas lo que se pudo perder.`);
  expect(formatDateTime("es", since, "America/Bogota")).toBe("10 de nov de 2026, 8:45 a. m.");
});

test("other intake warnings read in Spanish and a healthy intake has none", () => {
  const es = createTranslator("es");
  expect(intakeWarning(snapshot({ connection: "disconnected" }), es)).toBe(
    "La lectura de notificaciones puede estar interrumpida. Revisa Fuentes y compara con tus cuentas lo que se pudo perder.");
  expect(intakeWarning(snapshot({ storageState: "corrupt" }), es)).toContain("necesita recuperarse");
  expect(intakeWarning(snapshot({}), es)).toBeUndefined();
});

test("native intake failure codes become sentences and never reach the screen raw", () => {
  const { t } = createTranslator("es");
  expect(intakeActionError(t, Object.assign(new Error("x"), { code: "CAPACITY_EXCEEDED" }))).toContain("máximo 16 apps activas");
  expect(intakeActionError(t, new Error("CORRUPT_STATE"))).toContain("No pudimos leer el almacenamiento cifrado");
  expect(intakeActionError(t, new Error("UNSUPPORTED"))).toBe("La lectura de notificaciones solo funciona en la versión completa de Lukapp para Android.");
  expect(intakeActionError(createTranslator("en").t, new Error("UNSUPPORTED"))).toBe("Notification intake works only in the full Lukapp app for Android.");
  expect(intakeActionError(t, new Error("Intake unavailable"))).toBe(
    "No pudimos terminar esta acción. El cambio no quedó confirmado. Actualiza el estado y reintenta lo que esté pendiente.");
});
