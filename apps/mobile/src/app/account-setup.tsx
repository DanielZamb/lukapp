import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { api } from "../../../../convex/_generated/api";
import { useAccess, useRuntime } from "../access/RuntimeProvider";
import { usePostedActivity } from "../modules/posted-activity/PostedActivityProvider";
import { parseAmount, today, validAccountingDate } from "../modules/local-entry-drafts/money";
import { Choice, Copy, Header, PrimaryButton, Screen } from "../ui";
import { Input } from "../ui/Input";
import type { FinancialArgs } from "../../../../src/access/client";

export default function AccountSetup() {
  const params = useLocalSearchParams<{ household?: string }>();
  const household = params.household === "1";
  const { controller, posted } = useRuntime();
  const access = useAccess();
  const snapshot = usePostedActivity();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FinancialArgs<"setupFinancialAccount">["productKind"]>("bankAccount");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [counterparty, setCounterparty] = useState("");
  const [security, setSecurity] = useState<"secured" | "unsecured">("unsecured");
  const [investment, setInvestment] = useState<"termDeposit" | "fund">("termDeposit");
  const [key] = useState(Crypto.randomUUID);
  const [confirmed, setConfirmed] = useState<FinancialArgs<"setupFinancialAccount"> | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (access.kind !== "ready" || snapshot.kind !== "ready" || !snapshot.phone) return <Screen><Copy title="Loading account setup" /></Screen>;
  const currency = snapshot.phone.workspace.functionalCurrency;
  const value = parseAmount(amount, currency);
  const setup = async () => {
    if (value === null) return;
    setBusy(true); setError(false);
    try {
      let workspaceId = access.workspaceId;
      if (household) {
        const result = await controller.execute(async (proof, rpc) => rpc.mutation(api.accounting.createHouseholdWorkspace,
          await proof("accounting.createHouseholdWorkspace", { functionalCurrency: currency, idempotencyKey: key, now: Date.now() })));
        workspaceId = result.id; setHouseholdId(result.id);
      }
      const facts = confirmed ?? { workspaceId, name: name.trim(), productKind: kind,
        amount: { currency, minorUnits: value }, accountingDate: date, description: "Start tracking", idempotencyKey: key + "-account",
        ...(kind === "receivable" ? { classificationAnswers: { kind, security, counterpartyName: counterparty.trim() } } :
          kind === "personalDebt" ? { classificationAnswers: { kind, counterpartyName: counterparty.trim() } } :
          kind === "investment" ? { classificationAnswers: { kind, form: investment, ...(counterparty.trim() ? { counterpartyName: counterparty.trim() } : {}) } } : {}) };
      setConfirmed(facts);
      await controller.execute(async (proof, rpc) => rpc.mutation(api.accounting.setupFinancialAccount, await proof("accounting.setupFinancialAccount", facts)));
      router.dismissTo("/");
      if (household || householdId) controller.workspace(workspaceId);
      else { posted.setScope({ kind: "unavailable", reason: "no-workspace" }); posted.setScope({ kind: "connected", workspaceId }); }
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <Screen><Header title={household ? "Set up a Household" : "Add a place"} back={{ label: "Cancel account setup", onPress: () => router.back() }} />
    <Copy title="A place for your money" detail={household ? "A separate Household with you as its Owner. It uses " + currency + "." : "Enter what is held, or what remains owed, when you start tracking."} />
    <Input accessibilityLabel="Account name" value={name} onChangeText={setName} placeholder="Name" editable={!confirmed} />
    {(["cash", "bankAccount", "savingsAccount", "creditCard", "loan", "receivable", "investment", "personalDebt"] as const).map(productKind => <Choice key={productKind} label={({ cash: "Cash", bankAccount: "Bank account", savingsAccount: "Savings account", creditCard: "Card", loan: "Loan", receivable: "Money owed to you", investment: "Investment", personalDebt: "Money you owe a person" })[productKind]}
      selected={kind === productKind} disabled={confirmed !== null} onPress={() => setKind(productKind)} />)}
    {(kind === "receivable" || kind === "personalDebt" || kind === "investment") && <Input accessibilityLabel={kind === "receivable" ? "Who owes you" : kind === "personalDebt" ? "Who you owe" : "Investment operator, optional"} value={counterparty} onChangeText={setCounterparty} editable={!confirmed} />}
    {kind === "receivable" && <>
      <Choice label="Backed by real collateral" selected={security === "secured"} disabled={confirmed !== null} onPress={() => setSecurity("secured")} />
      <Choice label="No collateral" selected={security === "unsecured"} disabled={confirmed !== null} onPress={() => setSecurity("unsecured")} />
    </>}
    {kind === "investment" && <>
      <Choice label="Term deposit" selected={investment === "termDeposit"} disabled={confirmed !== null} onPress={() => setInvestment("termDeposit")} />
      <Choice label="Investment fund" selected={investment === "fund"} disabled={confirmed !== null} onPress={() => setInvestment("fund")} />
    </>}
    <Input accessibilityLabel={kind === "creditCard" || kind === "loan" || kind === "personalDebt" ? "Amount owed" : "Amount held"} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" editable={!confirmed} />
    <Input accessibilityLabel="Start tracking date" value={date} onChangeText={setDate} editable={!confirmed} />
    {error && <Copy title="Setup needs another check" detail="Unlock online and retry the same confirmed facts." />}
    <PrimaryButton label="Start tracking" disabled={!name.trim() || value === null || !validAccountingDate(date) || ((kind === "receivable" || kind === "personalDebt") && !counterparty.trim())} loading={busy} onPress={() => { void setup(); }} />
  </Screen>;
}
