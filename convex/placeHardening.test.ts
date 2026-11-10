import { submitClose, submitUndo } from "../src/accounting/endingTestInputs";
import { AccountingError } from "../src/accounting/errors";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  accountingFixture,
  createProfile,
  provisionWorkspace,
  reverse,
  lock,
  type AccountingTest,
} from "../src/accounting/convexHarness";
import { UNDO_BATCH_SIZE } from "./accountingUndo";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const money = (minorUnits: number) => ({ currency: "COP", minorUnits });
afterEach(() => vi.useRealTimers());
async function setup(template = "co-puc-personal@1", openingAmount = 1000) {
  vi.useFakeTimers();
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const workspace = await provisionWorkspace(t, {
    functionalCurrency: "COP",
    chartOfAccountsTemplate: template,
  });
  const place = await createProfile(t, workspace.id, "Mistake", "cash");
  const other = await createProfile(t, workspace.id, "Other", "bankAccount");
  const third = await createProfile(t, workspace.id, "Third", "savingsAccount");
  const target = {
    workspaceId: workspace.id,
    financialAccountProfileId: place.id,
  };
  const opening = await t.action(api.accounting.recordOpeningPosition, {
    ...target,
    amount: money(openingAmount),
    accountingDate: "2026-09-24",
    description: "Opening",
    idempotencyKey: "opening",
  });
  const expenseResult = await t.action(api.accounting.createUserCategory, {
    workspaceId: workspace.id,
    selection: {
      kind: "preset",
      presetId: "groceries",
      style: { emoji: "F", tone: "primary" },
    },
  });
  const incomeResult = await t.action(api.accounting.createUserCategory, {
    workspaceId: workspace.id,
    selection: {
      kind: "custom",
      name: "Pay",
      answer: "receive",
      style: { emoji: "I", tone: "positive" },
    },
  });
  if (expenseResult.kind !== "category" || incomeResult.kind !== "category")
    throw new Error("Missing category");
  const expense = (key: string, amount = 100) =>
    t.action(api.accounting.recordCashExpense, {
      ...target,
      userCategoryId: expenseResult.category.id,
      amount: money(amount),
      accountingDate: "2026-09-24",
      description: key,
      idempotencyKey: key,
    });
  const transfer = (key: string, from: string, to: string, amount: number) =>
    t.action(api.accounting.recordAccountTransfer, {
      workspaceId: workspace.id,
      sourceFinancialAccountProfileId: from,
      destinationFinancialAccountProfileId: to,
      amount: money(amount),
      accountingDate: "2026-09-24",
      description: key,
      idempotencyKey: key,
    });
  const start = { ...target, idempotencyKey: "undo" };
  return {
    ...fixture,
    workspace,
    place,
    other,
    third,
    target,
    opening,
    start,
    expense,
    transfer,
    expenseCategory: expenseResult.category.id,
    incomeCategory: incomeResult.category.id,
    status: () => t.query(api.accounting.placeUndoStatus, target),
    finish: () =>
      fixture.root.finishAllScheduledFunctions(() => vi.runAllTimers()),
  };
}

