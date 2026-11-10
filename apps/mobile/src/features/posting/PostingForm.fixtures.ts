import type { PostingFormProps } from "./PostingForm";
import { openAmount } from "../amount/session";

type Fixture = Omit<
  PostingFormProps,
  | "onEntryType"
  | "onDestination"
  | "onAmountChange"
  | "onDescriptionChange"
  | "onBack"
  | "onPlace"
  | "onCategory"
  | "onDate"
  | "onPost"
  | "onDone"
>;
export const emptyPostingForm = {
  currency: "COP",
  amount: openAmount("COP", "-"),
  description: "",
  date: "August 23, 2026",
  place: "💰 My money",
  category: "Pick",
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

export const incomePostingForm = {
  ...emptyPostingForm,
  amount: openAmount("COP", "+4.200.000,00"),
  description: "Salary",
  category: "Salary",
  canSubmit: true,
} satisfies Fixture;
export const transferPostingForm = {
  ...emptyPostingForm,
  entryType: "transfer",
  amount: openAmount("COP", "-500.000,00"),
  description: "Card payment",
  destination: "Credit card",
  categoryEnabled: true,
  canSubmit: true,
} satisfies Fixture;
export const openingPostingForm = {
  ...emptyPostingForm,
  entryType: "initial",
  amount: openAmount("COP", "250.000,00"),
  description: "Starting amount",
  categoryEnabled: false,
  canSubmit: true,
} satisfies Fixture;
