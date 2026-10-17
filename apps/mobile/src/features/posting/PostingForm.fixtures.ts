import type { PostingFormProps } from "./PostingForm";

type Fixture = Omit<
  PostingFormProps,
  | "onAmountChange"
  | "onDescriptionChange"
  | "onBack"
  | "onPlace"
  | "onDate"
  | "onPost"
  | "onDone"
>;
export const emptyPostingForm = {
  currency: "COP",
  amount: "-",
  description: "",
  date: "August 23, 2026",
  place: "My money",
  editable: true,
  loading: false,
  busy: false,
  pending: false,
  canSubmit: false,
  error: "",
  posted: null,
} satisfies Fixture;
export const acknowledgedPostingForm = {
  ...emptyPostingForm,
  posted: "Groceries · −COP 1.500,00",
} satisfies Fixture;