test("ended closing counterparty refuses Undo before freezing and names it", async () => {
  const s = await setup();
  await s.t.action(api.accounting.recordOpeningPosition, {
    workspaceId: s.workspace.id,
    financialAccountProfileId: s.other.id,
    amount: money(500),
    accountingDate: "2026-09-24",
    description: "B",
    idempotencyKey: "b",
  });
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.other.id,
    idempotencyKey: "close-b",
    lines: [
      {
        kind: "transfer",
        otherFinancialAccountProfileId: s.place.id,
        amount: money(500),
      },
    ],
  });
  expect(
    await s.t.query(api.accounting.previewUndoPlace, s.target),
  ).toMatchObject({
    canUndo: false,
    blockers: expect.arrayContaining([
      {
        code: "place_undo_ended_counterparty",
        places: [{ id: s.other.id, name: "Other" }],
      },
    ]),
  });
  await expect(
    submitUndo(s.t, s.start),
  ).rejects.toThrow("place_undo_ended_counterparty");
  expect(await s.status()).toBeNull();
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.third.id,
    idempotencyKey: "close-c",
    lines: [],
  });
});
test("only the target freezes; concurrent endings preserve the last open Place", async () => {
  const s = await setup();
  await submitUndo(s.t, s.start);
  const r = await submitUndo(s.t, {
    ...s.start,
    financialAccountProfileId: s.other.id,
    idempotencyKey: "u-b",
  });
  expect(r.operation.state.kind).toBe("pending");
  await expect(
    submitClose(s.t, {
      ...s.start,
      financialAccountProfileId: s.third.id,
      idempotencyKey: "c",
      lines: [],
    }),
  ).rejects.toThrow("place_last_open");
  await s.finish();
  expect((await s.status())?.state.kind).toBe("done");
});
test("legacy category without nature is refused at preview and Start", async () => {
  const s = await setup();
  await s.expense("legacy");
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", s.expenseCategory)!;
    await ctx.db.patch(id, { nature: undefined });
  });
  expect(
    await s.t.query(api.accounting.previewUndoPlace, s.target),
  ).toMatchObject({
    canUndo: false,
    blockers: expect.arrayContaining([
      expect.objectContaining({
        code: "place_undo_invalid_entry",
        reason: "category_nature_required",
      }),
    ]),
  });
  await expect(
    submitUndo(s.t, s.start),
  ).rejects.toThrow("place_undo_invalid_entry");
});
test("future entries refuse preview, Start and Close with latest date", async () => {
  const s = await setup();
  await s.t.action(api.accounting.recordCashExpense, {
    ...s.target,
    amount: money(100),
    accountingDate: "2027-12-15",
    description: "Future",
    idempotencyKey: "future",
  });
  for (const fn of [
    api.accounting.previewUndoPlace,
    api.accounting.placeClosure,
  ])
    expect(await s.t.query(fn, s.target)).toMatchObject({
      blockers: expect.arrayContaining([
        { code: "place_future_entries", latestAccountingDate: "2027-12-15" },
      ]),
    });
  await expect(
    submitUndo(s.t, s.start),
  ).rejects.toThrow("place_future_entries");
  await expect(
    submitClose(s.t, {
      ...s.start,
      lines: [{ kind: "adjustment", amount: money(900) }],
    }),
  ).rejects.toThrow("place_future_entries");
});
async function recovery(
  s: Awaited<ReturnType<typeof setup>>,
  destination = s.third.id,
) {
  const expense = await s.expense("recover", 100);
  const saved = await s.t.action(api.savingsRecovery.activatePlan, {
    workspaceId: s.workspace.id,
    sourceJournalEntryId: expense.id,
    destinationFinancialAccountProfileId: destination,
    installmentCount: 4,
    installmentMinorUnits: 25,
    idempotencyKey: "plan",
  });
  const contribute = (amount: number, key: string) =>
    s.t.action(api.savingsRecovery.recordContribution, {
      workspaceId: s.workspace.id,
      planId: saved.plan.id,
      sourceFinancialAccountProfileId: s.other.id,
      amount: money(amount),
      accountingDate: "2026-09-24",
      description: key,
      idempotencyKey: key,
    });
  return { saved, contribute };
}
test("Recovery remains fundable after closing its expense's Place", async () => {
  const s = await setup();
  const r = await recovery(s);
  await submitClose(s.t, {
    ...s.start,
    lines: [{ kind: "adjustment", amount: money(900) }],
  });
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({ acceptsContributions: true, canCancel: true });
  await r.contribute(25, "next");
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0]?.recoveredMinorUnits,
  ).toBe(25);
});
test.each([false, true])(
  "funded destination refuses Undo even cancelled=%s",
  async (cancelled) => {
    const s = await setup();
    const r = await recovery(s);
    await r.contribute(cancelled ? 25 : 100, "fund");
    if (cancelled)
      await s.t.action(api.savingsRecovery.cancelPlan, {
        workspaceId: s.workspace.id,
        planId: r.saved.plan.id,
        idempotencyKey: "cancel",
      });
    const target = {
      workspaceId: s.workspace.id,
      financialAccountProfileId: s.third.id,
    };
    expect(
      await s.t.query(api.accounting.previewUndoPlace, target),
    ).toMatchObject({
      canUndo: false,
      blockers: expect.arrayContaining([
        {
          code: "place_recovery_contributed_destination",
          plans: [{ id: r.saved.plan.id, title: "recover" }],
        },
      ]),
    });
    await expect(
      submitUndo(s.t, {
        ...target,
        idempotencyKey: "undo-c",
      }),
    ).rejects.toThrow("place_recovery_contributed_destination");
  },
);
test("Recovery flags follow an undoing source and an ended destination", async () => {
  const s = await setup();
  await recovery(s);
  await submitUndo(s.t, s.start);
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({ acceptsContributions: false, canCancel: true });
});
test("locking current month cannot interrupt an Undo", async () => {
  const s = await setup();
  await submitUndo(s.t, s.start);
  await expect(
    lock(s.t, s.workspace.id, { year: 2026, month: 9 }),
  ).rejects.toThrow("period_lock_undo_in_progress");
});
test("nonpositional line numbers cannot skip originals at completion", async () => {
  const s = await setup(undefined, 0);
  const exp = await s.expense("zero-pair", 100);
  await s.t.action(api.accounting.recordCashIncome, {
    ...s.target,
    amount: money(100),
    accountingDate: "2026-09-24",
    description: "pair",
    idempotencyKey: "pair",
  });
  await s.t.run(async (ctx) => {
    for (const line of await ctx.db.query("journalLines").collect())
      await ctx.db.patch(line._id, { lineNumber: line.lineNumber + 10 });
  });
  await submitUndo(s.t, s.start);
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 2,
  });
  const entries = await s.t.query(api.accounting.listJournalEntries, {
    workspaceId: s.workspace.id,
  });
  expect(entries.filter((e) => e.reversesEntryId === exp.id)).toHaveLength(1);
});

