/**
 * Active ISO 4217 currency codes a Workspace may use as its Functional Currency.
 * Excludes fund codes (BOV, CLF, COU, MXV, USN, UYI, UYW, CHE, CHW), precious metals,
 * SDR, and the testing / no-currency codes, and withdrawn codes (ANG, BGN, CUC, HRK,
 * SLL, ZWL). A fixed list keeps validation identical across runtimes.
 */
export const functionalCurrencyCodes: ReadonlySet<string> = new Set([
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM",
  "BBD", "BDT", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN",
  "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC",
  "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB",
  "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ",
  "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR",
  "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW",
  "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD",
  "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK",
  "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR",
  "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD",
  "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE",
  "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT",
  "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU",
  "UZS", "VED", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XOF",
  "XPF", "YER", "ZAR", "ZMW", "ZWG",
]);


// ISO 4217 List One, SIX, published 2026-09-17. All other supported currencies use two digits.
// https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
const minorUnitDigits: Readonly<Record<string, 0 | 3>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

export function currencyMinorUnitDigits(currency: string): 0 | 2 | 3 {
  return minorUnitDigits[currency] ?? 2;
}

export type AmountConvention = Readonly<{
  id: "cop" | "usd" | "legacy-es-CO";
  version: 1;
  group: "." | ",";
  decimal: "." | ",";
  primaryGroupSize: 3;
  secondaryGroupSize: 2 | 3;
}>;

export const copAmountConvention: AmountConvention = Object.freeze({
  id: "cop", version: 1, group: ".", decimal: ",", primaryGroupSize: 3, secondaryGroupSize: 3,
});
export const usdAmountConvention: AmountConvention = Object.freeze({
  id: "usd", version: 1, group: ",", decimal: ".", primaryGroupSize: 3, secondaryGroupSize: 3,
});
export const legacyAmountConvention: AmountConvention = Object.freeze({
  id: "legacy-es-CO", version: 1, group: ".", decimal: ",", primaryGroupSize: 3, secondaryGroupSize: 3,
});

