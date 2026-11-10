import type { AmountConvention } from "../accounting/currencies";

export type AmountPrecision = 0 | 2 | 3;
export type AmountFormat = Readonly<{ convention: AmountConvention; precision: AmountPrecision }>;
export type AmountIssue =
  | { code: "empty" }
  | { code: "incomplete"; expected: "digits" | "fraction" | "group" }
  | { code: "wrong_separator"; separator: string; group: string; decimal: string }
  | { code: "bad_grouping"; group: string; primaryGroupSize: number; secondaryGroupSize: number }
  | { code: "too_many_decimals"; precision: AmountPrecision; actual: number }
  | { code: "decimals_not_allowed"; decimal: string }
  | { code: "too_large"; maxMinorUnits: string }
  | { code: "not_a_number"; character: string; index: number };
export type AmountParseResult =
  | { kind: "parsed"; minorUnits: number }
  | { kind: "refused"; issue: AmountIssue };

const maxMinorUnits = "9007199254740991";

function unsignedDigits(text: string): string {
  return text.replace(/^0+/, "") || "0";
}

function groupWhole(whole: string, convention: AmountConvention): string {
  const groups: string[] = [];
  let end = whole.length;
  let size: number = convention.primaryGroupSize;
  while (end > size) {
    groups.unshift(whole.slice(end - size, end));
    end -= size;
    size = convention.secondaryGroupSize;
  }
  groups.unshift(whole.slice(0, end));
  return groups.join(convention.group);
}

function validGrouping(whole: string, convention: AmountConvention): boolean {
  const groups = whole.split(convention.group);
  if (groups.length === 1) return /^\d+$/.test(whole);
  const first = groups[0];
  const last = groups[groups.length - 1];
  return first.length >= 1 && first.length <= convention.secondaryGroupSize && /^\d+$/.test(first)
    && last.length === convention.primaryGroupSize && /^\d+$/.test(last)
    && groups.slice(1, -1).every(group => group.length === convention.secondaryGroupSize && /^\d+$/.test(group));
}

export function parseAmount(text: string, format: AmountFormat): AmountParseResult {
  const { convention, precision } = format;
  const raw = text.trim();
  const refuse = (issue: AmountIssue): AmountParseResult => ({ kind: "refused", issue });
  if (!raw) return refuse({ code: "empty" });
  const negative = raw.startsWith("-") || raw.startsWith("−");
  const unsigned = /^[+−-]/.test(raw) ? raw.slice(1) : raw;
  if (!unsigned) return refuse({ code: "incomplete", expected: "digits" });
  for (let index = 0; index < unsigned.length; index++) {
    const character = unsigned[index];
    if (!/[0-9]/.test(character) && character !== convention.group && character !== convention.decimal) {
      return refuse({ code: "not_a_number", character, index: raw.length - unsigned.length + index });
    }
  }
  const parts = unsigned.split(convention.decimal);
  if (precision === 0 && parts.length > 1) return refuse({ code: "decimals_not_allowed", decimal: convention.decimal });
  const whole = parts[0];
  const fraction = parts[1] ?? "";
  if (parts.length > 2 || fraction.includes(convention.group)) {
    return refuse({ code: "wrong_separator", separator: parts.length > 2 ? convention.decimal : convention.group, group: convention.group, decimal: convention.decimal });
  }
  if (!whole) return refuse({ code: "not_a_number", character: unsigned[0], index: raw.length - unsigned.length });
  if (!validGrouping(whole, convention)) return refuse({ code: "bad_grouping", group: convention.group, primaryGroupSize: convention.primaryGroupSize, secondaryGroupSize: convention.secondaryGroupSize });
  if (fraction.length > precision) return refuse({ code: "too_many_decimals", precision, actual: fraction.length });
  if (parts.length === 2 && !fraction) return refuse({ code: "incomplete", expected: "fraction" });
  const digits = unsignedDigits(whole.split(convention.group).join("") + fraction.padEnd(precision, "0"));
  if (digits.length > maxMinorUnits.length || (digits.length === maxMinorUnits.length && digits > maxMinorUnits)) {
    return refuse({ code: "too_large", maxMinorUnits });
  }
  const minorUnits = Number(digits);
  return { kind: "parsed", minorUnits: minorUnits === 0 ? 0 : negative ? -minorUnits : minorUnits };
}

function minorDigits(minorUnits: number): string {
  if (!Number.isSafeInteger(minorUnits)) throw new RangeError("Amount must be a safe integer of minor units");
  return String(Math.abs(minorUnits));
}

