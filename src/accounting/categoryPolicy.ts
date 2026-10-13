import { chartTemplate } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import type { AccountResolution, CategoryNature, NatureAnswer } from "./categoryTypes";

export const categoryPolicy = "category-es-en@1";
export const categoryPresets = [
  { concept: "groceries", nature: "Expense", aliases: ["mercado", "groceries", "supermercado"], co: "51959501", us: "5310" },
  { concept: "restaurants", nature: "Expense", aliases: ["restaurante", "restaurant", "cafe", "coffee"], co: "519560", us: "5320" },
  { concept: "fuel", nature: "Expense", aliases: ["gasolina", "fuel", "gasoline"], co: "519535", us: "5210" },
  { concept: "rentPaid", nature: "Expense", aliases: ["arriendo", "rent", "alquiler"], co: "512010", us: "5010" },
  { concept: "rentReceived", nature: "Income", aliases: ["arriendo", "rent", "alquiler"], co: "42201001", us: "4210" },
  { concept: "salary", nature: "Income", aliases: ["salario", "sueldo", "salary", "wages"], co: "42959501", us: "4010" },
  { concept: "interestPaid", nature: "Expense", aliases: ["intereses", "interest"], co: "530520", us: "6030" },
  { concept: "interestReceived", nature: "Income", aliases: ["intereses", "interest"], co: "421005", us: "4110" },
  { concept: "lifeInsurance", nature: "Expense", aliases: ["seguro", "seguro de vida", "life insurance"], co: "513020", us: "5410" },
  { concept: "vehicleInsurance", nature: "Expense", aliases: ["seguro", "seguro de vehiculo", "car insurance"], co: "513040", us: "5420" },
  { concept: "health", nature: "Expense", aliases: ["salud", "health", "medicina"], co: "51959502", us: "5510" },
  { concept: "transport", nature: "Expense", aliases: ["taxi", "bus", "transporte", "transit"], co: "519545", us: "5220" },
  { concept: "education", nature: "Expense", aliases: ["educacion", "education"], co: "51959505", us: "5540" },
  { concept: "entertainment", nature: "Expense", aliases: ["entretenimiento", "entertainment", "ocio"], co: "51959507", us: "5560" },
] satisfies Array<{ concept: string; nature: CategoryNature; aliases: string[]; co: string; us: string }>;

export function normalizeCategoryName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(
      (next[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1,
      (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
    );
    previous = next;
  }
  return previous[b.length] ?? a.length;
}

function matches(name: string, aliases: string[]): number {
  const normalized = normalizeCategoryName(name);
  return Math.min(...aliases.map(alias => {
    const d = distance(normalized, alias);
    return d === 0 || (normalized.length >= 4 && alias.length >= 4 && d <= 1) ? d : Infinity;
  }));
}

export function suggestCategoryNature(name: string) {
  const candidates: Array<{ answer: NatureAnswer; distance: number }> = categoryPresets.map(p => ({ answer: p.nature, distance: matches(name, p.aliases) }));
  candidates.push(
    { answer: "stillMine", distance: matches(name, ["ahorro", "savings", "inversion", "investment", "prestamo a una persona"]) },
    { answer: "payingDebt", distance: matches(name, ["pago tarjeta", "card payment", "deuda", "debt payment"]) },
  );
  const normalized = normalizeCategoryName(name);
  if (/^(prestamo a |loan to )/.test(normalized)) candidates.push({ answer: "stillMine", distance: 0 });
  if (/^(deuda con |debt to )/.test(normalized)) candidates.push({ answer: "payingDebt", distance: 0 });
  const best = Math.min(...candidates.map(c => c.distance));
  return { policy: categoryPolicy, suggestions: Number.isFinite(best) ? [...new Set(candidates.filter(c => c.distance === best).map(c => c.answer))].sort() : [], requiresConfirmation: true as const };
}

export function assertCategoryAccount(templateVersion: string, nature: CategoryNature, code: string): void {
  const account = chartTemplate(templateVersion).accounts.find(a => a.code === code);
  if (!account) throw new AccountingError("ledger_account_code_unknown");
  if (account.use !== (nature === "Expense" ? "expense" : "income"))
    throw new AccountingError(nature === "Expense" ? "cash_expense_account_invalid" : "cash_income_account_invalid");
}

function presetAccount(templateVersion: string, preset: typeof categoryPresets[number]): string {
  const code = templateVersion === "co-puc-personal@1" ? preset.co : templateVersion === "us-gaap-personal@1" ? preset.us : undefined;
  if (!code) throw new AccountingError("chart_of_accounts_template_unknown");
  assertCategoryAccount(templateVersion, preset.nature, code);
  return code;
}

export function resolveCategoryAccount(templateVersion: string, name: string, nature: CategoryNature): AccountResolution {
  const candidates = categoryPresets.filter(p => p.nature === nature).map(p => ({ preset: p, distance: matches(name, p.aliases) }));
  const best = Math.min(...candidates.map(c => c.distance));
  const winners = candidates.filter(c => Number.isFinite(best) && c.distance === best).map(c => c.preset).sort((a, b) => a.concept.localeCompare(b.concept));
  const winner = winners.length === 1 ? winners[0] : undefined;
  if (winner) return { kind: "lexicon", concept: winner.concept, policy: categoryPolicy, accountCode: presetAccount(templateVersion, winner) };
  const template = chartTemplate(templateVersion);
  return { kind: "fallback", policy: categoryPolicy, accountCode: template.defaults[nature === "Expense" ? "expense" : "income"], candidates: winners.map(p => p.concept) };
}

export function resolvePreset(templateVersion: string, concept: string) {
  const preset = categoryPresets.find(p => p.concept === concept);
  if (!preset) throw new AccountingError("category_preset_unknown");
  return { kind: "resolved" as const, nature: preset.nature, natureProvenance: { kind: "preset" as const, concept },
    account: { kind: "preset" as const, concept, policy: categoryPolicy, accountCode: presetAccount(templateVersion, preset) } };
}