export const currencyAmountConventions = Object.freeze({
  AED: legacyAmountConvention,
  AFN: legacyAmountConvention,
  ALL: legacyAmountConvention,
  AMD: legacyAmountConvention,
  AOA: legacyAmountConvention,
  ARS: legacyAmountConvention,
  AUD: legacyAmountConvention,
  AWG: legacyAmountConvention,
  AZN: legacyAmountConvention,
  BAM: legacyAmountConvention,
  BBD: legacyAmountConvention,
  BDT: legacyAmountConvention,
  BHD: legacyAmountConvention,
  BIF: legacyAmountConvention,
  BMD: legacyAmountConvention,
  BND: legacyAmountConvention,
  BOB: legacyAmountConvention,
  BRL: legacyAmountConvention,
  BSD: legacyAmountConvention,
  BTN: legacyAmountConvention,
  BWP: legacyAmountConvention,
  BYN: legacyAmountConvention,
  BZD: legacyAmountConvention,
  CAD: legacyAmountConvention,
  CDF: legacyAmountConvention,
  CHF: legacyAmountConvention,
  CLP: legacyAmountConvention,
  CNY: legacyAmountConvention,
  COP: copAmountConvention,
  CRC: legacyAmountConvention,
  CUP: legacyAmountConvention,
  CVE: legacyAmountConvention,
  CZK: legacyAmountConvention,
  DJF: legacyAmountConvention,
  DKK: legacyAmountConvention,
  DOP: legacyAmountConvention,
  DZD: legacyAmountConvention,
  EGP: legacyAmountConvention,
  ERN: legacyAmountConvention,
  ETB: legacyAmountConvention,
  EUR: legacyAmountConvention,
  FJD: legacyAmountConvention,
  FKP: legacyAmountConvention,
  GBP: legacyAmountConvention,
  GEL: legacyAmountConvention,
  GHS: legacyAmountConvention,
  GIP: legacyAmountConvention,
  GMD: legacyAmountConvention,
  GNF: legacyAmountConvention,
  GTQ: legacyAmountConvention,
  GYD: legacyAmountConvention,
  HKD: legacyAmountConvention,
  HNL: legacyAmountConvention,
  HTG: legacyAmountConvention,
  HUF: legacyAmountConvention,
  IDR: legacyAmountConvention,
  ILS: legacyAmountConvention,
  INR: legacyAmountConvention,
  IQD: legacyAmountConvention,
  IRR: legacyAmountConvention,
  ISK: legacyAmountConvention,
  JMD: legacyAmountConvention,
  JOD: legacyAmountConvention,
  JPY: legacyAmountConvention,
  KES: legacyAmountConvention,
  KGS: legacyAmountConvention,
  KHR: legacyAmountConvention,
  KMF: legacyAmountConvention,
  KPW: legacyAmountConvention,
  KRW: legacyAmountConvention,
  KWD: legacyAmountConvention,
  KYD: legacyAmountConvention,
  KZT: legacyAmountConvention,
  LAK: legacyAmountConvention,
  LBP: legacyAmountConvention,
  LKR: legacyAmountConvention,
  LRD: legacyAmountConvention,
  LSL: legacyAmountConvention,
  LYD: legacyAmountConvention,
  MAD: legacyAmountConvention,
  MDL: legacyAmountConvention,
  MGA: legacyAmountConvention,
  MKD: legacyAmountConvention,
  MMK: legacyAmountConvention,
  MNT: legacyAmountConvention,
  MOP: legacyAmountConvention,
  MRU: legacyAmountConvention,
  MUR: legacyAmountConvention,
  MVR: legacyAmountConvention,
  MWK: legacyAmountConvention,
  MXN: legacyAmountConvention,
  MYR: legacyAmountConvention,
  MZN: legacyAmountConvention,
  NAD: legacyAmountConvention,
  NGN: legacyAmountConvention,
  NIO: legacyAmountConvention,
  NOK: legacyAmountConvention,
  NPR: legacyAmountConvention,
  NZD: legacyAmountConvention,
  OMR: legacyAmountConvention,
  PAB: legacyAmountConvention,
  PEN: legacyAmountConvention,
  PGK: legacyAmountConvention,
  PHP: legacyAmountConvention,
  PKR: legacyAmountConvention,
  PLN: legacyAmountConvention,
  PYG: legacyAmountConvention,
  QAR: legacyAmountConvention,
  RON: legacyAmountConvention,
  RSD: legacyAmountConvention,
  RUB: legacyAmountConvention,
  RWF: legacyAmountConvention,
  SAR: legacyAmountConvention,
  SBD: legacyAmountConvention,
  SCR: legacyAmountConvention,
  SDG: legacyAmountConvention,
  SEK: legacyAmountConvention,
  SGD: legacyAmountConvention,
  SHP: legacyAmountConvention,
  SLE: legacyAmountConvention,
  SOS: legacyAmountConvention,
  SRD: legacyAmountConvention,
  SSP: legacyAmountConvention,
  STN: legacyAmountConvention,
  SVC: legacyAmountConvention,
  SYP: legacyAmountConvention,
  SZL: legacyAmountConvention,
  THB: legacyAmountConvention,
  TJS: legacyAmountConvention,
  TMT: legacyAmountConvention,
  TND: legacyAmountConvention,
  TOP: legacyAmountConvention,
  TRY: legacyAmountConvention,
  TTD: legacyAmountConvention,
  TWD: legacyAmountConvention,
  TZS: legacyAmountConvention,
  UAH: legacyAmountConvention,
  UGX: legacyAmountConvention,
  USD: usdAmountConvention,
  UYU: legacyAmountConvention,
  UZS: legacyAmountConvention,
  VED: legacyAmountConvention,
  VES: legacyAmountConvention,
  VND: legacyAmountConvention,
  VUV: legacyAmountConvention,
  WST: legacyAmountConvention,
  XAF: legacyAmountConvention,
  XCD: legacyAmountConvention,
  XCG: legacyAmountConvention,
  XOF: legacyAmountConvention,
  XPF: legacyAmountConvention,
  YER: legacyAmountConvention,
  ZAR: legacyAmountConvention,
  ZMW: legacyAmountConvention,
  ZWG: legacyAmountConvention,
} satisfies Readonly<Record<string, AmountConvention>>);

export type FunctionalCurrency = keyof typeof currencyAmountConventions;

export function isFunctionalCurrency(currency: string): currency is FunctionalCurrency {
  return Object.hasOwn(currencyAmountConventions, currency);
}

export function currencyAmountConvention(currency: string): AmountConvention {
  if (!isFunctionalCurrency(currency)) throw new RangeError("Unsupported functional currency");
  return currencyAmountConventions[currency];
}
