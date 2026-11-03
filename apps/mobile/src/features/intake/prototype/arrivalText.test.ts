import { expect, test } from "vitest";
import { arrivalText } from "./arrivalText";

const string = (value: string) => ({ type: "java.lang.String", status: "complete", value, representation: "plain_text" });
const map = (pairs: Record<string, unknown>) => ({ type: "java.util.LinkedHashMap", status: "complete",
  entries: Object.entries(pairs).map(([name, value]) => ({ name: string(name), value })) });

test("reads the listener's encoded snapshot, preferring the big text", () => {
  const snapshot = map({
    originalTextFields: map({ "android.title": string("Nu"), "android.text": string("Compraste $18.500"),
      "android.bigText": string("Compraste $18.500 en STARBUCKS CHICO"), "android.textLines": { type: "null", status: "complete", value: null } }),
    extras: map({ "android.title": string("ignored copy") }),
  });
  expect(arrivalText(snapshot)).toEqual({ title: "Nu", text: "Compraste $18.500 en STARBUCKS CHICO" });
});

test("joins text lines and accepts the simpler fields shape", () => {
  const lines = { type: "[Ljava.lang.CharSequence;", status: "complete", values: [string("Compra $10.000"), string("en TIENDA")] };
  expect(arrivalText(map({ originalTextFields: map({ "android.textLines": lines }) }))).toEqual({ title: "", text: "Compra $10.000\nen TIENDA" });
  expect(arrivalText({ type: "Bundle", fields: { "android.title": string("Banco"), "android.text": string("Pago $5.000") } }))
    .toEqual({ title: "Banco", text: "Pago $5.000" });
});

test("unknown shapes give empty text", () => {
  expect(arrivalText(null)).toEqual({ title: "", text: "" });
  expect(arrivalText({ weird: true })).toEqual({ title: "", text: "" });
});
