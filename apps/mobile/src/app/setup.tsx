import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Keyboard } from "react-native";
import { api } from "../../../../convex/_generated/api";
import { useRuntime } from "../access/RuntimeProvider";
import { Choice, ConfirmationScreen, Copy, Header, PrimaryButton, Screen, SecondaryButton } from "../ui";
import { Input } from "../ui/Input";
import { SpendCategoryPicker, starterSpend } from "../modules/onboarding/categories";
import { parseAmount, today } from "../modules/local-entry-drafts/money";
import { functionalCurrencyCodes } from "../../../../src/accounting/currencies";
import type { FinancialArgs } from "../../../../src/access/client";

export default function Setup() {
  const { controller } = useRuntime();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState("COP");
  const [notifications, setNotifications] = useState(false);
  const [categories, setCategories] = useState(starterSpend);
  const [amount, setAmount] = useState("");
  const [request, setRequest] = useState<FinancialArgs<"completeFirstRun"> | null>(null);
  const [complete, setComplete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let stopped = false;
    void controller.execute(async (proof, rpc) => rpc.query(api.accounting.firstRunStatus,
      await proof("accounting.firstRunStatus", { now: Date.now() }))).then(result => {
      if (stopped) return;
      if (result.kind !== "required") { router.dismissTo("/"); controller.workspace(result.workspace.id); }
      else setChecking(false);
    }).catch(() => {});
    return () => { stopped = true; };
  }, [controller]);
  const minorUnits = parseAmount(amount, currency);
  const finish = async () => {
    if (minorUnits === null) return;
    Keyboard.dismiss(); setBusy(true); setError(false);
    const facts = request ?? { functionalCurrency: currency, purchaseNotifications: notifications, categories,
      startingAmountMinorUnits: minorUnits, accountingDate: today(), now: Date.now() };
    setRequest(facts);
    try {
      const result = await controller.execute(async (proof, rpc) => rpc.mutation(api.accounting.completeFirstRun,
        await proof("accounting.completeFirstRun", facts)));
      setComplete(result.workspace.id);
    } catch { setError(true); } finally { setBusy(false); }
  };
  if (complete) return <ConfirmationScreen title="You're ready to track" detail="Your starting amount and spend categories are ready."
    action={{ label: "See my money", onPress: () => { router.dismissTo("/"); controller.workspace(complete); } }} />;
  if (checking) return <Screen><Copy title="Checking your setup" /></Screen>;
  return <Screen footer={<>
    <PrimaryButton label={step === 3 ? "Finish setup" : "Continue"} loading={busy}
      disabled={step === 0 ? !functionalCurrencyCodes.has(currency) : step === 3 ? minorUnits === null : false}
      onPress={() => { Keyboard.dismiss(); if (step === 3) void finish(); else setStep(step + 1); }} />
    <SecondaryButton label="Cancel" disabled={busy || request !== null} onPress={() => router.back()} />
  </>}>
    <Header title="Get started" back={{ label: step === 0 ? "Cancel setup" : "Previous answer", disabled: busy || request !== null, onPress: () => { if (step === 0) router.back(); else setStep(step - 1); } }} />
    {step === 0 && <>
      <Copy title="Your main currency" detail="Use one currency to track your money." />
      <Choice label="Colombian peso · COP" selected={currency === "COP"} onPress={() => setCurrency("COP")} />
      <Choice label="US dollar · USD" selected={currency === "USD"} onPress={() => setCurrency("USD")} />
      <Input accessibilityLabel="Currency code" value={currency} onChangeText={value => setCurrency(value.toUpperCase())} autoCapitalize="characters" maxLength={3} />
    </>}
    {step === 1 && <>
      <Copy title="Purchase notifications" detail="Would you like help reviewing purchases later? This preference does not enable capture. You can always enter money yourself." />
      <Choice label="Maybe later" selected={!notifications} onPress={() => setNotifications(false)} />
      <Choice label="I'd like to set it up later" selected={notifications} onPress={() => setNotifications(true)} />
    </>}
    {step === 2 && <>
      <Copy title="Your spend categories" detail="Choose from ten starters or add names of your own. These categories describe money you spend." />
      <SpendCategoryPicker value={categories} onChange={setCategories} />
    </>}
    {step === 3 && <>
      <Copy title="What you have right now" detail="Enter one starting amount, including your bank money and cash. Zero is fine." />
      <Input accessibilityLabel="Starting amount" keyboardType="decimal-pad" placeholder="0" value={amount} onChangeText={setAmount} editable={request === null} />
      <Copy title={currency} detail="Nothing is saved until you finish." />
      {error && <Copy title="Setup did not finish" detail="Unlock online and retry the same answers to check whether it completed." />}
    </>}
  </Screen>;
}
