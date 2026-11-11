import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({}));
import { copAmountConvention, legacyAmountConvention, usdAmountConvention } from "../../../../../src/accounting/currencies";
import { readPreCurrencyAmount } from "./preCurrency";
import { openStoredAmountText, preCurrencyReviewAgrees, storedAmountMinorUnits } from "./storedText";
import { parseLocalEntryDocument } from "../localEntryDrafts";
import { emptyState, ingest, parseState, projectCandidate, serializeState, type ActiveCandidate } from "../intake/durableState";
import { capture, mapping } from "../intake/service.testSupport";
import { factsFromCandidate } from "../intake/facts";

const cop = { convention: copAmountConvention, precision: 2 } as const;
const usd = { convention: usdAmountConvention, precision: 2 } as const;
const bhd = { convention: legacyAmountConvention, precision: 3 } as const;

test.each([
  ["0", 0, 0], ["-0", -0, -0], ["+0", 0, 0], [" 000,01 ", 1, 10],
  ["1.234", 123400, 1234000], ["1.234,5", 123450, 1234500], ["−1.234,50", -123450, -1234500],
  ["+12,5", 1250, 12500], ["12,", 1200, 12000], ["1,234", null, 1234], ["-12.500", -1250000, -12500000],
  ["1,2345", null, null], ["12.34", null, null], ["1..2", null, null], ["1,,2", null, null], ["1-2", null, null],
  ["1e3", null, null], [",5", null, null], [".5", null, null], ["COP 12", null, null], ["", null, null], ["-", null, null],
  ["90.071.992.547.409,91", 9007199254740991, null], ["90.071.992.547.409,92", null, null],
  ["9.007.199.254.740,991", null, 9007199254740991],
] as const)("the frozen pre-currency reader keeps today's reading of %s", (text, twoDigits, threeDigits) => {
  for (const [currency, expected] of [["COP", twoDigits], ["USD", twoDigits], ["EUR", twoDigits], ["BHD", threeDigits]] as const)
    expect(readPreCurrencyAmount(text, currency)).toEqual(expected === null ? { kind: "refused" } : { kind: "parsed", minorUnits: expected });
});

test.each([
  ["-12.500", "-12.500"], ["1.234,50", "1.234,50"], ["+12,5", "+12,5"], ["-0", "-0"], ["1234,5", "1234,5"], ["-", "-"], ["", ""],
] as const)("correct Colombian text saved before the update reopens verbatim in a COP workspace: %s", (saved, opened) => {
  expect(openStoredAmountText({ text: saved, format: "pre-currency" }, "COP", cop)).toEqual({ text: opened, notice: null });
});

test("a pre-currency trailing comma keeps its old meaning in COP", () => {
  expect(openStoredAmountText({ text: "12,", format: "pre-currency" }, "COP", cop))
    .toEqual({ text: "12,00", notice: { kind: "converted", previous: "12," } });
});

test.each([
  ["1.234,50", "1,234.50", 123450], ["-1.234,50", "-1,234.50", -123450], ["−1.234,50", "-1,234.50", -123450],
  ["1.234", "1,234.00", 123400], ["12,5", "12.50", 1250], ["+12,05", "+12.05", 1205], ["12,", "12.00", 1200],
] as const)("USD text saved in the Colombian style before the update reopens with the same money: %s", (saved, opened, minorUnits) => {
  const stored = { text: saved, format: "pre-currency" } as const;
  expect(storedAmountMinorUnits(stored, "USD")).toBe(minorUnits);
  expect(openStoredAmountText(stored, "USD", usd)).toEqual({ text: opened, notice: { kind: "converted", previous: saved } });
});

test.each([["1234", "1234"], ["-12", "-12"], ["-", "-"]] as const)("USD text without separators reopens verbatim: %s", (saved, opened) => {
  expect(openStoredAmountText({ text: saved, format: "pre-currency" }, "USD", usd)).toEqual({ text: opened, notice: null });
});

