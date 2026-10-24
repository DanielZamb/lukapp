/// <reference types="vite/client" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { convexAccounting, owner } from "../../src/accounting/convexHarness";
import { postJournalEntry } from "../../src/accounting/posting";
import { convexStore } from "../../convex/store";
import { ConvexError } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { z } from "zod";
import { AccountingError } from "../../src/accounting/errors";
import ts from "typescript";

const modules = import.meta.glob([
  "../../convex/**/*.{js,ts}",
  "!../../convex/**/*.test.ts",
  "!../../convex/**/*.d.ts",
]);
const date = "2026-09-24";
const boot = {
  name: "Replay loan", productKind: "loan", amount: { currency: "COP", minorUnits: 100 },
  accountingDate: date, idempotencyKey: "BOOT",
} satisfies Omit<FunctionArgs<typeof api.accounting.setupFinancialAccountProfile>, "workspaceId">;

const commands = [
  { name: "expense1", kind: "expense", key: "K0", amount: 1 },
  { name: "expense2", kind: "expense", key: "K0", amount: 2 },
  { name: "income1", kind: "income", key: "K0", amount: 1 },
  { name: "transfer1", kind: "transfer", key: "K1", amount: 1 },
  { name: "transfer2", kind: "transfer", key: "K1", amount: 2 },
  { name: "reverse0a", kind: "reverse", key: "R0a", original: "K0" },
  { name: "reverse0b", kind: "reverse", key: "R0b", original: "K0" },
  { name: "reverse1a", kind: "reverse", key: "R1a", original: "K1" },
  { name: "reverse1b", kind: "reverse", key: "R1b", original: "K1" },
  { name: "reverseReversal", kind: "reverse", key: "RR", original: "R0a" },
  { name: "setupReplay", kind: "setup", key: "BOOT", amount: 100 },
  { name: "setupConflict", kind: "setup", key: "BOOT", amount: 101 },
  { name: "unbalanced", kind: "invalid", key: "BAD" },
] as const;
type Command = typeof commands[number];
type Context = Awaited<ReturnType<typeof fixture>>;
type Line = { account: string; debit: number; credit: number; categories: string[]; primary: string };
type Entry = { key: string; policy: string; date: string; description: string; profile: string; original: string; lines: Line[] };
type Projection = { entries: Entry[]; requestIntegrity: boolean; rejectedNoWrite: boolean };
type Node = { projection: Projection; prefix: number[]; invariants: Record<string, boolean> };
const canonical = (value: unknown) => JSON.stringify(value);

test("each modeled public command has exactly one internal mutation as its atomic write boundary", () => {
  function handler(path: string, name: string) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const object = declaration.initializer.arguments[0];
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        const property = object.properties.find(row => ts.isPropertyAssignment(row) && row.name.getText(source) === "handler");
        if (property && ts.isPropertyAssignment(property)) return { node: property.initializer, source };
      }
    }
    throw new Error(`Atomic boundary needs review: ${path}:${name} handler not found`);
  }
  for (const name of ["recordCashExpense", "recordCashIncome", "recordAccountTransfer", "reversePostedEntry", "recordOpeningPosition", "setupFinancialAccountProfile"]) {
    const publicHandler = handler("convex/accounting.ts", name);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(publicHandler.source).startsWith("ctx.run")) calls.push(node); ts.forEachChild(node, visit); };
    visit(publicHandler.node);
    expect(calls.map(call => [call.expression.getText(publicHandler.source), call.arguments[0]?.getText(publicHandler.source)])).toEqual([["ctx.runMutation", `internal.accountingWrites.${name}`]]);
    const internal = handler("convex/accountingWrites.ts", name);
    const nested: string[] = [];
    const inspect = (node: ts.Node) => { if (ts.isCallExpression(node) && /ctx\.run(Action|Mutation)/.test(node.expression.getText(internal.source))) nested.push(node.getText(internal.source)); ts.forEachChild(node, inspect); };
    inspect(internal.node);
    expect(nested).toEqual([]);
  }
});

async function fixture() {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
    categories: [{ kind: "preset", presetId: "groceries", style: { emoji: "🍔", tone: "primary" } }],
    purchaseAlertsConsent: false, wantsBudgets: false,
  });
  const workspaceId = defaults.workspace.id;
  const expense = await t.action(api.accounting.createUserCategory, {
    workspaceId, selection: { kind: "custom", name: "Replay expense", answer: "spend", style: { emoji: "🛒", tone: "primary" } },
  });
  const income = await t.action(api.accounting.createUserCategory, {
    workspaceId, selection: { kind: "custom", name: "Replay income", answer: "receive", style: { emoji: "💸", tone: "positive" } },
  });
  if (expense.kind !== "category" || income.kind !== "category") throw new Error("Fixture category routing failed");
  const setup = await t.action(api.accounting.setupFinancialAccountProfile, { workspaceId, ...boot });
  return { t, workspaceId, cash: defaults.financialAccountProfile, loan: setup.financialAccountProfile, expense: expense.category, income: income.category };
}

