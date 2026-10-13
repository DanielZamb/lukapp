import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Keyboard } from "react-native";
import * as Crypto from "expo-crypto";
import { api } from "../../../../convex/_generated/api";
import { useAccess, useRuntime } from "../access/RuntimeProvider";
import { custody } from "../access/native";
import { usePostedActivity } from "../modules/posted-activity/PostedActivityProvider";
import { draftStore } from "../modules/local-entry-drafts/store";
import type { ExpenseDraft } from "../modules/local-entry-drafts/store";
import { parseAmount, today, validAccountingDate } from "../modules/local-entry-drafts/money";
import { Choice, Copy, Header, PrimaryButton, Screen, SecondaryButton, ConfirmationContent } from "../ui";
import { Input } from "../ui/Input";

export default function Expense() {
  const { controller, posted } = useRuntime();
  const access = useAccess();
  const snapshot = usePostedActivity();
  const params = useLocalSearchParams<{ id?: string; account?: string }>();
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [postedResult, setPostedResult] = useState<{ id: string; profileId: string } | null>(null);
  useEffect(() => {
    if (access.kind !== "ready") return;
    let stopped = false;
    const store = draftStore(custody, access.contact.generation, access.workspaceId);
    if (params.id) void store.list().then(items => { if (!stopped) setDraft(items.find(item => item.id === params.id) ?? null); })
      .catch(() => controller.lock());
    else setDraft({ kind: "expense", id: Crypto.randomUUID(), workspaceId: access.workspaceId,
      stage: "editing", amount: "", date: today(), profileId: params.account ?? "", description: "" });
    return () => { stopped = true; };
  }, [access, params.id, params.account]);
  if (postedResult) return <Screen><ConfirmationContent title="Posted" detail="Your Expense is recorded. Your account reads its updated balance online." />
    <PrimaryButton label="See account" onPress={() => router.replace({ pathname: "/account", params: { id: postedResult.profileId } })} />
  </Screen>;
  if (access.kind !== "ready" || !draft || snapshot.kind !== "ready" || !snapshot.phone) return <Screen><Copy title="Loading your Expense" /></Screen>;
  const store = draftStore(custody, access.contact.generation, access.workspaceId);
  const phone = snapshot.phone;
  const cashProfiles = phone.profiles.filter(profile => ["cash", "bankAccount", "savingsAccount"].includes(profile.productKind));
  const first = cashProfiles[0];
  const profileId = draft.stage === "editing" ? draft.profileId || first?.id || "" : draft.request.financialAccountProfileId;
  const amount = draft.stage === "editing" ? parseAmount(draft.amount, phone.workspace.functionalCurrency) : draft.request.amount.minorUnits;
  const save = async () => {
    setBusy(true);
    try { await store.put(draft); Keyboard.dismiss(); router.replace("/drafts"); }
    catch { setMessage("Unlock again to save this Draft."); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (amount === null || amount <= 0 || !profileId) return;
    const confirmed: ExpenseDraft = draft.stage === "confirmed" ? draft : {
      kind: "expense", stage: "confirmed", id: draft.id, workspaceId: draft.workspaceId,
      request: { workspaceId: draft.workspaceId, financialAccountProfileId: profileId,
        amount: { currency: phone.workspace.functionalCurrency, minorUnits: amount },
        accountingDate: draft.date, description: draft.description.trim(), idempotencyKey: draft.id },
    };
    setBusy(true); setMessage(""); Keyboard.dismiss();
    try {
      await store.put(confirmed); setDraft(confirmed); router.setParams({ id: confirmed.id });
      const result = await controller.execute(async (proof, rpc) => rpc.mutation(api.accounting.recordCashExpense,
        await proof("accounting.recordCashExpense", confirmed.request)));
      await store.remove(confirmed.id);
      posted.setScope({ kind: "unavailable", reason: "no-workspace" });
      posted.setScope({ kind: "connected", workspaceId: access.workspaceId });
      setPostedResult({ id: result.id, profileId });
    } catch { setMessage("Your confirmed Draft stays on this device. Unlock online and retry these same facts."); }
    finally { setBusy(false); }
  };
  return <Screen footer={<>
    <PrimaryButton label={draft.stage === "confirmed" ? "Retry Post" : "Post Expense"} loading={busy}
      disabled={amount === null || amount <= 0 || !cashProfiles.some(profile => profile.id === profileId) || (draft.stage === "editing" && (!draft.description.trim() || !validAccountingDate(draft.date)))}
      onPress={() => { void submit(); }} />
    <SecondaryButton label="Save Draft" disabled={busy} onPress={() => { void save(); }} />
  </>}>
    <Header title="Post money" back={{ label: "Back", onPress: () => router.back() }} />
    <Copy title="Expense" detail="Money you spent. The date is when cash moved." />
    {draft.stage === "editing" ? <>
      <Input accessibilityLabel="Expense amount" placeholder="0" keyboardType="decimal-pad" value={draft.amount} onChangeText={amount => setDraft({ ...draft, amount })} />
      <Input accessibilityLabel="Description" placeholder="What was it for?" value={draft.description} onChangeText={description => setDraft({ ...draft, description })} />
      <Copy title="Account" />
      {cashProfiles.map(profile => <Choice key={profile.id} label={profile.name} selected={profileId === profile.id} onPress={() => setDraft({ ...draft, profileId: profile.id })} />)}
      {!cashProfiles.length && <Copy title="Add a cash or bank account" detail="Set up a place for the money you spend before posting this Expense." />}
      <Input accessibilityLabel="Date cash moved" value={draft.date} placeholder="YYYY-MM-DD" onChangeText={date => setDraft({ ...draft, date })} />
    </> : <Copy title={draft.request.description} detail="This confirmed Expense keeps its original amount, date and account on retry." />}
    {message && <Copy title="Not posted yet" detail={message} />}
  </Screen>;
}
