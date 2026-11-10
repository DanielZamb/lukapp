import { localeTags, type Language } from "./index";

type DateInput = Date | number;

function formatter(language: Language, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(localeTags[language], options);
}

function sentenceCase(text: string, language: Language) {
  return text ? text[0]!.toLocaleUpperCase(localeTags[language]) + text.slice(1) : text;
}

/** "November" / "Noviembre". Spanish month names are lower-case mid-sentence; pass `capitalize: false` there. */
export function formatMonthName(
  language: Language,
  date: DateInput,
  options: { timeZone?: string; year?: boolean; capitalize?: boolean } = {},
): string {
  const text = formatter(language, {
    month: "long",
    year: options.year ? "numeric" : undefined,
    timeZone: options.timeZone,
  }).format(date);
  return options.capitalize === false ? text : sentenceCase(text, language);
}

function parts(language: Language, date: DateInput, month: "long" | "short", timeZone?: string) {
  const read = formatter(language, { day: "numeric", month, year: "numeric", timeZone }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => read.find((part) => part.type === type)?.value ?? "";
  return { day: pick("day"), month: pick("month").replace(/\.$/, ""), year: pick("year") };
}

/** "November 10, 2026" / "10 de noviembre de 2026". */
export function formatLongDate(language: Language, date: DateInput, timeZone?: string): string {
  const { day, month, year } = parts(language, date, "long", timeZone);
  return language === "es" ? `${day} de ${month} de ${year}` : `${month} ${day}, ${year}`;
}

/** "Nov 10" / "10 nov". */
export function formatShortDate(language: Language, date: DateInput, timeZone?: string): string {
  const { day, month } = parts(language, date, "short", timeZone);
  return language === "es" ? `${day} ${month}` : `${month} ${day}`;
}

/** "November 10" / "10 de noviembre". */
export function formatDayMonth(language: Language, date: DateInput, timeZone?: string): string {
  const { day, month } = parts(language, date, "long", timeZone);
  return language === "es" ? `${day} de ${month}` : `${month} ${day}`;
}

/** Medium date with short time, 12-hour clock in both languages as used in Colombia. */
export function formatDateTime(language: Language, date: DateInput, timeZone?: string): string {
  return formatter(language, {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone,
  }).format(date);
}

export function formatCompactNumber(language: Language, value: number): string {
  return new Intl.NumberFormat(localeTags[language], {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}
