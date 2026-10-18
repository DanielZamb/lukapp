// PROTOTYPE — August 2026 fixtures for SEN-17, taken from USER_FK=1
// NORMAL rows in the personal ledger. Dual tags are the planning layer
// the export does not have. In-memory only.

import type { CategoryLook } from "./first-time-setup";

export type ParentMatch = "direct" | "descendants";

export type PlanBudget = {
  id: string;
  name: string;
  targets: string[];
  limit: number;
};

export type PlanExpense = {
  id: string;
  description: string;
  amount: number;
  categories: string[];
  linkedReimbursement?: number;
};

export type BudgetGroup = {
  parent: string;
  children: string[];
};

export type PeriodRow = {
  id: string;
  name: string;
  targets: string[];
  limit: number;
  consumed: number;
  remaining: number;
  ratio: number;
  alerts: number[];
};

export const PLAN_MONTH = "August";
export const PLAN_YEAR = 2026;

export const planLooks: Record<string, CategoryLook> = {
  Tenis: { emoji: "🎾", color: "h150" },
  Gusticos: { emoji: "⚜️", color: "h45" },
  Entretenimiento: { emoji: "🎬", color: "h180" },
  Scooter: { emoji: "🛴", color: "h210" },
  Comida: { emoji: "🍔", color: "h30" },
  Mercado: { emoji: "🛒", color: "h150" },
  Viaje: { emoji: "✈️", color: "h195" },
  Tech: { emoji: "🖥️", color: "h270" },
  Ropa: { emoji: "👔", color: "h30" },
  "Lumpy Discretionary": { emoji: "⚡", color: "h45" },
  "Comida y Mercado": { emoji: "🍔", color: "h30" },
};

export const planGroups: BudgetGroup[] = [
  {
    parent: "Lumpy Discretionary",
    children: [
      "Tenis",
      "Entretenimiento",
      "Gusticos",
      "Scooter",
      "Tech",
      "Viaje",
      "Ropa",
    ],
  },
];

export const seedBudgets: PlanBudget[] = [
  {
    id: "lumpy",
    name: "Lumpy Discretionary",
    targets: ["Lumpy Discretionary"],
    limit: 900_000,
  },
  {
    id: "tennis",
    name: "Tenis",
    targets: ["Tenis"],
    limit: 400_000,
  },
  {
    id: "food",
    name: "Comida y Mercado",
    targets: ["Comida", "Mercado"],
    limit: 2_500_000,
  },
];

// USER_FK=1, NORMAL outflows, August 2026 unless noted. Dual tags are the
// planning layer the ledger does not have yet: purpose from CATEGORY, plus
// Lumpy Discretionary on the one-off nights out.
export const seedExpenses: PlanExpense[] = [
  {
    id: "mangas",
    description: "Mangas en Panini",
    amount: 359_961,
    categories: ["Entretenimiento", "Lumpy Discretionary"],
  },
  {
    id: "spiderman",
    description: "Boletas Spiderman",
    amount: 186_100,
    categories: ["Entretenimiento", "Lumpy Discretionary"],
  },
  {
    id: "torneo",
    description: "Torneo de tenis agosto",
    amount: 160_000,
    categories: ["Tenis"],
  },
  {
    id: "cancha",
    description: "Cancha del viernes",
    amount: 11_900,
    categories: ["Tenis"],
  },
  {
    id: "scooter",
    description: "Mantenimiento scooter",
    amount: 218_500,
    categories: ["Scooter"],
  },
  {
    id: "comida-aug",
    description: "Comida, 18 purchases",
    amount: 1_212_165,
    categories: ["Comida"],
  },
  {
    id: "mercado-aug",
    description: "Mercado, 9 purchases",
    amount: 874_959,
    categories: ["Mercado"],
  },
];

export const postCandidates: PlanExpense[] = [
  {
    id: "curso",
    description: "Curso de tenis septiembre",
    amount: 291_500,
    categories: ["Tenis"],
  },
  {
    id: "reykon",
    description: "Boletas Reykon",
    amount: 622_200,
    categories: ["Gusticos", "Entretenimiento", "Lumpy Discretionary"],
    linkedReimbursement: 420_400,
  },
];

export const targetPool = [
  "Lumpy Discretionary",
  "Tenis",
  "Gusticos",
  "Entretenimiento",
  "Scooter",
  "Comida",
  "Mercado",
  "Viaje",
] as const;

