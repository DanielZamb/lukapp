import { chartTemplate } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import type { CategoryNature, NatureAnswer } from "./types";

export const categoryPolicyVersion = "category-es-en@1";
const concept = (
  id: string,
  name: string,
  nature: CategoryNature,
  co: string,
  us: string,
  aliases: string[],
) => ({
  id,
  name,
  nature,
  accounts: { "co-puc-personal@1": co, "us-gaap-personal@1": us },
  aliases,
});

const concepts = [
  concept("groceries", "Food", "Expense", "51959501", "5310", [
    "food",
    "groceries",
    "mercado",
    "alimentos",
  ]),
  concept("dining", "Dining", "Expense", "519560", "5320", [
    "dining",
    "restaurant",
    "restaurante",
    "cafe",
    "coffee",
  ]),
  concept("transport", "Transport", "Expense", "519545", "5220", [
    "transport",
    "transporte",
    "taxi",
    "bus",
  ]),
  concept("health", "Health", "Expense", "51959502", "5510", [
    "health",
    "salud",
    "medicina",
    "farmacia",
  ]),
  concept("rent", "Home rent", "Expense", "512010", "5010", [
    "rent",
    "arriendo",
    "alquiler",
  ]),
  concept("education", "Education", "Expense", "51959505", "5540", [
    "education",
    "educacion",
    "colegio",
  ]),
  concept("clothing", "Clothing", "Expense", "51959504", "5530", [
    "clothing",
    "ropa",
    "zapatos",
  ]),
  concept("entertainment", "Entertainment", "Expense", "51959507", "5560", [
    "entertainment",
    "entretenimiento",
    "cine",
  ]),
  concept("pets", "Pets", "Expense", "51959509", "5580", [
    "pets",
    "mascotas",
    "veterinario",
  ]),
  concept("digital", "Subscriptions", "Expense", "51359501", "5150", [
    "subscriptions",
    "suscripciones",
    "netflix",
    "software",
  ]),
  concept("fuel", "Fuel", "Expense", "519535", "5210", [
    "fuel",
    "gasolina",
    "combustible",
  ]),
  concept("salary", "Salary", "Income", "42959501", "4010", [
    "salary",
    "salario",
    "nomina",
  ]),
  concept("freelance", "Freelance", "Income", "423005", "4030", [
    "freelance",
    "honorarios",
    "consulting",
  ]),
  concept("rentalIncome", "Rental income", "Income", "42201001", "4210", [
    "rent",
    "arriendo",
    "alquiler",
  ]),
  concept("gifts", "Gifts received", "Income", "42959502", "4920", [
    "gift",
    "gifts",
    "regalo",
    "regalos",
  ]),
];
const doors: Array<{ answer: NatureAnswer; aliases: string[] }> = [
  {
    answer: "stillMine",
    aliases: [
      "savings",
      "ahorro",
      "ahorros",
      "investment",
      "inversion",
      "prestamo otorgado",
      "money i lent",
    ],
  },
  {
    answer: "payDebt",
    aliases: [
      "credit card",
      "pago tarjeta",
      "debt",
      "deuda",
      "loan payment",
      "pago prestamo",
    ],
  },
];

export function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(
        Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)),
      );
    }
    row = next;
  }
  return row[b.length];
}

function score(name: string, aliases: string[]): number {
  const normalized = normalizeCategoryName(name);
  return Math.min(
    ...aliases.map((alias) => {
      if (normalized === alias) return 0;
      if (normalized.length < 4 || alias.length < 4) return Infinity;
      const d = distance(normalized, alias);
      return d <= 1 ? d : Infinity;
    }),
  );
}

function matches(name: string, nature?: CategoryNature) {
  const ranked = concepts
    .filter((c) => !nature || c.nature === nature)
    .map((c) => ({ concept: c, score: score(name, c.aliases) }));
  const best = Math.min(...ranked.map((c) => c.score));
  return ranked
    .filter((c) => Number.isFinite(c.score) && c.score === best)
    .map((c) => c.concept);
}

export function suggestCategoryNature(name: string, direction?: "out" | "in") {
  const allowed: NatureAnswer[] =
    direction === "out"
      ? ["spend", "stillMine", "payDebt"]
      : direction === "in"
        ? ["receive", "stillMine", "payDebt"]
        : ["spend", "receive", "stillMine", "payDebt"];
  const candidates: Array<{ answer: NatureAnswer; score: number }> = [
    ...matches(name).map((c): { answer: NatureAnswer; score: number } => ({
      answer: c.nature === "Expense" ? "spend" : "receive",
      score: score(name, c.aliases),
    })),
    ...doors.map((d) => ({ answer: d.answer, score: score(name, d.aliases) })),
  ].filter((c) => allowed.includes(c.answer) && Number.isFinite(c.score));
  const best = Math.min(...candidates.map((c) => c.score));
  const answers = [
    ...new Set(candidates.filter((c) => c.score === best).map((c) => c.answer)),
  ];
  return {
    version: categoryPolicyVersion,
    allowed,
    suggested: answers.length === 1 ? answers[0] : null,
  };
}

export function listCategoryPresets(nature?: CategoryNature) {
  return concepts
    .filter((c) => !nature || c.nature === nature)
    .map(({ id, name, nature }) => ({ id, name, nature }));
}

export function requireCategoryPreset(id: string) {
  const preset = concepts.find((c) => c.id === id);
  if (!preset) throw new AccountingError("category_preset_unknown");
  return preset;
}

export function resolveCategoryAccount(
  name: string,
  nature: CategoryNature,
  templateVersion: string,
) {
  const found = matches(name, nature);
  const match = found.length === 1 ? found[0] : undefined;
  const template = chartTemplate(templateVersion);
  return {
    code: match
      ? accountForConcept(match.id, templateVersion)
      : template.defaults[nature === "Expense" ? "expense" : "income"],
    concept: match?.id,
  };
}

export function accountForConcept(id: string, templateVersion: string): string {
  const preset = requireCategoryPreset(id);
  const code = Object.entries(preset.accounts).find(
    ([version]) => version === templateVersion,
  )?.[1];
  if (!code) throw new AccountingError("chart_of_accounts_template_unknown");
  return code;
}
