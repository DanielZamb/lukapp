import { z } from "zod";
import { functionalCurrencyCodes } from "../../../../src/accounting/currencies";

export const currencySchema = z.string().refine((currency) => functionalCurrencyCodes.has(currency), {
  message: "Unsupported workspace currency",
});
