import { describe, expect, it, vi } from "vitest";
import { parseAmount } from "./money";
import { formatMoney } from "../posted-activity/phone";

describe("phone money uses ISO minor units across native runtimes", () => {
  it("parses COP cents even when platform currency defaults report zero digits", () => {
    const spy = vi.spyOn(Intl.NumberFormat.prototype, "resolvedOptions").mockImplementation(() => { throw new Error("Platform currency defaults are not accounting facts"); });
    expect(parseAmount("10000.00", "COP")).toBe(1000000);
    expect(parseAmount("1250.00", "COP")).toBe(125000);
    expect(formatMoney("COP", 875000)).toBe("COP\u00a08,750.00");
    spy.mockRestore();
  });
  it("rejects extra fractions, exponent input and unsafe amounts, preserving zero and three-digit currencies", () => {
    expect(parseAmount("12.01", "JPY")).toBeNull();
    expect(parseAmount("12", "JPY")).toBe(12);
    expect(parseAmount("12.345", "BHD")).toBe(12345);
    expect(parseAmount("12.3456", "BHD")).toBeNull();
    expect(parseAmount("1e4", "COP")).toBeNull();
    expect(parseAmount("0", "COP")).toBe(0);
    expect(parseAmount("90071992547409.91", "COP")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseAmount("90071992547409.92", "COP")).toBeNull();
    expect(formatMoney("COP", Number.MAX_SAFE_INTEGER)).toBe("COP\u00a090,071,992,547,409.91");
    expect(formatMoney("COP", -125000)).toBe("-COP\u00a01,250.00");
  });
});