test.each([
  ["12.34", ""], ["-1,234", "-"], ["+1,234", "+"], ["1e3", ""], ["90.071.992.547.409,92", ""],
] as const)("USD text the old grammar could not read opens blank for re-entry and is never guessed: %s", (saved, sign) => {
  const stored = { text: saved, format: "pre-currency" } as const;
  expect(storedAmountMinorUnits(stored, "USD")).toBeNull();
  expect(openStoredAmountText(stored, "USD", usd)).toEqual({ text: sign, notice: { kind: "reenter", previous: saved } });
});

test("other currencies keep the Colombian style, so their old text reopens verbatim", () => {
  expect(openStoredAmountText({ text: "1.234,5", format: "pre-currency" }, "BHD", bhd)).toEqual({ text: "1.234,5", notice: null });
  expect(storedAmountMinorUnits({ text: "1.234,5", format: "legacy-es-CO/1" }, "BHD")).toBe(1234500);
});

test("text tagged with the current convention opens verbatim, incomplete text included", () => {
  for (const text of ["12,", "1,23", "1,234.5", "-"]) expect(openStoredAmountText({ text, format: "usd/1" }, "USD", usd)).toEqual({ text, notice: null });
  expect(storedAmountMinorUnits({ text: "1,234.5", format: "usd/1" }, "USD")).toBe(123450);
  expect(storedAmountMinorUnits({ text: "1,23", format: "usd/1" }, "USD")).toBeNull();
});

test("text tagged with another convention is read by that convention, never the current one", () => {
  expect(openStoredAmountText({ text: "1.234,5", format: "cop/1" }, "USD", usd))
    .toEqual({ text: "1,234.50", notice: { kind: "converted", previous: "1.234,5" } });
  expect(openStoredAmountText({ text: "1.234", format: "usd/1" }, "USD", cop))
    .toEqual({ text: "", notice: { kind: "reenter", previous: "1.234" } });
});

test("text marked for re-entry is never read", () => {
  const stored = { text: "-1.234,50", format: "pre-currency", reenter: true } as const;
  expect(storedAmountMinorUnits(stored, "COP")).toBeNull();
  expect(openStoredAmountText(stored, "COP", cop)).toEqual({ text: "-", notice: { kind: "reenter", previous: "-1.234,50" } });
});

test("pre-currency review text agrees with its review only when both describe the same signed money", () => {
  expect(preCurrencyReviewAgrees("-1.234,50", "USD", { amountMinorUnits: 123450, direction: "out" })).toBe(true);
  expect(preCurrencyReviewAgrees("-1.234,50", "USD", { amountMinorUnits: 123450, direction: "in" })).toBe(false);
  expect(preCurrencyReviewAgrees("-1.234,50", "USD", { amountMinorUnits: 1234500, direction: "out" })).toBe(false);
  expect(preCurrencyReviewAgrees("-12.34", "USD", { amountMinorUnits: null, direction: "out" })).toBe(true);
  expect(preCurrencyReviewAgrees("-12.34", "USD", { amountMinorUnits: 1234, direction: "out" })).toBe(false);
  expect(preCurrencyReviewAgrees("0", "COP", { amountMinorUnits: 0, direction: null })).toBe(true);
});

const now = 1_700_000_000_000;
const command = {
  kind: "expense",
  payload: { workspaceId: "w", financialAccountProfileId: "cash", amount: { currency: "USD", minorUnits: 123450 },
    accountingDate: "2026-11-01", description: "Sent", idempotencyKey: "sent-key" },
} as const;
const facts = (currency: string, amountText: string) => ({
  workspaceId: "w", currency, entryType: "normal", amountText, accountingDate: "2026-11-01", description: "Lunch",
  profileId: "cash", destinationId: null, categories: { ids: [], primaryId: null },
});
const versionOne = {
  v: 1,
  drafts: [
    { id: "cop", createdAt: now, expiresAt: now + 1000, status: "open", facts: facts("COP", "-1.234,50") },
    { id: "usd", createdAt: now, expiresAt: now + 1000, status: "open", facts: facts("USD", "-1.234,50") },
    { id: "usd-bad", createdAt: now, expiresAt: now + 1000, status: "open", facts: facts("USD", "-12.34") },
    { id: "sent", createdAt: now, expiresAt: now + 1000, status: "posting", command },
  ],
  postingBatches: { w: { queue: [{ id: "row", command: { ...command, payload: { ...command.payload, idempotencyKey: "row-key" } } }], receipts: { count: 0, net: 0 } } },
};