export const julyClosed = {
  month: "July",
  name: "Tenis",
  spent: 2_824_500,
  highlight: {
    description: "Raqueta Wilson Prostaff",
    amount: 1_950_000,
  },
};

export const proposedNext: PlanExpense = {
  id: "next-panini",
  description: "Otra ida a Panini",
  amount: 359_961,
  categories: ["Entretenimiento", "Lumpy Discretionary"],
};

export function crossedBy(
  current: PeriodRow[],
  next: PeriodRow[],
) {
  return next.filter((row) => {
    const before = current.find((item) => item.id === row.id);
    const wasOk = !before || before.remaining >= 0;
    return row.remaining < 0 && wasOk;
  });
}

export const ALERT_MARKS = [30, 50, 80, 100] as const;

function childrenOf(parent: string, groups: BudgetGroup[]) {
  return groups.find((group) => group.parent === parent)?.children ?? [];
}

export function expenseHits(
  expense: PlanExpense,
  budget: PlanBudget,
  match: ParentMatch,
  groups: BudgetGroup[] = planGroups,
) {
  const assigned = new Set(expense.categories);
  return budget.targets.some((target) => {
    if (assigned.has(target)) {
      return true;
    }
    if (match === "descendants") {
      return childrenOf(target, groups).some((child) => assigned.has(child));
    }
    return false;
  });
}

export function netAmount(expense: PlanExpense) {
  return Math.max(0, expense.amount - (expense.linkedReimbursement ?? 0));
}

export function consume(
  budget: PlanBudget,
  expenses: PlanExpense[],
  match: ParentMatch,
) {
  return expenses.reduce((sum, expense) => {
    if (!expenseHits(expense, budget, match)) {
      return sum;
    }
    return sum + netAmount(expense);
  }, 0);
}

export function periodRows(
  budgets: PlanBudget[],
  expenses: PlanExpense[],
  match: ParentMatch,
): PeriodRow[] {
  return budgets.map((budget) => {
    const consumed = consume(budget, expenses, match);
    const remaining = budget.limit - consumed;
    const ratio = budget.limit > 0 ? consumed / budget.limit : 0;
    return {
      id: budget.id,
      name: budget.name,
      targets: budget.targets,
      limit: budget.limit,
      consumed,
      remaining,
      ratio,
      alerts: ALERT_MARKS.filter((mark) => ratio * 100 >= mark),
    };
  });
}

export function nextAction(rows: PeriodRow[]) {
  const over = [...rows]
    .filter((row) => row.remaining < 0)
    .sort((left, right) => left.remaining - right.remaining);
  if (over[0]) {
    return {
      id: over[0].id,
      label: `Open ${over[0].name}`,
      detail: `${compactCop(-over[0].remaining)} over the August limit`,
    };
  }
  const hot = [...rows]
    .filter((row) => row.ratio >= 0.8)
    .sort((left, right) => right.ratio - left.ratio);
  if (hot[0]) {
    return {
      id: hot[0].id,
      label: `${hot[0].name} hit 80%`,
      detail: "Change this month's limit, or leave it",
    };
  }
  if (rows.length === 0) {
    return {
      id: undefined,
      label: "Set an August limit",
      detail: "A budget is a jar for this month. It does not post.",
    };
  }
  return {
    id: rows[0]?.id,
    label: "Change August's limit",
    detail: "Edits this period only. Earlier months stay as they were.",
  };
}

export function compactCop(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const body =
      millions >= 10 || millions % 1 === 0
        ? millions.toFixed(0)
        : Math.round(millions * 100) % 10 === 0
          ? millions.toFixed(1)
          : millions.toFixed(2);
    return `${sign}${body}M`;
  }
  if (abs >= 1000) {
    const thousands = abs / 1000;
    const body =
      thousands >= 10 || thousands % 1 === 0
        ? thousands.toFixed(0)
        : thousands.toFixed(1);
    return `${sign}${body}K`;
  }
  return `${sign}${abs}`;
}

export function assignTag(current: string[], next: string) {
  if (current.includes(next)) {
    return { ok: true as const, categories: current.filter((item) => item !== next) };
  }
  if (current.length >= 3) {
    return { ok: false as const, reason: "fourth" as const };
  }
  return { ok: true as const, categories: [...current, next] };
}
