import type { Actor, Money, SetupFinancialAccountInput } from "./types";

export type CategoryNature = "Expense" | "Income";
export type NatureAnswer = CategoryNature | "stillMine" | "payingDebt";
export type AccountResolution =
  | { kind: "preset"; concept: string; policy: string; accountCode: string }
  | { kind: "lexicon"; concept: string; policy: string; accountCode: string }
  | { kind: "fallback"; policy: string; accountCode: string; candidates: string[] }
  | { kind: "advanced"; accountCode: string };
export type NatureProvenance =
  | { kind: "preset"; concept: string }
  | { kind: "answered" }
  | { kind: "lexiconConfirmed"; policy: string; answer: NatureAnswer };
export type CategoryClassification = {
  kind: "resolved";
  nature: CategoryNature;
  natureProvenance: NatureProvenance;
  account: AccountResolution;
} | { kind: "unresolved" } | { kind: "converted"; financialAccountProfileId: string };
export type UserCategory = {
  id: string;
  workspaceId: string;
  name: string;
  revision: number;
  status: "active" | "archived";
  mergedIntoCategoryId?: string;
  classification: CategoryClassification;
};
export type CategorySnapshot = {
  categoryId: string;
  revision: number;
  name: string;
  nature: CategoryNature;
  natureProvenance: NatureProvenance;
  account: AccountResolution;
};
export type CorrectionSource = { entryId: string; lineNumber: number; signedMinorUnits: number };
export type CategoryCorrection = {
  reclassificationKey: string;
  side: "reversing" | "replacement";
  sources: CorrectionSource[];
  rootSources: CorrectionSource[];
  priorLockedPeriods: string[];
};
export type CategorySelection = { kind: "preset"; concept: string } |
  { kind: "custom"; answer: NatureAnswer; confirmation: "answered" | "lexiconConfirmed" };
export type CategoryScope = { actor: Actor; workspaceId: string };
export type CreateCategoryInput = CategoryScope & {
  name: string; selection: CategorySelection; idempotencyKey: string;
};
export type CategoryCreation = { kind: "category"; category: UserCategory; replay: boolean } |
  { kind: "profileRequired"; answer: "stillMine" | "payingDebt" };
export type CategoryChange = { kind: "rename"; name: string } | { kind: "archive" } |
  { kind: "merge"; targetCategoryId: string } | { kind: "defaultAccount"; accountCode: string };
export type ChangeCategoryInput = CategoryScope & {
  categoryId: string; revision: number; confirmed: true; change: CategoryChange; idempotencyKey: string;
};
export type ReclassificationTarget = {
  kind: "category"; nature: CategoryNature; accountCode: string;
} | { kind: "profile"; setup: Omit<SetupFinancialAccountInput, "actor" | "workspaceId" | "idempotencyKey"> };
export type ReclassificationInput = CategoryScope & {
  categoryId: string; target: ReclassificationTarget; currentDate: string;
};
export type ReclassificationBucket = {
  accountingDate: string;
  ledgerAccountId: string;
  signedMinorUnits: number;
  sources: CorrectionSource[];
  rootSources: CorrectionSource[];
  priorLockedPeriods: string[];
  snapshot: CategorySnapshot;
};
export type ReclassificationPreview = {
  categoryId: string;
  categoryRevision: number;
  revisionToken: string;
  entryCount: number;
  lineCount: number;
  amount: Money;
  lockedEntryCount: number;
  lockedAmount: Money;
  correctionDates: string[];
  buckets: ReclassificationBucket[];
};
export type ConfirmReclassificationInput = ReclassificationInput & {
  revisionToken: string; confirmed: true; idempotencyKey: string;
};
export type CategoryReceipt = {
  workspaceId: string;
  idempotencyKey: string;
  request: string;
  category: UserCategory;
  correctionEntryIds: string[];
  financialAccountProfileId?: string;
};
export type ReclassificationResult = Omit<CategoryReceipt, "workspaceId" | "idempotencyKey" | "request"> & { replay: boolean };
export type CategoryStore = {
  getCategory(id: string): Promise<UserCategory | undefined>;
  listCategories(workspaceId: string): Promise<UserCategory[]>;
  insertCategory(category: Omit<UserCategory, "id">): Promise<UserCategory>;
  saveCategory(category: UserCategory): Promise<void>;
  getCategoryReceipt(workspaceId: string, key: string): Promise<CategoryReceipt | undefined>;
  saveCategoryReceipt(receipt: CategoryReceipt): Promise<void>;
};
export type CategoryCore = {
  createUserCategory(input: CreateCategoryInput): Promise<CategoryCreation>;
  suggestCategoryNature(input: CategoryScope & { name: string }): Promise<{ policy: string; suggestions: NatureAnswer[]; requiresConfirmation: true }>;
  listUserCategories(input: CategoryScope): Promise<UserCategory[]>;
  categoryTotals(input: CategoryScope): Promise<Array<{ categoryId: string; year: number; month: number; expense: Money; income: Money }>>;
  changeUserCategory(input: ChangeCategoryInput): Promise<{ category: UserCategory; replay: boolean }>;
  previewCategoryReclassification(input: ReclassificationInput): Promise<ReclassificationPreview>;
  confirmCategoryReclassification(input: ConfirmReclassificationInput): Promise<ReclassificationResult>;
};
