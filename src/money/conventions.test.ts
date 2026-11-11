import { expect, test } from "vitest";
import { currencyAmountConvention, currencyAmountConventions, currencyMinorUnitDigits, functionalCurrencyCodes, isFunctionalCurrency } from "../accounting/currencies";
import { formatMinorUnits } from "./amount";

const legacyCodes = `AED AFN ALL AMD AOA ARS AUD AWG AZN BAM
BBD BDT BHD BIF BMD BND BOB BRL BSD BTN
BWP BYN BZD CAD CDF CHF CLP CNY CRC CUP
CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR
FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD
HKD HNL HTG HUF IDR ILS INR IQD IRR ISK
JMD JOD JPY KES KGS KHR KMF KPW KRW KWD
KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL
MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN
MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB
PEN PGK PHP PKR PLN PYG QAR RON RSD RUB
RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS
SRD SSP STN SVC SYP SZL THB TJS TMT TND
TOP TRY TTD TWD TZS UAH UGX UYU UZS VED
VES VND VUV WST XAF XCD XCG XOF XPF YER
ZAR ZMW ZWG`.split(/\s+/);

test("every supported currency has a reviewed profile, with no implicit default", () => {
  const expected = [...legacyCodes, "COP", "USD"].sort();
  expect([...functionalCurrencyCodes].sort()).toEqual(expected);
  expect(Object.keys(currencyAmountConventions).sort()).toEqual(expected);
  expect(expected).toHaveLength(155);
  for (const code of expected) {
    const profile = currencyAmountConvention(code);
    expect(profile).toEqual({ id: code === "COP" ? "cop" : code === "USD" ? "usd" : "legacy-es-CO", version: 1,
      group: code === "USD" ? "," : ".", decimal: code === "USD" ? "." : ",", primaryGroupSize: 3, secondaryGroupSize: 3 });
    expect(isFunctionalCurrency(code)).toBe(true);
    const precision = currencyMinorUnitDigits(code);
    const expectedBody = precision === 0 ? "1.234.567" : precision === 3 ? "1.234,567" : code === "USD" ? "12,345.67" : "12.345,67";
    expect(formatMinorUnits(1234567, { convention: profile, precision })).toBe(expectedBody);
  }
});

test.each(["", "usd", "ZZZ", "toString", "__proto__", " COP", "USN"])("unsupported %s cannot acquire a fallback profile", code => {
  expect(isFunctionalCurrency(code)).toBe(false);
  expect(() => currencyAmountConvention(code)).toThrow("Unsupported functional currency");
});
