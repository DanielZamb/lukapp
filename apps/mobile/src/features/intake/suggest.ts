// A lenient, span-based suggestion for one notification.
//
// The native parser (GenericNotificationParser.kt) fails closed: anything it
// cannot prove becomes "no amount", and a security-ish word discards the whole
// notification. This engine does the opposite. It never rejects: it lists every
// money mention it can read, ranks them, and points at where each suggestion
// came from in the text so the person can see and correct it. The person always
// starts from the notification itself; the suggestion only pre-fills.

export type Currency = "COP" | "USD";
export type Direction = "in" | "out";
export type Span = { start: number; end: number };
export type Mention = Span & {
  raw: string;
  minor: number;
  currency: Currency | null;
  role: "charge" | "balance" | "other";
};
export type Found<T> = Span & { value: T };
export type Suggestion = {
  /** Title and body joined by a newline; every span points into this. */
  text: string;
  titleLength: number;
  /** Looks like a one-time code. The UI hides the text until asked. */
  sensitive: Span | null;
  /** Every amount, best first. */
  amounts: Mention[];
  amount: Mention | null;
  direction: Found<Direction> | null;
  counterparty: Found<string> | null;
  when: Found<string> | null;
  confidence: "ready" | "check" | "manual";
  notes: string[];
};

const CURRENCY_BEFORE = String.raw`(?:(COP|USD|US\$)\s?\$?\s?|(\$)\s?)`;
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const CURRENCY_AFTER = String.raw`(?:\s?(COP|USD|pesos|d[oó]lares))?`;
const MONEY = new RegExp(`${CURRENCY_BEFORE}${NUMBER}${CURRENCY_AFTER}|${NUMBER}\\s?(COP|USD|pesos|d[oó]lares)\\b`, "gi");

const BALANCE_CONTEXT = /(saldo|disponible|cupo|balance|available|deuda|adeudad[oa])[^.\n$]{0,24}$/i;
const CHARGE_CONTEXT = /(compr|pag|retir|transf|envi|recib|abon|consign|dep[oó]sit|revers|devoluci|reembols|cargo|d[eé]bito|purchase|paid|sent|received|spent|por|of)[^.\n$]{0,24}$/i;

// JavaScript's \b only knows ASCII letters, so accented endings ("envió",
// "devolución") need Unicode-aware boundaries.
const words = (alternatives: string, flags = "giu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, flags);
const REVERSAL = words("reverso|reversi[oó]n|devoluci[oó]n|reembolso|refund");
const OUT = words("compraste|compra|pagaste|pag[oó]|pago|retiraste|retiro|transferiste|enviaste|env[ií]o|d[eé]bito|cargo|purchase|paid|payment|spent|sent|withdrawal");
const IN = words("recibiste|recibido|recibida|te envi[oó]|te enviaron|te lleg[oó]|te llegaron|abono|consignaci[oó]n|dep[oó]sito|received|deposit|credited");

const SECURITY_WORDS = words("otp|clave din[aá]mica|c[oó]digo|token|contrase[nñ]a|passcode|verification code|one[- ]time", "iu");
const STANDALONE_CODE = /(?<![\d*.,$])\b\d{4,8}\b(?![.,]\d)/g;

const COUNTERPARTY_LEAD = /\s(?:en|a|de|at|para|from|to)\s+/gi;
const COUNTERPARTY_STOP = /\s+(?:con|el|desde|por|en|via|vía|a las|on|fue|ha sido)\b|[,;:!?\n]|\.(?:\s|$)|\s[·|–-]\s|$/i;
const NOT_A_COUNTERPARTY = new RegExp(`\\*\\d|${words("cuenta|tarjeta|cr[eé]dito|d[eé]bito|ahorros|tu|su|mi", "iu").source}`, "iu");
const SENDER_BEFORE = /(?:^|[.!¡\n]\s*)([^.!¡\n$]{2,40}?)\s+te\s+envi(?:[oó]|aron)(?![\p{L}])/iu;
const SEPARATED = /^\s*[·|–-]\s*([^\n]{2,40})/;

const DATE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})(?:\s*(?:a las\s*)?\d{1,2}:\d{2})?/i;

