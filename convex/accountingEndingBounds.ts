import { AccountingError } from "../src/accounting/errors";

export const ENDING_COLLECTION_LIMIT = 1000;
export function completeEndingRead<T>(rows: T[]): T[] {
  if (rows.length > ENDING_COLLECTION_LIMIT) throw new AccountingError("place_ending_scan_limit");
  return rows;
}