test("version 1 Drafts read as pre-currency text, verbatim, with sent commands and batch rows untouched", () => {
  const { document, dirty } = parseLocalEntryDocument(JSON.parse(JSON.stringify(versionOne)), now);
  expect(dirty).toBe(false);
  expect(document.v).toBe(3);
  expect(document.drafts.map((draft) => draft.status === "open" ? [draft.id, draft.facts.amountText, draft.facts.amountFormat] : [draft.id]))
    .toEqual([["cop", "-1.234,50", "pre-currency"], ["usd", "-1.234,50", "pre-currency"], ["usd-bad", "-12.34", "pre-currency"], ["sent"]]);
  expect(document.drafts[3]).toEqual(versionOne.drafts[3]);
  expect(document.postingBatches).toEqual(versionOne.postingBatches);
});

test("a version 2 Draft keeps its format through a write and a read", () => {
  const written = JSON.parse(JSON.stringify({
    v: 2, drafts: [{ id: "usd", createdAt: now, expiresAt: now + 1000, status: "open", facts: { ...facts("USD", "-1,234.5"), amountFormat: "usd/1" } }],
  }));
  const { document } = parseLocalEntryDocument(written, now);
  expect(document.drafts[0]).toMatchObject({ facts: { amountText: "-1,234.5", amountFormat: "usd/1" } });
  expect(parseLocalEntryDocument(JSON.parse(JSON.stringify(document)), now).document).toEqual(document);
});

test("a version 3 Draft keeps an amount awaiting confirmation through a write and a read; a version 2 Draft reads with none", () => {
  const awaiting = { ...facts("USD", "-1,234.00"), amountFormat: "usd/1", amountReview: { reason: "converted", previous: "-1.234" } };
  const written = JSON.parse(JSON.stringify({ v: 3, drafts: [{ id: "usd", createdAt: now, expiresAt: now + 1000, status: "open", facts: awaiting }] }));
  const { document } = parseLocalEntryDocument(written, now);
  expect(document.drafts[0]).toMatchObject({ facts: { amountText: "-1,234.00", amountFormat: "usd/1", amountReview: { reason: "converted", previous: "-1.234" } } });
  expect(parseLocalEntryDocument(JSON.parse(JSON.stringify(document)), now).document).toEqual(document);
  const older = parseLocalEntryDocument({ v: 2, drafts: [{ id: "usd", createdAt: now, expiresAt: now + 1000, status: "open",
    facts: { ...facts("USD", "-1,234.5"), amountFormat: "usd/1" } }] }, now).document;
  expect(older.v).toBe(3);
  expect(older.drafts[0]).toEqual({ id: "usd", createdAt: now, expiresAt: now + 1000, status: "open",
    facts: { ...facts("USD", "-1,234.5"), amountFormat: "usd/1" } });
});

test("an unknown Draft document version or text format blocks instead of clearing", () => {
  expect(() => parseLocalEntryDocument({ ...versionOne, v: 4 }, now)).toThrow();
  expect(() => parseLocalEntryDocument({
    v: 3, drafts: [{ id: "x", createdAt: now, expiresAt: now + 1000, status: "open",
      facts: { ...facts("USD", "1,234"), amountFormat: "usd/1", amountReview: { reason: "guessed", previous: null } } }],
  }, now)).toThrow();
  expect(() => parseLocalEntryDocument({
    v: 2, drafts: [{ id: "x", createdAt: now, expiresAt: now + 1000, status: "open", facts: { ...facts("USD", "1"), amountFormat: "usd/2" } }],
  }, now)).toThrow();
  expect(() => parseLocalEntryDocument({
    v: 2, drafts: [{ id: "x", createdAt: now, expiresAt: now + 1000, status: "open", facts: facts("USD", "1") }],
  }, now)).toThrow();
});

function versionThree(state: ReturnType<typeof emptyState>) {
  return JSON.stringify({
    ...state, v: 3,
    records: state.records.map((record) => {
      if (record.kind !== "active") return record;
      const { reviewAmountFormat: _format, reviewAmountReenter: _reenter, ...rest } = record;
      return rest;
    }),
  });
}