async function observe(ctx: Context): Promise<Entry[]> {
  return ctx.t.run(async tx => {
    const store = convexStore(tx.db);
    const accounts = new Map((await store.listLedgerAccounts(ctx.workspaceId)).map(row => [row.id, row.code]));
    const categories = new Map((await store.listCategories(ctx.workspaceId)).map(row => [row.id, row.name]));
    const profiles = new Map((await store.listProfiles(ctx.workspaceId)).map(row => [row.id, row.name]));
    const entries = await store.listJournalEntries(ctx.workspaceId);
    const keys = new Map(entries.map(row => [row.id, row.idempotencyKey]));
    return entries.map(row => ({
      key: row.idempotencyKey, policy: row.policy, date: row.accountingDate,
      description: row.description, profile: profiles.get(row.financialAccountProfileId ?? "") ?? "",
      original: keys.get(row.reversesEntryId ?? "") ?? "",
      lines: row.lines.map(line => ({
        account: accounts.get(line.ledgerAccountId) ?? "MISSING",
        debit: line.debitMinorUnits, credit: line.creditMinorUnits,
        categories: (line.userCategoryIds ?? (line.userCategoryId ? [line.userCategoryId] : [])).map(id => categories.get(id) ?? "MISSING"),
        primary: categories.get(line.primaryUserCategoryId ?? "") ?? "",
      })),
    })).sort((a, b) => canonical(a).localeCompare(canonical(b)));
  });
}

async function invoke(ctx: Context, command: Command): Promise<void> {
  const common = { workspaceId: ctx.workspaceId, accountingDate: date, idempotencyKey: command.key };
  switch (command.kind) {
    case "expense":
    case "income": {
      const input = { ...common, financialAccountProfileId: ctx.cash.id, amount: { currency: "COP", minorUnits: command.amount }, description: command.kind, userCategoryId: command.kind === "expense" ? ctx.expense.id : ctx.income.id };
      if (command.kind === "expense") await ctx.t.action(api.accounting.recordCashExpense, input);
      else await ctx.t.action(api.accounting.recordCashIncome, input);
      return;
    }
    case "transfer":
      await ctx.t.action(api.accounting.recordAccountTransfer, { ...common, sourceFinancialAccountProfileId: ctx.cash.id, destinationFinancialAccountProfileId: ctx.loan.id, amount: { currency: "COP", minorUnits: command.amount }, description: command.kind });
      return;
    case "reverse": {
      const entries = await ctx.t.run(tx => convexStore(tx.db).listJournalEntries(ctx.workspaceId));
      const original = entries.find(row => row.idempotencyKey === command.original);
      await ctx.t.action(api.accounting.reversePostedEntry, { ...common, journalEntryId: original?.id ?? "not-an-entry-id" });
      return;
    }
    case "setup":
      await ctx.t.action(api.accounting.setupFinancialAccountProfile, { workspaceId: ctx.workspaceId, ...boot, amount: { currency: "COP", minorUnits: command.amount } });
      return;
    case "invalid": {
      const account = await ctx.t.run(tx => convexStore(tx.db).findLedgerAccountByCode(ctx.workspaceId, "51959595"));
      if (!account) throw new Error("Fixture account missing");
      await ctx.t.run(tx => postJournalEntry(convexStore(tx.db), { now: () => new Date("2026-09-24T15:00:00Z") }, {
        actor: owner, workspaceId: ctx.workspaceId,
        draft: { ...common, description: "Deliberately unbalanced internal draft", policy: "cash-expense@1", lines: [
          { ledgerAccountId: account.id, debitMinorUnits: 2, creditMinorUnits: 0 },
          { ledgerAccountId: ctx.cash.ledgerAccountId, debitMinorUnits: 0, creditMinorUnits: 1 },
        ] },
      }));
      return;
    }
  }
}

