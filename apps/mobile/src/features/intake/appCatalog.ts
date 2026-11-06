// Presentation helpers for installed apps and accounts on the intake screens.

const BANK_WORDS = /(^|[^a-z])(bank|banco|bancolombia|davivienda|daviplata|nequi|nu|nubank|bbva|scotiabank|colpatria|itau|avvillas|popular|occidente|falabella|lulo|rappipay|movii|tarjeta|credito|credit|card|wallet|pay|finanz|financ)([^a-z]|$)/;

function plain(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Apps whose name or package suggests they send purchase alerts. */
export function likelyBankApp(source: { label: string; packageName: string }): boolean {
  return BANK_WORDS.test(plain(source.label)) || BANK_WORDS.test(plain(source.packageName));
}

/** Likely bank apps first, then everything else; each part by name. */
export function orderSources<T extends { label: string; packageName: string }>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) =>
    Number(likelyBankApp(b)) - Number(likelyBankApp(a)) || a.label.localeCompare(b.label));
}

export function appInitial(label: string): string {
  return (label.trim()[0] ?? "?").toLocaleUpperCase();
}

const KIND_LABELS: Record<string, string> = {
  cash: "Cash", bankAccount: "Bank account", savingsAccount: "Savings", creditCard: "Credit card", loan: "Loan",
};

export function productKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Account";
}

/** "America/Bogota" → "Bogota". */
export function timeZoneCity(timeZone: string): string {
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}