test("caller descriptions survive Close, Undo and History, and changed text conflicts", async () => {
  const s = await setup();
  const close = {
    ...s.start,
    lines: [
      {
        kind: "transfer" as const,
        otherFinancialAccountProfileId: s.other.id,
        amount: money(200),
        description: "Pasar saldo",
      },
      {
        kind: "expense" as const,
        userCategoryId: s.expenseCategory,
        amount: money(300),
        description: "Gasto de cierre",
      },
      {
        kind: "adjustment" as const,
        amount: money(500),
        description: "Ajuste final",
      },
    ],
  };
  const receipt = await submitClose(s.t, close);
  expect(receipt.ending.entries.map((e) => e.description)).toEqual([
    "Pasar saldo",
    "Gasto de cierre",
    "Ajuste final",
  ]);
  await expect(
    submitClose(s.t, {
      ...close,
      lines: close.lines.map((l) => ({ ...l, description: "Cambiado" })),
    }),
  ).rejects.toThrow("idempotency_key_conflict");
  const history = await s.t.query(api.accounting.postedActivity, {
    workspaceId: s.workspace.id,
    month: "2026-09",
    status: "all",
  });
  expect(JSON.stringify(history)).toContain("Ajuste final");
  const second = await setup();
  const args = { ...second.start, reversalDescriptionPrefix: "Reversión:" };
  await submitUndo(second.t, args);
  await second.finish();
  expect(
    (
      await second.t.query(api.accounting.listJournalEntries, {
        workspaceId: second.workspace.id,
      })
    )
      .filter((e) => e.reversesEntryId)
      .map((e) => e.description),
  ).toEqual(["Reversión: Opening"]);
  expect(
    JSON.stringify(
      await second.t.query(api.accounting.postedHistory, {
        workspaceId: second.workspace.id,
        includeReversals: true,
        paginationOpts: { cursor: null, numItems: 50 },
      }),
    ),
  ).toContain("Reversión: Opening");
  await expect(
    submitUndo(second.t, {
      ...args,
      reversalDescriptionPrefix: "Otro:",
    }),
  ).rejects.toThrow("idempotency_key_conflict");
});