export function formatMinorUnits(minorUnits: number, format: AmountFormat, options?: { hideZeroDecimals?: boolean }): string {
  const { convention, precision } = format;
  const digits = minorDigits(minorUnits).padStart(precision + 1, "0");
  const whole = precision === 0 ? digits : digits.slice(0, -precision);
  const fraction = precision === 0 ? "" : digits.slice(-precision);
  const showFraction = fraction !== "" && !(options?.hideZeroDecimals && /^0+$/.test(fraction));
  return `${minorUnits < 0 ? "−" : ""}${groupWhole(whole, convention)}${showFraction ? convention.decimal + fraction : ""}`;
}

export type CompactBodyOptions = Readonly<{
  scale: 0 | 3 | 6 | 9 | 12;
  fractionDigits: 0 | 1 | 2;
  trimTrailingZeros?: boolean;
}>;

export function formatCompactBody(minorUnits: number, format: AmountFormat, options: CompactBodyOptions): string {
  const places = format.precision + options.scale;
  const digits = minorDigits(minorUnits).padStart(places + options.fractionDigits + 1, "0");
  const split = digits.length - places;
  const whole = digits.slice(0, split);
  const fraction = digits.slice(split).padEnd(options.fractionDigits + 1, "0");
  let kept = unsignedDigits(whole + fraction.slice(0, options.fractionDigits));
  if (fraction[options.fractionDigits] >= "5") {
    let carry = 1;
    const result: string[] = [];
    for (let i = kept.length - 1; i >= 0; i--) {
      const next = Number(kept[i]) + carry;
      result.unshift(String(next % 10));
      carry = next >= 10 ? 1 : 0;
    }
    kept = (carry ? "1" : "") + result.join("");
  }
  const padded = kept.padStart(options.fractionDigits + 1, "0");
  const body = options.fractionDigits === 0 ? padded : padded.slice(0, -options.fractionDigits);
  const tail = options.fractionDigits === 0 ? "" : padded.slice(-options.fractionDigits);
  const trimmed = options.trimTrailingZeros ? tail.replace(/0+$/, "") : tail;
  return `${minorUnits < 0 && /[1-9]/.test(kept) ? "−" : ""}${body}${trimmed ? format.convention.decimal + trimmed : ""}`;
}

export type AmountSelection = Readonly<{ start: number; end: number }>;
export type AmountEdit =
  | { kind: "type"; character: string }
  | { kind: "paste"; text: string }
  | { kind: "delete"; direction: "backward" | "forward" }
  | { kind: "decimal" }
  | { kind: "select"; selection: AmountSelection };

type EditorBase = Readonly<{
  format: AmountFormat;
  text: string;
  selection: AmountSelection;
  generatedGroups: readonly number[];
}>;
export type AmountEditorState = EditorBase & (
  | { kind: "complete"; minorUnits: number }
  | { kind: "incomplete"; issue: AmountIssue }
  | { kind: "invalid"; issue: AmountIssue }
);

function inspectEditor(base: EditorBase, typed: boolean): AmountEditorState {
  const parsed = parseAmount(base.text, base.format);
  if (parsed.kind === "parsed") return { ...base, kind: "complete", minorUnits: parsed.minorUnits };
  if (parsed.issue.code === "empty" || parsed.issue.code === "incomplete") return { ...base, kind: "incomplete", issue: parsed.issue };
  const { convention } = base.format;
  const unsigned = base.text.replace(/^[+−-]/, "");
  if (typed && parsed.issue.code === "bad_grouping" && !unsigned.includes(convention.decimal)) {
    const groups = unsigned.split(convention.group);
    const last = groups.pop() ?? "";
    const prefix = groups.join(convention.group);
    if (groups.length && /^\d*$/.test(last) && last.length < convention.primaryGroupSize
      && validGrouping(prefix + convention.group + "0".repeat(convention.primaryGroupSize), convention)) {
      return { ...base, kind: "incomplete", issue: { code: "incomplete", expected: "group" } };
    }
  }
  return { ...base, kind: "invalid", issue: parsed.issue };
}

