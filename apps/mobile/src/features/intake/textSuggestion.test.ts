import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import { commandFor, emptyState, ingest, parseState, projectCandidate, serializeState, TEXT_SUGGESTION_VERSION, type ActiveCandidate } from "./durableState";
import { isReadyCandidate } from "./ready";
import { capture, mapping } from "./service.testSupport";

const withText = (text: string, extra: Partial<typeof capture> = {}) =>
  ({ ...capture, captureId: `c-${text.length}`, direction: null, amountMinorUnits: null, currency: null, description: "",
    parserVersion: "generic-v3", consentVersion: "notification-disclosure@3", text, ...extra });
const only = (state: ReturnType<typeof emptyState>) => state.records[0] as ActiveCandidate;

test("kept text drives the suggestion, and a bare $ uses the app's currency", () => {
  const row = only(ingest(emptyState(), withText("Bancolombia: Compraste $45.900,00 en RAPPI*RESTAURANTES con tu T.Cred *1234."), mapping, "a".repeat(64), mapping.timeZone));
  expect(row.review).toMatchObject({ direction: "out", amountMinorUnits: 4_590_000, description: "RAPPI*RESTAURANTES" });
  expect(row.currency).toBe("COP"); expect(row.parserVersion).toBe(TEXT_SUGGESTION_VERSION);
  expect(row.status).toEqual({ kind: "review", currencyReviewed: true });
  expect(isReadyCandidate(projectCandidate(row), "COP")).toBe(true);
  expect(projectCandidate(row).notification?.text).toContain("RAPPI");
});

test("an explicit currency wins over the app's currency", () => {
  const row = only(ingest(emptyState(), withText("Compraste USD 12.99 en NETFLIX.COM"), mapping, "a".repeat(64), mapping.timeZone));
  expect(row.currency).toBe("USD"); expect(row.review.amountMinorUnits).toBe(1_299);
  expect(isReadyCandidate(projectCandidate(row), "COP")).toBe(false);
});

test("an account receipt without a currency marker uses the selected source currency", () => {
  const row = only(ingest(emptyState(), withText("Recibiste 45,00 en tu cuenta\nTe llegó dinero de MARIA EJEMPLO con tu llave."), mapping, "a".repeat(64), mapping.timeZone));
  expect(row.review).toMatchObject({ direction: "in", amountMinorUnits: 4_500, description: "MARIA EJEMPLO" });
  expect(row.currency).toBe("COP");
  expect(row.parserVersion).toBe(TEXT_SUGGESTION_VERSION);
  expect(isReadyCandidate(projectCandidate(row), "COP")).toBe(true);
});

test("text with no amount is kept without inventing a currency error", () => {
  const row = only(ingest(emptyState(), withText("Aprovecha 30% de descuento este fin de semana."), mapping, "a".repeat(64), mapping.timeZone));
  expect(row.review.amountMinorUnits).toBeNull();
  expect(row.status).toEqual({ kind: "review", currencyReviewed: true });
});

test("a security code that reached JS is never suggested", () => {
  const row = only(ingest(emptyState(), withText("Tu clave dinámica es 482913 para tu pago de $30.000"), mapping, "a".repeat(64), mapping.timeZone));
  expect(row.review.amountMinorUnits).toBeNull(); expect(row.review.direction).toBeNull();
});

test("without text the native fields are used as before", () => {
  const row = only(ingest(emptyState(), capture, mapping, "a".repeat(64), mapping.timeZone));
  expect(row.review).toMatchObject({ direction: "out", amountMinorUnits: 45_000, description: "Market" });
  expect(row.parserVersion).toBe("generic-v1");
});

test("the notification text never leaves the phone in a confirmation", () => {
  const text = "Compraste $18.500 en STARBUCKS CHICO con tu tarjeta Nu terminada en 4321.";
  const row = only(ingest(emptyState(), withText(text), mapping, "a".repeat(64), mapping.timeZone));
  const command = JSON.stringify(commandFor(row));
  expect(command).not.toContain("terminada"); expect(command).not.toContain("4321");
  expect(command).toContain("STARBUCKS CHICO");
});

test("candidates stored before text existed still load", () => {
  const state = ingest(emptyState(), capture, mapping, "a".repeat(64), mapping.timeZone);
  const stored = JSON.parse(serializeState(state));
  delete stored.records[0].origin.capture.text;
  const loaded = parseState(JSON.stringify(stored));
  expect((loaded.records[0] as ActiveCandidate).origin).toMatchObject({ kind: "native", capture: { text: "" } });
});