test("a batch dying before its error handler is resumed by the independent watchdog", async () => {
  const s = await setup();
  const receipt = await submitUndo(s.t, s.start);
  await s.t.run(async (ctx) => {
    for (const job of await ctx.db.system
      .query("_scheduled_functions")
      .collect())
      if (job.name.includes("accountingUndo:drive"))
        await ctx.scheduler.cancel(job._id);
  });
  const errors = await import("./accountingErrors");
  const fault = vi
    .spyOn(errors, "run")
    .mockRejectedValueOnce(new Error("outer mutation died"));
  await expect(
    s.t.mutation(internal.accountingUndo.drive, {
      operationId: receipt.operation.id as Id<"placeUndoOperations">,
      version: 0,
    }),
  ).rejects.toThrow("outer mutation died");
  fault.mockRestore();
  expect(await s.status()).toMatchObject({
    state: { kind: "pending" },
    reversedCount: 0,
  });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 1,
  });
  expect(
    (
      await s.t.query(api.accounting.listJournalEntries, {
        workspaceId: s.workspace.id,
      })
    ).filter((e) => e.reversesEntryId),
  ).toHaveLength(1);
});

test("a 50-Place batch has bounded store reads and actually commits ten reversals", async () => {
  const s = await setup();
  for (let n = 3; n < 50; n++)
    await createProfile(s.t, s.workspace.id, `P${n}`, "bankAccount");
  for (let n = 0; n < 25; n++)
    await s.transfer(`move-${n}`, s.place.id, s.other.id, 1);
  const receipt = await submitUndo(s.t, s.start);
  const { processUndoBatch } = await import("./accountingUndo");
  let calls = 0,
    documents = 0,
    bytes = 0;
  function count(value: unknown) {
    const docs = Array.isArray(value)
      ? value
      : value === null || value === undefined
        ? []
        : [value];
    documents += docs.length;
    bytes += JSON.stringify(docs).length;
    return value;
  }
  function observe<T extends object>(db: T): T {
    return new Proxy(db, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return new Proxy(value, {
          apply(fn, _receiver, args) {
            if (key === "get" || key === "query") calls++;
            const result = Reflect.apply(fn, target, args);
            if (
              key === "get" ||
              key === "collect" ||
              key === "first" ||
              key === "unique" ||
              key === "take"
            )
              return Promise.resolve(result).then(count);
            if (key === "paginate")
              return Promise.resolve(result).then((page) => {
                count(page.page);
                return page;
              });
            if (
              key === "query" ||
              key === "withIndex" ||
              key === "order" ||
              key === "filter"
            )
              return observe(result);
            return result;
          },
        });
      },
    });
  }
  await s.t.run((ctx) =>
    processUndoBatch(
      { ...ctx, db: observe(ctx.db) },
      {
        operationId: receipt.operation.id as Id<"placeUndoOperations">,
        version: 0,
      },
    ),
  );
  expect(await s.status()).toMatchObject({
    state: { kind: "running" },
    reversedCount: 10,
    version: 1,
  });
  expect(calls).toBeLessThan(500);
  expect(documents).toBeLessThan(3000);
  expect(bytes).toBeLessThan(2 * 1024 * 1024);
  console.info(
    JSON.stringify({
      places: 50,
      batchReversals: 10,
      batchReadCalls: calls,
      batchDocumentsReturned: documents,
      jsonBytes: bytes,
    }),
  );
  await s.finish();
});