function reviewed(currency: "COP" | "USD", text: string | null, review: Partial<ActiveCandidate["review"]>) {
  const state = ingest(emptyState(), { ...capture, currency }, { ...mapping, currency }, "a".repeat(64), mapping.timeZone);
  const row = state.records[0] as ActiveCandidate;
  return { ...state, records: [{ ...row, review: { ...row.review, ...review }, reviewAmountText: text, reviewAmountFormat: text === null ? null : "pre-currency" as const }] };
}

test("a version 4 Candidate document reads unchanged as version 5, with no confirmation pending on its review text", () => {
  const state = parseState(versionThree(reviewed("USD", "-1.234,50", { amountMinorUnits: 123450, direction: "out" })));
  const versionFour = JSON.stringify({ ...JSON.parse(serializeState(state)), v: 4 });
  const read = parseState(versionFour);
  expect(read.v).toBe(5);
  expect(read.records).toEqual(state.records);
  expect((read.records[0] as ActiveCandidate).reviewAmountReview).toBeUndefined();
  expect(projectCandidate(read.records[0] as ActiveCandidate).reviewAmount).toEqual({ text: "-1.234,50", format: "pre-currency" });
});

test("version 3 Candidate review text becomes tagged pre-currency text and reopens with the same money", () => {
  const state = parseState(versionThree(reviewed("USD", "-1.234,50", { amountMinorUnits: 123450, direction: "out" })));
  expect(state.v).toBe(5);
  const row = state.records[0] as ActiveCandidate;
  expect(row).toMatchObject({ reviewAmountText: "-1.234,50", reviewAmountFormat: "pre-currency" });
  expect(row.reviewAmountReenter).toBeUndefined();
  const projected = factsFromCandidate(projectCandidate(row));
  expect(projected).toMatchObject({ amountText: "-1.234,50", amountFormat: "pre-currency" });
  expect(openStoredAmountText({ text: projected.amountText, format: projected.amountFormat }, "USD", usd).text).toBe("-1,234.50");
  expect(parseState(serializeState(state))).toEqual(state);
});

test("version 3 review text that disagrees with its saved amount is kept and marked for re-entry", () => {
  const row = parseState(versionThree(reviewed("COP", "-1.234,50", { amountMinorUnits: 999, direction: "out" }))).records[0] as ActiveCandidate;
  expect(row).toMatchObject({ reviewAmountText: "-1.234,50", reviewAmountFormat: "pre-currency", reviewAmountReenter: true, review: { amountMinorUnits: 999 } });
  expect(factsFromCandidate(projectCandidate(row))).toMatchObject({ amountText: "-1.234,50", amountReenter: true });
});

test("version 3 Candidates without review text and frozen commands are carried unchanged", () => {
  const plain = parseState(versionThree(reviewed("COP", null, {}))).records[0] as ActiveCandidate;
  expect(plain).toMatchObject({ reviewAmountText: null, reviewAmountFormat: null });
  const base = reviewed("USD", "-1.234,50", { amountMinorUnits: 123450, direction: "out", description: "Market" });
  const row = base.records[0];
  const sent = { kind: "submitting", startedAt: now, command: {
    workspaceId: row.workspaceId, candidateId: row.id, parserVersion: row.parserVersion, consentVersion: row.consentVersion,
    confirmed: { ...row.review, direction: "out", amount: { currency: "USD", minorUnits: 123450 } },
    suggestion: { ...row.review, amount: { currency: "COP", minorUnits: 45000 } },
  } } as const;
  const { amountMinorUnits: _review, ...confirmed } = sent.command.confirmed;
  const { amountMinorUnits: _evidence, ...suggestion } = sent.command.suggestion;
  const status = { ...sent, command: { ...sent.command, confirmed, suggestion } };
  const migrated = parseState(versionThree({ ...base, records: [{ ...row, status }] })).records[0] as ActiveCandidate;
  expect(migrated.status).toEqual(status);
  expect(migrated.recordRevision).toBe(row.recordRevision);
});
