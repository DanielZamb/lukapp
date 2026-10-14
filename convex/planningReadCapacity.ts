import type { QueryCtx } from "./_generated/server";
import { AccountingError } from "../src/accounting/errors";

export async function requirePlanningReadHeadroom(meta: QueryCtx["meta"]) {
  const metrics = await meta.getTransactionMetrics();
  if (metrics.databaseQueries.used > 3000 || metrics.databaseQueries.remaining < 1096 ||
    metrics.documentsRead.used > 20000 || metrics.documentsRead.remaining < 12000 ||
    metrics.bytesRead.used > 8 * 1024 * 1024 || metrics.bytesRead.remaining < 8 * 1024 * 1024)
    throw new AccountingError("planning_read_limit");
}

export async function planningDocuments<T>(meta: QueryCtx["meta"], query: AsyncIterable<T>, maximum: number): Promise<T[]> {
  await requirePlanningReadHeadroom(meta);
  const iterator = query[Symbol.asyncIterator]();
  const documents: T[] = [];
  try {
    while (true) {
      await requirePlanningReadHeadroom(meta);
      const next = await iterator.next();
      await requirePlanningReadHeadroom(meta);
      if (next.done) return documents;
      if (documents.length === maximum) throw new AccountingError("planning_read_limit");
      documents.push(next.value);
    }
  } finally { await iterator.return?.(); }
}