test("unexpected failure can abort only before any reversal and only by the authorizing owner", async () => {
  const s = await setup();
  const receipt = await submitUndo(s.t, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  const module = await import("../src/accounting/commands/reversePostedEntry");
  const fault = vi
    .spyOn(module, "reversePostedEntry")
    .mockRejectedValueOnce(new AccountingError("journal_line_invalid"));
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId,
    version: 0,
  });
  fault.mockRestore();
  expect(await s.status()).toMatchObject({
    state: { kind: "needs_attention", code: "journal_line_invalid" },
    hasReversedEntries: false,
    reversedCount: 0,
  });
  await expect(
    s.t.mutation(internal.accountingUndo.abortBeforeProgress, {
      operationId,
      authorizedBy: "stranger",
    }),
  ).rejects.toThrow("place_undo_abort_forbidden");
  await s.t.mutation(internal.accountingUndo.abortBeforeProgress, {
    operationId,
    authorizedBy: receipt.operation.authorizedBy,
  });
  await s.t.mutation(internal.accountingUndo.abortBeforeProgress, {
    operationId,
    authorizedBy: receipt.operation.authorizedBy,
  });
  expect(await s.status()).toMatchObject({
    state: { kind: "aborted" },
    hasReversedEntries: false,
  });
  expect(await s.t.query(api.accounting.placeClosure, s.target)).toMatchObject({
    status: "open",
    canClose: true,
  });
  const fresh = await submitUndo(s.t, {
    ...s.start,
    idempotencyKey: "try-again",
  });
  expect(fresh.operation.id).not.toBe(operationId);
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 1,
  });
});

test("a partial Undo cannot abort and exhausted transient failures stay visible", async () => {
  const s = await setup();
  for (let n = 0; n < 15; n++) await s.expense(`e-${n}`, 1);
  const receipt = await submitUndo(s.t, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId,
    version: 0,
  });
  const module = await import("../src/accounting/commands/reversePostedEntry");
  const fault = vi
    .spyOn(module, "reversePostedEntry")
    .mockRejectedValue(new AccountingError("ledger_summary_not_ready"));
  const delays: number[] = [];
  for (let n = 1; n <= 6; n++) {
    const st = await s.status();
    if (!st) throw new Error("Missing operation");
    await s.t.mutation(internal.accountingUndo.drive, {
      operationId,
      version: st.version,
    });
    const next = await s.status();
    if (next?.state.kind === "paused")
      delays.push(next.state.retryAt - Date.now());
  }
  fault.mockRestore();
  expect(delays).toEqual([60000, 120000, 240000, 480000, 960000]);
  expect(await s.status()).toMatchObject({
    state: { kind: "needs_attention", code: "ledger_summary_not_ready" },
    reversedCount: 10,
    hasReversedEntries: true,
  });
  await expect(
    s.t.mutation(internal.accountingUndo.abortBeforeProgress, {
      operationId,
      authorizedBy: receipt.operation.authorizedBy,
    }),
  ).rejects.toThrow("place_undo_abort_forbidden");
  const independent = await createProfile(
    s.t,
    s.workspace.id,
    "Independent",
    "cash",
  );
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: independent.id,
    idempotencyKey: "unrelated-close",
    lines: [],
  });
  await s.t.mutation(internal.accountingUndo.retryAfterRepair, { operationId });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 16,
  });
});

test("an in-flight Undo protects only counterparties with unreversed shared entries", async () => {
  const s = await setup();
  await s.transfer("shared", s.place.id, s.other.id, 100);
  await submitUndo(s.t, s.start);
  await expect(
    submitClose(s.t, {
      ...s.start,
      financialAccountProfileId: s.other.id,
      idempotencyKey: "c",
      lines: [{ kind: "adjustment", amount: money(100) }],
    }),
  ).rejects.toThrow("place_undo_dependency");
  await expect(
    submitUndo(s.t, {
      ...s.start,
      financialAccountProfileId: s.other.id,
      idempotencyKey: "u",
    }),
  ).rejects.toThrow("place_undo_dependency");
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.third.id,
    idempotencyKey: "independent",
    lines: [],
  });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 2,
  });
});

test("Recovery contribution into an ended destination blocks the funding Place's Undo", async () => {
  const s = await setup();
  const r = await recovery(s);
  await r.contribute(100, "complete");
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.third.id,
    idempotencyKey: "end-destination",
    lines: [{ kind: "adjustment", amount: money(100) }],
  });
  const target = {
    workspaceId: s.workspace.id,
    financialAccountProfileId: s.other.id,
  };
  expect(
    await s.t.query(api.accounting.previewUndoPlace, target),
  ).toMatchObject({
    canUndo: false,
    blockers: expect.arrayContaining([
      {
        code: "place_undo_ended_counterparty",
        places: [{ id: s.third.id, name: "Third" }],
      },
    ]),
  });
  await expect(
    submitUndo(s.t, {
      ...target,
      idempotencyKey: "undo-funder",
    }),
  ).rejects.toThrow("place_undo_ended_counterparty");
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({
    acceptsContributions: false,
    canCancel: false,
    status: "completed",
  });
});

