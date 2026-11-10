import { AccountingError } from "../src/accounting/errors";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { accountingFixture, createProfile, provisionWorkspace, reverse, lock, type AccountingTest } from "../src/accounting/convexHarness";
import { UNDO_BATCH_SIZE } from "./accountingUndo";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const money = (minorUnits: number) => ({ currency: "COP", minorUnits });
afterEach(() => vi.useRealTimers());
async function setup(template = "co-puc-personal@1", openingAmount = 1000) {
  vi.useFakeTimers();
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const workspace = await provisionWorkspace(t, { functionalCurrency: "COP", chartOfAccountsTemplate: template });
  const place = await createProfile(t, workspace.id, "Mistake", "cash");
  const other = await createProfile(t, workspace.id, "Other", "bankAccount");
  const third = await createProfile(t, workspace.id, "Third", "savingsAccount");
  const target = { workspaceId: workspace.id, financialAccountProfileId: place.id };
  const opening = await t.action(api.accounting.recordOpeningPosition, { ...target, amount: money(openingAmount), accountingDate: "2026-09-24", description: "Opening", idempotencyKey: "opening" });
  const expenseResult = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id,
    selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  const incomeResult = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id,
    selection: { kind: "custom", name: "Pay", answer: "receive", style: { emoji: "I", tone: "positive" } } });
  if (expenseResult.kind !== "category" || incomeResult.kind !== "category") throw new Error("Missing category");
  const expense = (key: string, amount = 100) => t.action(api.accounting.recordCashExpense, { ...target,
    userCategoryId: expenseResult.category.id, amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const transfer = (key: string, from: string, to: string, amount: number) => t.action(api.accounting.recordAccountTransfer, {
    workspaceId: workspace.id, sourceFinancialAccountProfileId: from, destinationFinancialAccountProfileId: to,
    amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const start = { ...target, idempotencyKey: "undo" };
  return { ...fixture, workspace, place, other, third, target, opening, start, expense, transfer,
    expenseCategory: expenseResult.category.id, incomeCategory: incomeResult.category.id,
    status: () => t.query(api.accounting.placeUndoStatus, target),
    finish: () => fixture.root.finishAllScheduledFunctions(() => vi.runAllTimers()),
  };
}

test("ended closing counterparty refuses Undo before freezing and names it", async () => {
 const s = await setup();
 await s.t.action(api.accounting.recordOpeningPosition, { workspaceId:s.workspace.id, financialAccountProfileId:s.other.id, amount:money(500), accountingDate:"2026-09-24", description:"B", idempotencyKey:"b" });
 await s.t.action(api.accounting.closePlace,{...s.start,financialAccountProfileId:s.other.id,idempotencyKey:"close-b",lines:[{kind:"transfer",otherFinancialAccountProfileId:s.place.id,amount:money(500)}]});
 expect(await s.t.query(api.accounting.previewUndoPlace,s.target)).toMatchObject({canUndo:false,blockers:expect.arrayContaining([{code:"place_undo_ended_counterparty",places:[{id:s.other.id,name:"Other"}]}])});
 await expect(s.t.action(api.accounting.startUndoPlace,s.start)).rejects.toThrow("place_undo_ended_counterparty");
 expect(await s.status()).toBeNull();
 await s.t.action(api.accounting.closePlace,{...s.start,financialAccountProfileId:s.third.id,idempotencyKey:"close-c",lines:[]});
});
test("only the target freezes; concurrent endings preserve the last open Place", async()=>{
 const s=await setup();
 await s.t.action(api.accounting.startUndoPlace,s.start);
 const r=await s.t.action(api.accounting.startUndoPlace,{...s.start,financialAccountProfileId:s.other.id,idempotencyKey:"u-b"});
 expect(r.operation.state.kind).toBe("pending");
 await expect(s.t.action(api.accounting.closePlace,{...s.start,financialAccountProfileId:s.third.id,idempotencyKey:"c",lines:[]})).rejects.toThrow("place_last_open");
 await s.finish();
 expect((await s.status())?.state.kind).toBe("done");
});
test("legacy category without nature is refused at preview and Start",async()=>{
 const s=await setup();await s.expense("legacy");
 await s.t.run(async ctx=>{const id=ctx.db.normalizeId("userCategories",s.expenseCategory)!;await ctx.db.patch(id,{nature:undefined});});
 expect(await s.t.query(api.accounting.previewUndoPlace,s.target)).toMatchObject({canUndo:false,blockers:expect.arrayContaining([expect.objectContaining({code:"category_nature_required"})])});
 await expect(s.t.action(api.accounting.startUndoPlace,s.start)).rejects.toThrow("category_nature_required");
});
test("future entries refuse preview, Start and Close with latest date",async()=>{
 const s=await setup();
 await s.t.action(api.accounting.recordCashExpense,{...s.target,amount:money(100),accountingDate:"2027-12-15",description:"Future",idempotencyKey:"future"});
 for(const fn of [api.accounting.previewUndoPlace,api.accounting.placeClosure]) expect(await s.t.query(fn,s.target)).toMatchObject({blockers:expect.arrayContaining([{code:"place_future_entries",latestAccountingDate:"2027-12-15"}])});
 await expect(s.t.action(api.accounting.startUndoPlace,s.start)).rejects.toThrow("place_future_entries");
 await expect(s.t.action(api.accounting.closePlace,{...s.start,lines:[{kind:"adjustment",amount:money(900)}]})).rejects.toThrow("place_future_entries");
});
async function recovery(s:Awaited<ReturnType<typeof setup>>,destination=s.third.id){
 const expense=await s.expense("recover",100);
 const saved=await s.t.action(api.savingsRecovery.activatePlan,{workspaceId:s.workspace.id,sourceJournalEntryId:expense.id,destinationFinancialAccountProfileId:destination,installmentCount:4,installmentMinorUnits:25,idempotencyKey:"plan"});
 const contribute=(amount:number,key:string)=>s.t.action(api.savingsRecovery.recordContribution,{workspaceId:s.workspace.id,planId:saved.plan.id,sourceFinancialAccountProfileId:s.other.id,amount:money(amount),accountingDate:"2026-09-24",description:key,idempotencyKey:key});
 return {saved,contribute};
}
test("Recovery remains fundable after closing its expense's Place",async()=>{
 const s=await setup();const r=await recovery(s);
 await s.t.action(api.accounting.closePlace,{...s.start,lines:[{kind:"adjustment",amount:money(900)}]});
 expect((await s.t.query(api.savingsRecovery.evaluate,{workspaceId:s.workspace.id})).plans[0]).toMatchObject({acceptsContributions:true,canCancel:true});
 await r.contribute(25,"next");
 expect((await s.t.query(api.savingsRecovery.evaluate,{workspaceId:s.workspace.id})).plans[0]?.recoveredMinorUnits).toBe(25);
});
test.each([false,true])("funded destination refuses Undo even cancelled=%s",async cancelled=>{
 const s=await setup();const r=await recovery(s);await r.contribute(cancelled?25:100,"fund");
 if(cancelled)await s.t.action(api.savingsRecovery.cancelPlan,{workspaceId:s.workspace.id,planId:r.saved.plan.id,idempotencyKey:"cancel"});
 const target={workspaceId:s.workspace.id,financialAccountProfileId:s.third.id};
 expect(await s.t.query(api.accounting.previewUndoPlace,target)).toMatchObject({canUndo:false,blockers:expect.arrayContaining([{code:"place_recovery_contributed_destination",plans:[{id:r.saved.plan.id,title:"recover"}]}])});
 await expect(s.t.action(api.accounting.startUndoPlace,{...target,idempotencyKey:"undo-c"})).rejects.toThrow("place_recovery_contributed_destination");
});
test("Recovery flags follow an undoing source and an ended destination",async()=>{
 const s=await setup();await recovery(s);await s.t.action(api.accounting.startUndoPlace,s.start);
 expect((await s.t.query(api.savingsRecovery.evaluate,{workspaceId:s.workspace.id})).plans[0]).toMatchObject({acceptsContributions:false,canCancel:true});
});
test("locking current month cannot interrupt an Undo",async()=>{
 const s=await setup();await s.t.action(api.accounting.startUndoPlace,s.start);
 await expect(lock(s.t,s.workspace.id,{year:2026,month:9})).rejects.toThrow("period_lock_undo_in_progress");
});
test("nonpositional line numbers cannot skip originals at completion",async()=>{
 const s=await setup(undefined,0);const exp=await s.expense("zero-pair",100);
 await s.t.action(api.accounting.recordCashIncome,{...s.target,amount:money(100),accountingDate:"2026-09-24",description:"pair",idempotencyKey:"pair"});
 await s.t.run(async ctx=>{for(const line of await ctx.db.query("journalLines").collect())await ctx.db.patch(line._id,{lineNumber:line.lineNumber+10});});
 await s.t.action(api.accounting.startUndoPlace,s.start);await s.finish();
 expect(await s.status()).toMatchObject({state:{kind:"done"},reversedCount:2});
 const entries=await s.t.query(api.accounting.listJournalEntries,{workspaceId:s.workspace.id});
 expect(entries.filter(e=>e.reversesEntryId===exp.id)).toHaveLength(1);
});
