import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { accountingErrorMessages } from "../../../../../src/accounting/errors";
import { candidateErrorText, rejectionMessage } from "./rejection";

const en = createTranslator("en").t;
const es = createTranslator("es").t;
const rejection = (data: Record<string, string>) => new ConvexError(data);

test("a server rejection reads as its code's message in each language, keeping the English server wording", () => {
  const locked = rejection({ kind: "accounting", code: "locked_period", message: "Locked Period" });
  expect(rejectionMessage(en, locked, "posting.rejected")).toBe("That month is already closed");
  expect(rejectionMessage(es, locked, "posting.rejected")).toBe("Ese mes ya está cerrado.");
  const intake = rejection({ kind: "intake", code: "description_required", message: "description_required" });
  expect(rejectionMessage(en, intake, "posting.candidateConfirmFailed")).toBe("Add a description before posting.");
  expect(rejectionMessage(es, intake, "posting.candidateConfirmFailed")).toBe("Agrega una descripción antes de registrar.");
});

test("an unknown code, a missing code or a plain error falls back without echoing the server", () => {
  const unknown = rejection({ kind: "accounting", code: "ledger_account_code_unknown", message: "Account code is not in the Chart of Accounts template" });
  expect(rejectionMessage(en, unknown, "posting.rejected")).toBe("Entry was rejected. Check the places, category, amount and date.");
  expect(rejectionMessage(es, unknown, "posting.rejected")).toBe("No pudimos registrar el movimiento. Revisa los lugares, la categoría, el monto y la fecha.");
  expect(rejectionMessage(es, rejection({ kind: "accounting", message: "Period is locked" }), "posting.batchRejected"))
    .toBe("No pudimos registrar uno de los movimientos. Edita el borrador y vuelve a intentarlo.");
  expect(rejectionMessage(es, new Error("network"), "posting.candidateConfirmFailed")).toBe("No pudimos confirmar este movimiento por revisar.");
});

test("a Candidate's stored failure reads in Spanish whether it kept a code, an English message or a local status", () => {
  expect(candidateErrorText(es, "idempotency_key_conflict")).toBe("Este movimiento ya se había enviado con otros datos.");
  expect(candidateErrorText(es, accountingErrorMessages.category_primary_required)).toBe("Elige la categoría que mejor describe este gasto.");
  expect(candidateErrorText(es, "Review unresolved currency")).toBe("Revisa la moneda");
  expect(candidateErrorText(en, "Review unresolved currency")).toBe("Review unresolved currency");
  expect(candidateErrorText(es, "Unsupported workspace currency")).toBe("Este espacio no usa esa moneda");
  expect(candidateErrorText(es, "Something new")).toBe("No pudimos registrar este movimiento");
  expect(candidateErrorText(en, "Something new")).toBe("Candidate rejected");
});
