import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { createTranslator } from "../../../../src/i18n";
import { admissionFailure } from "./failure";

const codes = [
  "device_occupier_changed", "device_slot_occupied", "device_revoked", "membership_required",
  "permission_denied", "owner_required", "authentication_required", "session_required",
  "session_inactive", "session_owner_mismatch", "device_conflict", "device_metadata_invalid",
];
const failure = (code: string, language: "en" | "es", extra: Record<string, string> = {}) =>
  admissionFailure(new ConvexError({ code, ...extra }), createTranslator(language));

test("each server code keeps its kind and its own message in both languages", () => {
  const expected: Record<string, [string, string, string]> = {
    device_occupier_changed: ["retry", "The active phone changed. Check the device shown here and try again.",
      "Cambió el celular activo. Revisa cuál aparece aquí e intenta de nuevo."],
    device_slot_occupied: ["occupied", "Another device uses this slot. Check the active device and try again.",
      "Otro celular ya usa este cupo. Revisa cuál es el celular activo e intenta de nuevo."],
    device_revoked: ["denied", "This device’s access was revoked.", "Este celular ya no tiene acceso."],
    owner_required: ["denied", "This account no longer has access.", "Esta cuenta ya no tiene acceso."],
    session_inactive: ["denied", "We couldn't authorize this session. Sign out and sign in again.",
      "No pudimos autorizar esta sesión. Cierra sesión y vuelve a iniciarla."],
    device_conflict: ["denied", "This session is registered to another installation. Sign out and sign in again.",
      "Esta sesión está registrada en otra instalación. Cierra sesión y vuelve a iniciarla."],
    device_metadata_invalid: ["denied", "We couldn't identify this installation with this version of the app. Check the app version before trying again.",
      "No pudimos identificar la instalación con esta versión de la app. Revisa la versión de la app antes de intentar de nuevo."],
  };
  for (const [code, [kind, english, spanish]] of Object.entries(expected)) {
    expect(failure(code, "en"), code).toEqual({ kind, message: english });
    expect(failure(code, "es"), code).toEqual({ kind, message: spanish });
  }
  expect(failure("device_slot_occupied", "es", { occupiedLabel: "Pixel de Ana" }).message)
    .toBe("Pixel de Ana ya usa este cupo. Revisa cuál es el celular activo e intenta de nuevo.");
});

test("an unknown or malformed error is a calm retry, never a raw code or server text", () => {
  for (const error of [new ConvexError({ code: "something_new", message: "Internal detail" }), new Error("socket closed"), "x"]) {
    expect(admissionFailure(error, createTranslator("es"))).toEqual({
      kind: "retry", message: "No pudimos confirmar el acceso de este celular. Revisa tu conexión e intenta de nuevo.",
    });
  }
});

test("Spanish keeps the failures as distinguishable as English does", () => {
  for (const language of ["en", "es"] as const) {
    const messages = new Map<string, string>();
    for (const code of [...codes, "unknown"]) messages.set(code, failure(code, language).message);
    const groups = new Map<string, string[]>();
    for (const [code, message] of messages) groups.set(message, [...groups.get(message) ?? [], code]);
    expect([...groups.values()].map((group) => group.join("+")).sort(), language).toEqual([
      "authentication_required+session_required+session_inactive+session_owner_mismatch",
      "device_conflict", "device_metadata_invalid", "device_occupier_changed", "device_revoked",
      "device_slot_occupied", "membership_required+permission_denied+owner_required", "unknown",
    ]);
  }
});
