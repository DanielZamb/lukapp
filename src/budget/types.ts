export type BudgetRevision = {
  id: string;
  workspaceId: string;
  categoryId: string;
  effectiveMonth: string;
  limitMinorUnits: number;
  expectedRevisionId: string | null;
  sequence: number;
  idempotencyKey: string;
  createdBy: string;
  createdAt: number;
};

export type SetCategoryLimit = {
  workspaceId: string;
  categoryId: string;
  effectiveMonth: string;
  limit: { currency: string; minorUnits: number };
  expectedRevisionId: string | null;
  idempotencyKey: string;
};

export type BudgetCategory = {
  id: string;
  name: string;
  emoji: string;
  nature?: "Expense" | "Income";
};

export type BudgetReadStore = {
  functionalCurrency: () => Promise<string>;
  timeZone: () => Promise<string>;
  listRevisions: () => Promise<BudgetRevision[]>;
  listCategories: () => Promise<BudgetCategory[]>;
  categoryConsumption: (month: string) => Promise<{
    categories: { categoryId: string; minorUnits: number }[];
  }>;
};

export type BudgetWriteStore = BudgetReadStore & {
  findRequest: (key: string) => Promise<BudgetRevision | null>;
  insertRevision: (revision: Omit<BudgetRevision, "id">) => Promise<BudgetRevision>;
};