function invariants(projection: Projection) {
  const { entries } = projection;
  const balanced = entries.every(entry => entry.lines.length >= 2 && entry.lines.every(line => Number.isSafeInteger(line.debit) && Number.isSafeInteger(line.credit) && line.debit >= 0 && line.credit >= 0 && (line.debit > 0) !== (line.credit > 0)) && entry.lines.reduce((sum, line) => sum + line.debit - line.credit, 0) === 0);
  const reversed = entries.filter(entry => entry.original !== "");
  const uniqueMirrored = reversed.every(entry => {
    const original = entries.find(row => row.key === entry.original);
    return original !== undefined && original.original === "" && canonical(entry.lines) === canonical(original.lines.map(line => ({ ...line, debit: line.credit, credit: line.debit })));
  }) && new Set(reversed.map(row => row.original)).size === reversed.length;
  return { OneJournalPerKey: new Set(entries.map(row => row.key)).size === entries.length, BalancedJournals: balanced, UniqueMirroredReversal: uniqueMirrored, RequestIntegrity: projection.requestIntegrity };
}

async function transition(ctx: Context, previous: Projection, command: Command): Promise<Projection> {
  const existing = previous.entries.find(row => row.key === command.key);
  const conflict = command.kind === "setup" ? command.amount !== 100 :
    (command.kind === "expense" || command.kind === "income" || command.kind === "transfer") && existing !== undefined &&
    (existing.description !== command.kind || existing.lines.reduce((sum, line) => sum + line.debit, 0) !== command.amount);
  let expected = conflict ? command.kind === "setup" ? "account_setup_conflict" : "idempotency_key_conflict" : "ok";
  if (command.kind === "invalid") expected = "posted_journal_entry_unbalanced";
  if (command.kind === "reverse") {
    const original = previous.entries.find(row => row.key === command.original);
    if (!original) expected = "journal_entry_not_found";
    else if (original.original !== "") expected = "reversal_cannot_be_reversed";
    else if (previous.entries.some(row => row.original === command.original && row.key !== command.key)) expected = "journal_entry_already_reversed";
  }
  let observed = "ok";
  try { await invoke(ctx, command); }
  catch (error: unknown) {
    if (error instanceof AccountingError) observed = error.code;
    else if (error instanceof ConvexError) observed = z.object({ code: z.string() }).parse(error.data).code;
    else throw error;
  }
  const entries = await observe(ctx);
  return { entries, requestIntegrity: previous.requestIntegrity && observed === expected, rejectedNoWrite: previous.rejectedNoWrite && (observed === "ok" || canonical(entries) === canonical(previous.entries)) };
}

test("extract all reachable ledger transitions from real public actions and the actual posting kernel", async () => {
  const out = process.env.REPLAY_FORMAL_OUTPUT;
  if (!out) throw new Error("Run node formal/accounting-replay/check.mjs, which sets REPLAY_FORMAL_OUTPUT");
  mkdirSync(out, { recursive: true });
  const initialContext = await fixture();
  const initial: Projection = { entries: await observe(initialContext), requestIntegrity: true, rejectedNoWrite: true };
  expect(initial.entries).toHaveLength(1);
  const nodes: Node[] = [{ projection: initial, prefix: [], invariants: invariants(initial) }];
  const visited = new Map([[canonical(initial), 0]]);
  const edges: { from: number; command: number; to: number }[] = [];
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor];
    if (!Object.values(node.invariants).every(Boolean)) continue;
    if (nodes.length > 500) throw new Error("Projection exceeded500 states; investigate scope before raising this guard");
    for (let command = 0; command < commands.length; command++) {
      const ctx = await fixture();
      let before = initial;
      for (const previous of node.prefix) before = await transition(ctx, before, commands[previous]);
      expect(canonical(before)).toBe(canonical(node.projection));
      const projection = await transition(ctx, before, commands[command]);
      expect(projection.rejectedNoWrite, "Convex mutation rollback assumption did not hold in this execution").toBe(true);
      const key = canonical(projection);
      let to = visited.get(key);
      if (to === undefined) {
        to = nodes.length;
        visited.set(key, to);
        nodes.push({ projection, prefix: [...node.prefix, command], invariants: invariants(projection) });
      }
      edges.push({ from: cursor, command, to });
    }
  }
  writeFileSync(resolve(out, "projection.json"), JSON.stringify({ commands, nodes, edges, atomicBoundary: "Each successful public action delegates to one accountingWrites internalMutation; raw invalid draft uses one convex-test transaction", fixture: "Synthetic Clerk fixture and convex-test only; no real-provider or auth proof" }, null, 2) + "\n");
  expect(edges.length).toBeGreaterThan(commands.length);
  console.log(JSON.stringify({ projectedVerificationStates: nodes.length, distinctPersistedLedgers: new Set(nodes.map(node => canonical(node.projection.entries))).size, actualCommandTransitions: edges.length }));
});