function toMinor(raw: string): number | null {
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let whole = raw;
  let fraction = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const at = Math.max(lastDot, lastComma);
    whole = raw.slice(0, at); fraction = raw.slice(at + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = raw.split(separator);
    // One separator followed by exactly three digits groups thousands
    // ("$45.900", "$45,900"); one or two digits is a decimal ("12.99").
    if (parts.length === 2 && (parts[1] ?? "").length <= 2) { whole = parts[0] ?? ""; fraction = parts[1] ?? ""; }
  }
  const digits = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits) || !/^\d{0,2}$/.test(fraction)) return null;
  const minor = Number(digits) * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function currencyOf(...markers: (string | undefined)[]): Currency | null {
  for (const marker of markers) {
    const value = marker?.toUpperCase();
    if (value === "COP" || value === "PESOS") return "COP";
    if (value === "USD" || value === "US$" || value === "DOLARES" || value === "DÓLARES") return "USD";
  }
  return null;
}

function mentions(text: string): Mention[] {
  const found: Mention[] = [];
  for (const match of text.matchAll(MONEY)) {
    const [raw, codeBefore, dollar, number, codeAfter, bareNumber, bareCode] = match;
    const value = number ?? bareNumber;
    if (!value || (!codeBefore && !dollar && !bareCode)) continue;
    const start = match.index ?? 0;
    const previous = text[start - 1];
    if (previous && /[\d*]/.test(previous)) continue;
    const minor = toMinor(value);
    if (minor === null) continue;
    const before = text.slice(Math.max(0, start - 40), start);
    const role = BALANCE_CONTEXT.test(before) ? "balance" : CHARGE_CONTEXT.test(before) ? "charge" : "other";
    found.push({ start, end: start + raw.trimEnd().length, raw: raw.trimEnd(), minor, currency: currencyOf(codeBefore, codeAfter, bareCode), role });
  }
  const rank = { charge: 0, other: 1, balance: 2 } as const;
  return found.sort((a, b) => rank[a.role] - rank[b.role] || a.start - b.start);
}

function sensitiveSpan(text: string, money: Mention[]): Span | null {
  const word = SECURITY_WORDS.exec(text);
  if (!word) return null;
  for (const code of text.matchAll(STANDALONE_CODE)) {
    const start = code.index ?? 0;
    const end = start + code[0].length;
    if (money.some((mention) => start < mention.end && end > mention.start)) continue;
    if (Math.abs(start - word.index) <= 48) return { start: Math.min(start, word.index), end: Math.max(end, word.index + word[0].length) };
  }
  return null;
}

function nearest(text: string, pattern: RegExp, before: number): Span & { word: string } | null {
  let best: (Span & { word: string }) | null = null;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const candidate = { start, end: start + match[0].length, word: match[0] };
    if (!best) { best = candidate; continue; }
    const distance = (span: Span) => span.start <= before ? before - span.start : 1000 + span.start - before;
    if (distance(candidate) < distance(best)) best = candidate;
  }
  return best;
}

function directionOf(text: string, amount: Mention | null): Found<Direction> | null {
  const at = amount?.start ?? text.length;
  // A sign written right before the amount ("-$23.400") is the clearest signal.
  const sign = amount && /[-−+]\s?$/.exec(text.slice(Math.max(0, amount.start - 2), amount.start));
  if (amount && sign) return { start: amount.start - sign[0].length, end: amount.start - sign[0].length + 1, value: sign[0].trim() === "+" ? "in" : "out" };
  const reversal = nearest(text, REVERSAL, at);
  if (reversal) return { ...reversal, value: "in" };
  const out = nearest(text, OUT, at);
  const into = nearest(text, IN, at);
  const pick = !out ? into && { ...into, value: "in" as const }
    : !into ? { ...out, value: "out" as const }
    : (Math.abs(at - into.start) < Math.abs(at - out.start) ? { ...into, value: "in" as const } : { ...out, value: "out" as const });
  return pick ? { start: pick.start, end: pick.end, value: pick.value } : null;
}

function trimName(text: string, start: number, end: number): Found<string> | null {
  let value = text.slice(start, end);
  const article = /^(?:el|la|los|las)\s+/i.exec(value);
  if (article) { start += article[0].length; value = value.slice(article[0].length); }
  const trailing = value.length - value.trimEnd().length;
  value = value.trim();
  if (value.length < 2 || value.length > 48 || /^\d/.test(value) || NOT_A_COUNTERPARTY.test(value)) return null;
  return { start, end: end - trailing, value };
}