test("completion refuses unreversed originals even when their balances net to zero", async () => {
  const s = await setup(undefined, 0);
  await s.expense("expense", 100);
  const income = await s.t.action(api.accounting.recordCashIncome, {
    ...s.target,
    amount: money(100),
    accountingDate: "2026-09-24",
    description: "income",
    idempotencyKey: "income",
  });
  const module = await import("../src/accounting/commands/reversePostedEntry");
  const receipt = await submitUndo(s.t, s.start);
  const fault = vi
    .spyOn(module, "reversePostedEntry")
    .mockResolvedValue(income);
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId: receipt.operation.id as Id<"placeUndoOperations">,
    version: 0,
  });
  fault.mockRestore();
  expect(await s.status()).toMatchObject({
    state: { kind: "needs_attention", code: "place_undo_originals_remain" },
    reversedCount: 0,
  });
  expect(
    await s.t.query(api.accounting.listFinancialAccountProfiles, {
      workspaceId: s.workspace.id,
      status: "undone",
    }),
  ).toEqual([]);
});

test.each(["", "\u200b", "x".repeat(1001)])(
  "invalid caller descriptions never create an ending or operation: %s",
  async (description) => {
    const s = await setup();
    await expect(
      submitClose(s.t, {
        ...s.start,
        lines: [{ kind: "adjustment", amount: money(1000), description }],
      }),
    ).rejects.toThrow("description_invalid");
    await expect(
      submitUndo(s.t, {
        ...s.start,
        reversalDescriptionPrefix: description,
      }),
    ).rejects.toThrow("description_invalid");
    expect(await s.status()).toBeNull();
  },
);

test("ordinary reversal accepts a localized prefix and retains its default for existing callers", async () => {
  const s = await setup();
  const exp = await s.expense("Mercado", 100);
  const reversed = await s.t.action(api.accounting.reversePostedEntry, {
    workspaceId: s.workspace.id,
    journalEntryId: exp.id,
    idempotencyKey: "r",
    reversalDescriptionPrefix: "Reversión:",
  });
  expect(reversed.description).toBe("Reversión: Mercado");
  expect(
    await s.t.action(api.accounting.reversePostedEntry, {
      workspaceId: s.workspace.id,
      journalEntryId: exp.id,
      idempotencyKey: "r",
      reversalDescriptionPrefix: "Reversión:",
    }),
  ).toMatchObject({ id: reversed.id, replay: true });
  await expect(
    s.t.action(api.accounting.reversePostedEntry, {
      workspaceId: s.workspace.id,
      journalEntryId: exp.id,
      idempotencyKey: "r",
      reversalDescriptionPrefix: "Otro:",
    }),
  ).rejects.toThrow("idempotency_key_conflict");
  const exp2 = await s.expense("Again", 1);
  expect((await reverse(s.t, s.workspace.id, exp2.id)).description).toBe(
    "Reversal: Again",
  );
});

test("Recovery can activate after source Close; corrections still preserve money", async () => {
  const s = await setup();
  const expense = await s.expense("recover-later", 100);
  await submitClose(s.t, {
    ...s.start,
    lines: [{ kind: "adjustment", amount: money(900) }],
  });
  const saved = await s.t.action(api.savingsRecovery.activatePlan, {
    workspaceId: s.workspace.id,
    sourceJournalEntryId: expense.id,
    destinationFinancialAccountProfileId: s.third.id,
    installmentCount: 4,
    installmentMinorUnits: 25,
    idempotencyKey: "later",
  });
  const funded = await s.t.action(api.savingsRecovery.recordContribution, {
    workspaceId: s.workspace.id,
    planId: saved.plan.id,
    sourceFinancialAccountProfileId: s.other.id,
    amount: money(25),
    accountingDate: "2026-09-24",
    description: "save",
    idempotencyKey: "save",
  });
  const balances = await s.t.query(api.accounting.balances, {
    workspaceId: s.workspace.id,
  });
  await s.t.action(api.savingsRecovery.correctContribution, {
    workspaceId: s.workspace.id,
    contributionId: funded.contribution.id,
    reason: "Ordinary savings",
    idempotencyKey: "correct",
  });
  expect(
    await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id }),
  ).toEqual(balances);
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({
    acceptsContributions: true,
    canCancel: true,
    recoveredMinorUnits: 0,
  });
});

