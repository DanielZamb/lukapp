export type IntakeDirection = "in" | "out";

export type IntakeSuggestion = {
  direction: IntakeDirection;
  description: string;
  amount: { currency: "COP" | "USD"; minorUnits: number };
  accountingDate: string;
  financialAccountProfileId: string;
  userCategoryIds: string[];
  primaryUserCategoryId: string | null;
};

export type IntakeReceipt = {
  id: string;
  workspaceId: string;
  journalEntryId: string;
  idempotencyKey: string;
  suggestion: IntakeSuggestion;
  changedFields: string[];
  parserVersion: string;
  consentVersion: string;
  actorId: string;
  confirmedAt: number;
};

export type ConfirmCandidateInput = {
  workspaceId: string;
  candidateId: string;
  confirmed: IntakeSuggestion;
  suggestion: IntakeSuggestion;
  parserVersion: string;
  consentVersion: string;
};

export type PostedIntakeEntry = {
  id: string;
  description: string;
  amount: { currency: string; minorUnits: number };
  replay: boolean;
};

export type ConfirmCandidateResult = {
  posted: PostedIntakeEntry;
  receipt: IntakeReceipt;
  replay: boolean;
};

export type IntakeStore = {
  findReceipt(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<IntakeReceipt | null>;
  insertReceipt(receipt: Omit<IntakeReceipt, "id">): Promise<IntakeReceipt>;
};

export type PostCashActivity = (input: {
  kind: IntakeDirection;
  workspaceId: string;
  financialAccountProfileId: string;
  amount: { currency: "COP" | "USD"; minorUnits: number };
  accountingDate: string;
  description: string;
  idempotencyKey: string;
  userCategoryIds?: string[];
  primaryUserCategoryId?: string;
}) => Promise<PostedIntakeEntry>;

export type CandidateConfirmResult =
  | { candidateId: string; ok: true; result: ConfirmCandidateResult }
  | { candidateId: string; ok: false; error: string };
