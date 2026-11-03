import { expect, test } from "vitest";
import corpus from "./suggestSamples.json";
import { pieces, suggest } from "./suggest";

type Expected = { minor: number | null; currency: string | null; direction: string | null; merchant: string | null; sensitive?: boolean };

test.each(corpus.samples)("$id", ({ title, text, expected }) => {
  const want = expected as Expected;
  const result = suggest({ title, text });
  if (want.sensitive) {
    expect(result.sensitive).not.toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe("manual");
    return;
  }
  expect(result.sensitive).toBeNull();
  expect(result.amount?.minor ?? null).toBe(want.minor);
  if (want.minor !== null) expect(result.amount?.currency ?? "COP").toBe(want.currency);
  expect(result.direction?.value ?? null).toBe(want.direction);
  expect(result.counterparty?.value ?? null).toBe(want.merchant);
  // Every suggestion points at the text it came from.
  if (result.amount) expect(result.text.slice(result.amount.start, result.amount.end)).toBe(result.amount.raw);
  if (result.counterparty) expect(result.text.slice(result.counterparty.start, result.counterparty.end)).toBe(result.counterparty.value);
});

test("a balance never wins over the charge and is offered as an alternative", () => {
  const result = suggest({ title: "Compra aprobada", text: "Saldo disponible: $1.250.300. Compra por $32.000 en TIENDA D1." });
  expect(result.amount?.minor).toBe(3_200_000);
  expect(result.amounts.map((mention) => mention.role)).toEqual(["charge", "balance"]);
  expect(result.confidence).toBe("ready");
  expect(result.notes.join(" ")).toContain("balance");
});

test("number formats read the way Colombian banks write them", () => {
  const minor = (text: string) => suggest({ text }).amount?.minor ?? null;
  expect(minor("Compra $45.900")).toBe(4_590_000);
  expect(minor("Compra $45,900")).toBe(4_590_000);
  expect(minor("Compra $45.900,50")).toBe(4_590_050);
  expect(minor("Purchase USD 1,234.56")).toBe(123_456);
  expect(minor("Purchase USD 12.99")).toBe(1_299);
  expect(minor("Compra 45.900 COP")).toBe(4_590_000);
  expect(minor("Pago de 30 pesos")).toBe(3_000);
  expect(minor("Tienes 30% de descuento")).toBeNull();
  expect(minor("Tarjeta *1234 bloqueada")).toBeNull();
});

test("several charge-like amounts ask the person to choose", () => {
  const result = suggest({ text: "Pagaste $20.000 y $15.000 en PARQUEADERO" });
  expect(result.amounts).toHaveLength(2);
  expect(result.confidence).toBe("check");
});

test("pieces cover the text exactly once, in order", () => {
  for (const sample of corpus.samples) {
    const result = suggest(sample);
    expect(pieces(result).map((piece) => piece.text).join("")).toBe(result.text);
  }
});