test("Recovery flags match commands for a legacy ended destination and an undone source", async () => {
  const s = await setup();
  const r = await recovery(s);
  await s.t.run((ctx) =>
    ctx.db.insert("placeEndings", {
      act: "close",
      workspaceId: s.workspace.id as Id<"workspaces">,
      financialAccountProfileId: s.third.id as Id<"financialAccountProfiles">,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      endedBy: "historical",
      idempotencyKey: "historical",
      request: "historical",
      entries: [],
    }),
  );
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({ acceptsContributions: false, canCancel: true });
  await expect(r.contribute(1, "refused")).rejects.toThrow(
    "financial_account_profile_ended",
  );
  await s.t.action(api.savingsRecovery.cancelPlan, {
    workspaceId: s.workspace.id,
    planId: r.saved.plan.id,
    idempotencyKey: "cancel",
  });
  expect(
    (
      await s.t.query(api.savingsRecovery.evaluate, {
        workspaceId: s.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({ acceptsContributions: false, canCancel: false });
  const second = await setup();
  await recovery(second);
  await submitUndo(second.t, second.start);
  await second.finish();
  expect(
    (
      await second.t.query(api.savingsRecovery.evaluate, {
        workspaceId: second.workspace.id,
      })
    ).plans[0],
  ).toMatchObject({
    acceptsContributions: false,
    canCancel: true,
    status: "suspended",
  });
});

test("racing Close and Undo cannot end the last two open Places", async () => {
  const s = await setup(undefined, 0);
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.third.id,
    idempotencyKey: "third",
    lines: [],
  });
  const results = await Promise.allSettled([
    submitUndo(s.t, s.start),
    submitClose(s.t, {
      ...s.start,
      financialAccountProfileId: s.other.id,
      idempotencyKey: "other",
      lines: [],
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    results.filter((r) => r.status === "rejected").map((r) => String(r.reason)),
  ).toEqual([expect.stringContaining("place_last_open")]);
  await s.finish();
  expect(
    await s.t.query(api.accounting.listFinancialAccountProfiles, {
      workspaceId: s.workspace.id,
      status: "open",
    }),
  ).toHaveLength(1);
});

test("already-reversed future originals do not block ending", async () => {
  const s = await setup();
  const e = await s.t.action(api.accounting.recordCashExpense, {
    ...s.target,
    amount: money(100),
    accountingDate: "2027-12-01",
    description: "Future",
    idempotencyKey: "future",
  });
  await s.t.action(api.accounting.reversePostedEntry, {
    workspaceId: s.workspace.id,
    journalEntryId: e.id,
    accountingDate: "2027-12-01",
    idempotencyKey: "reverse-future",
  });
  expect(
    await s.t.query(api.accounting.previewUndoPlace, s.target),
  ).toMatchObject({ canUndo: true, blockers: [] });
  expect(await s.t.query(api.accounting.placeClosure, s.target)).toMatchObject({
    canClose: true,
    blockers: [],
  });
});

test("an oversized integrity review refuses safely instead of approving an incomplete scan", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const line = await ctx.db.query("journalLines").first();
    if (!line) throw new Error("Missing opening line");
    const { _id, _creationTime, ...fields } = line;
    for (let n = 0; n < 1001; n++)
      await ctx.db.insert("journalLines", {
        ...fields,
        ledgerAccountId: s.place.ledgerAccountId as Id<"ledgerAccounts">,
        lineNumber: n + 10,
      });
  });
  expect(
    await s.t.query(api.accounting.previewUndoPlace, s.target),
  ).toMatchObject({
    canUndo: false,
    blockers: expect.arrayContaining([{ code: "place_ending_scan_limit" }]),
  });
  await expect(
    submitUndo(s.t, s.start),
  ).rejects.toThrow("place_ending_scan_limit");
  expect(await s.status()).toBeNull();
});

test("watchdog re-drives a stale running batch and an obsolete version cannot double-reverse", async () => {
  const s = await setup();
  for (let n = 0; n < 15; n++) await s.expense(`entry-${n}`, 1);
  const receipt = await submitUndo(s.t, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId,
    version: 0,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(operationId, { heartbeatAt: Date.now() - 300000 }),
  );
  await s.t.mutation(internal.accountingUndo.watchdog, { operationId });
  expect(await s.status()).toMatchObject({ version: 2, reversedCount: 10 });
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId,
    version: 1,
  });
  expect(await s.status()).toMatchObject({ version: 2, reversedCount: 10 });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 16,
  });
  expect(
    (
      await s.t.query(api.accounting.listJournalEntries, {
        workspaceId: s.workspace.id,
      })
    ).filter((e) => e.reversesEntryId),
  ).toHaveLength(16);
});

