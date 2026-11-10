import { AccountingError } from "./errors";
import { hasVisibleText } from "./names";
export function optionalDescription(value: string | undefined) {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (!hasVisibleText(text) || text.length > 1000)
    throw new AccountingError("description_invalid");
  return text;
}