function counterpartyOf(text: string, amount: Mention | null): Found<string> | null {
  const sender = SENDER_BEFORE.exec(text);
  if (sender?.[1]) {
    const start = (sender.index ?? 0) + sender[0].indexOf(sender[1]);
    const name = trimName(text, start, start + sender[1].length);
    if (name) return name;
  }
  if (!amount) return null;
  const tail = text.slice(amount.end);
  const separated = SEPARATED.exec(tail);
  if (separated?.[1]) {
    const start = amount.end + separated[0].indexOf(separated[1]);
    const name = trimName(text, start, start + separated[1].length);
    if (name) return name;
  }
  for (const lead of tail.matchAll(COUNTERPARTY_LEAD)) {
    const start = amount.end + (lead.index ?? 0) + lead[0].length;
    const rest = text.slice(start);
    const stop = COUNTERPARTY_STOP.exec(rest.slice(1));
    const end = start + 1 + (stop?.index ?? rest.length - 1);
    const name = trimName(text, start, end);
    if (name) return name;
    if (lead.index !== undefined && lead.index > 80) break;
  }
  return null;
}

export function suggest(input: { title?: string | null; text: string }): Suggestion {
  const title = input.title?.trim() ?? "";
  const body = input.text.trim();
  const text = title && !body.startsWith(title) ? `${title}\n${body}` : body;
  const titleLength = title && !body.startsWith(title) ? title.length : 0;
  const amounts = mentions(text);
  const sensitive = sensitiveSpan(text, amounts);
  const notes: string[] = [];
  if (sensitive) {
    return { text, titleLength, sensitive, amounts: [], amount: null, direction: null, counterparty: null, when: null,
      confidence: "manual", notes: ["Looks like a security code. Nothing is suggested."] };
  }
  const amount = amounts[0] ?? null;
  const direction = directionOf(text, amount);
  const counterparty = counterpartyOf(text, amount);
  const date = DATE.exec(text);
  const when = date ? { start: date.index, end: date.index + date[0].length, value: date[0] } : null;
  if (!amount) notes.push("No amount found. Enter it yourself.");
  const others = amounts.slice(1);
  const balances = others.filter((mention) => mention.role === "balance");
  if (balances.length) notes.push(`Also shows a balance (${balances.map((mention) => mention.raw).join(", ")}). Not used.`);
  const competing = others.filter((mention) => mention.role !== "balance");
  if (competing.length) notes.push(`${competing.length + 1} amounts. Tap the right one.`);
  if (amount && !direction) notes.push("Couldn't tell money in from money out.");
  const confidence = !amount ? "manual" : direction && !competing.length ? "ready" : "check";
  return { text, titleLength, sensitive: null, amounts, amount, direction, counterparty, when, confidence, notes };
}

/** Text pieces in order, each tagged with what it suggests, for highlighting. */
export type Piece = { text: string; start: number; kind: "plain" | "amount" | "balance" | "direction" | "counterparty" | "when"; mention?: Mention };
export function pieces(suggestion: Suggestion, chosen: Mention | null = suggestion.amount): Piece[] {
  const marks: (Span & { kind: Piece["kind"]; mention?: Mention })[] = [
    ...suggestion.amounts.map((mention) => ({ start: mention.start, end: mention.end, mention,
      kind: (mention === chosen ? "amount" : "balance") as Piece["kind"] })),
    ...(suggestion.direction ? [{ ...suggestion.direction, kind: "direction" as const }] : []),
    ...(suggestion.counterparty ? [{ ...suggestion.counterparty, kind: "counterparty" as const }] : []),
    ...(suggestion.when ? [{ ...suggestion.when, kind: "when" as const }] : []),
  ].sort((a, b) => a.start - b.start);
  const result: Piece[] = [];
  let at = 0;
  for (const mark of marks) {
    if (mark.start < at) continue;
    if (mark.start > at) result.push({ text: suggestion.text.slice(at, mark.start), start: at, kind: "plain" });
    result.push({ text: suggestion.text.slice(mark.start, mark.end), start: mark.start, kind: mark.kind, mention: mark.mention });
    at = mark.end;
  }
  if (at < suggestion.text.length) result.push({ text: suggestion.text.slice(at), start: at, kind: "plain" });
  return result;
}