function canonicalEditor(base: EditorBase, typed: boolean): AmountEditorState {
  const state = inspectEditor(base, typed);
  if (state.kind === "invalid" || (state.kind === "incomplete" && state.issue.code === "incomplete" && state.issue.expected !== "fraction")) return state;
  if (state.kind === "incomplete" && state.issue.code === "empty") return state;
  const { convention } = base.format;
  const trimmed = base.text.trim();
  const sign = trimmed.match(/^[+−-]/)?.[0]?.replace("−", "-") ?? "";
  const unsigned = trimmed.slice(sign.length);
  const [whole, fraction] = unsigned.split(convention.decimal);
  const normalizedWhole = unsignedDigits(whole.split(convention.group).join(""));
  const grouped = groupWhole(normalizedWhole, convention);
  const text = sign + grouped + (fraction === undefined ? "" : convention.decimal + fraction);
  const caretAtEnd = base.selection.start === base.text.length;
  const beforeCaret = base.text.slice(0, base.selection.start);
  const inFraction = beforeCaret.includes(convention.decimal);
  let caret = text.length;
  if (!caretAtEnd) {
    if (inFraction) caret = sign.length + grouped.length + 1 + beforeCaret.split(convention.decimal)[1].length;
    else {
      const leadingRemoved = whole.split(convention.group).join("").length - normalizedWhole.length;
      let remaining = Math.max(0, (beforeCaret.match(/\d/g)?.length ?? 0) - leadingRemoved);
      caret = sign.length;
      while (remaining > 0 && caret < sign.length + grouped.length) {
        if (/\d/.test(text[caret])) remaining--;
        caret++;
      }
    }
  }
  const generatedGroups = whole.includes(convention.group) ? [] : text.split("").flatMap((ch, i) => ch === convention.group ? [i] : []);
  return inspectEditor({ ...base, text, generatedGroups, selection: { start: caret, end: caret } }, typed);
}

export function createAmountEditor(format: AmountFormat, text = ""): AmountEditorState {
  return canonicalEditor({ format, text, generatedGroups: [], selection: { start: text.length, end: text.length } }, false);
}

export function editAmount(previous: AmountEditorState, edit: AmountEdit): AmountEditorState {
  const { text, format } = previous;
  const { convention } = format;
  if (edit.kind === "select") {
    const { start, end } = edit.selection;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) throw new RangeError("Invalid amount selection");
    return { ...previous, selection: edit.selection };
  }
  let { start, end } = previous.selection;
  let insertion = "";
  if (edit.kind === "decimal") {
    const at = text.indexOf(convention.decimal);
    if (at >= 0) return { ...previous, selection: { start: at + 1, end: at + 1 } };
    insertion = convention.decimal;
  } else if (edit.kind === "type" || edit.kind === "paste") {
    insertion = edit.kind === "type" ? edit.character : edit.text;
    if (edit.kind === "type" && insertion.length !== 1) throw new RangeError("Type edits require one character");
    if (edit.kind === "type" && insertion === convention.group && start === end && text[start] === convention.group && previous.generatedGroups.includes(start)) {
      return { ...previous, selection: { start: start + 1, end: start + 1 } };
    }
  } else {
    if (start === end) {
      if (edit.direction === "backward" && start > 0) {
        start--;
        if (previous.generatedGroups.includes(start) && start > 0) start--;
      } else if (edit.direction === "forward" && end < text.length) {
        end++;
        if (previous.generatedGroups.includes(start) && end < text.length) end++;
      }
    }
  }
  let next = text.slice(0, start) + insertion + text.slice(end);
  let caret = start + insertion.length;
  let generatedGroups = previous.generatedGroups.flatMap(at => at < start ? [at] : at >= end ? [at + insertion.length - (end - start)] : []);
  const digitEdit = edit.kind === "delete" || (edit.kind === "type" && /^\d$/.test(insertion)) || edit.kind === "decimal" || (edit.kind === "type" && insertion === convention.decimal);
  if (digitEdit) {
    const ungrouped = next.split("").filter((_, i) => !generatedGroups.includes(i)).join("");
    const candidate = parseAmount(ungrouped, format);
    if (candidate.kind === "parsed" || candidate.issue.code === "incomplete" || candidate.issue.code === "empty") {
      caret -= generatedGroups.filter(at => at < caret).length;
      next = ungrouped;
      generatedGroups = [];
    }
  }
  if ((edit.kind === "decimal" || (edit.kind === "type" && insertion === convention.decimal)) && /^[+−-]?[.,]$/.test(next)) {
    const at = next.length - 1;
    next = next.slice(0, at) + "0" + next.slice(at);
    caret++;
  }
  return canonicalEditor({ format, text: next, generatedGroups, selection: { start: caret, end: caret } }, edit.kind !== "paste");
}