test("persistent watchdog stalls stop visibly and can be aborted before progress", async () => {
  const s = await setup();
  const receipt = await submitUndo(s.t, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  for (let n = 0; n < 6; n++) {
    await s.t.run((ctx) =>
      ctx.db.patch(operationId, { heartbeatAt: Date.now() - 300000 }),
    );
    await s.t.mutation(internal.accountingUndo.watchdog, { operationId });
  }
  expect(await s.status()).toMatchObject({
    state: { kind: "needs_attention", code: "place_undo_stalled" },
    watchdogCount: 6,
    hasReversedEntries: false,
  });
  await s.t.mutation(internal.accountingUndo.abortBeforeProgress, {
    operationId,
    authorizedBy: receipt.operation.authorizedBy,
  });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "aborted" },
    reversedCount: 0,
  });
});

test("internal abort requires actual admitted owner context, rather than an owner string alone", async () => {
  const s = await setup();
  const receipt = await submitUndo(s.t, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  await s.t.run((ctx) =>
    ctx.db.patch(operationId, {
      state: {
        kind: "needs_attention",
        code: "injected",
        detail: "Injected fault",
      },
    }),
  );
  const args = { operationId, authorizedBy: receipt.operation.authorizedBy };
  await expect(
    s.root.mutation(internal.accountingUndo.abortBeforeProgress, args),
  ).rejects.toThrow("authentication_required");
  await s.t.run((ctx) => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
  await expect(
    s.t.mutation(internal.accountingUndo.abortBeforeProgress, args),
  ).rejects.toThrow("device_revoked");
  expect((await s.t.run((ctx) => ctx.db.get(operationId)))?.state.kind).toBe(
    "needs_attention",
  );
});

test("a counterparty is free to Close as soon as its last shared original was reversed", async () => {
  const s = await setup();
  await s.transfer("shared", s.place.id, s.other.id, 100);
  for (let n = 0; n < 15; n++) await s.expense(`after-${n}`, 1);
  const receipt = await submitUndo(s.t, s.start);
  expect(receipt.operation.counterparties).toEqual([
    { financialAccountProfileId: s.other.id, remainingEntries: 1 },
  ]);
  await s.t.mutation(internal.accountingUndo.drive, {
    operationId: receipt.operation.id as Id<"placeUndoOperations">,
    version: 0,
  });
  expect(await s.status()).toMatchObject({
    state: { kind: "running" },
    counterparties: [
      { financialAccountProfileId: s.other.id, remainingEntries: 0 },
    ],
  });
  await submitClose(s.t, {
    ...s.start,
    financialAccountProfileId: s.other.id,
    idempotencyKey: "close-counterparty",
    lines: [],
  });
  await s.finish();
  expect(await s.status()).toMatchObject({
    state: { kind: "done" },
    reversedCount: 17,
  });
});
