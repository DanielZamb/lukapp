import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { ConfirmationScreen, Screen } from "../../ui/core";
import { api } from "../api";
import { movedCopy, recoveryMoney, type RecoveryCandidate } from "./model";
import {
  RecoveryActivated,
  RecoveryCandidates,
  RecoveryDraft,
  RecoveryMoveScreen,
  RecoveryPlanList,
  RecoveryPlanScreen,
} from "./RecoveryScreens";
import { useRecoveryEditor, type RecoveryEditorSeed } from "./useRecoveryEditor";
import { useRecoveryMove } from "./useRecoveryMove";

type View =
  | { name: "entry" }
  | { name: "candidates"; parentPlanId: string | null }
  | { name: "draft"; key: string; candidate: RecoveryCandidate; parentPlanId: string | null }
  | { name: "activated"; title: string; installmentMinorUnits: number; currency: string; activationMonth: string }
  | { name: "plan"; id: string }
  | { name: "move"; key: string; id: string }
  | {
    name: "moved";
    planId: string;
    title: string;
    movedMinorUnits: number;
    countedMinorUnits: number;
    currency: string;
  };

export function Recovery({ workspaceId, onBack, onViewPlans, onHome }: {
  workspaceId: string;
  onBack: () => void;
  onViewPlans: () => void;
  onHome: () => void;
}) {
  const [refreshKey, refresh] = useState(Crypto.randomUUID);
  const [view, setView] = useState<View>({ name: "entry" });
  const board = useQuery(api.savingsRecovery.evaluate, { workspaceId, refreshKey });
  const interact = useLocalEntryInteraction();
  const back = () => {
    if (view.name === "candidates" && view.parentPlanId) {
      setView({ name: "plan", id: view.parentPlanId });
    } else if (view.name === "plan" && board && board.plans.length > 1) {
      setView({ name: "entry" });
    } else if (view.name !== "activated" && view.name !== "moved") {
      onBack();
    }
  };
  useRecoveryBack(
    view.name === "activated" || view.name === "moved"
      || (view.name === "candidates" && view.parentPlanId !== null)
      || (view.name === "plan" && !!board && board.plans.length > 1)
      ? back : null,
  );
  if (!board) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
  if (view.name === "draft") {
    return (
      <Draft
        key={view.key}
        seed={{
          workspaceId,
          currency: board.currency,
          candidate: view.candidate,
          destinations: board.destinations,
        }}
        onClose={() => setView({ name: "candidates", parentPlanId: view.parentPlanId })}
        onSaved={(receipt) => {
          refresh(Crypto.randomUUID());
          setView({
            name: "activated",
            title: receipt.plan.title,
            installmentMinorUnits: receipt.plan.installmentMinorUnits,
            currency: receipt.plan.currency,
            activationMonth: receipt.plan.activationMonth,
          });
        }}
      />
    );
  }
  if (view.name === "activated") {
    return (
      <RecoveryActivated {...view} onViewPlans={onViewPlans} onHome={onHome} />
    );
  }
  if (view.name === "moved") {
    const live = board.plans.find((item) => item.id === view.planId);
    if (!live) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <ConfirmationScreen
        title={`${recoveryMoney({ currency: view.currency, minorUnits: view.movedMinorUnits })} moved`}
        detail={movedCopy({
          currency: view.currency,
          title: view.title,
          movedMinorUnits: view.movedMinorUnits,
          countedMinorUnits: view.countedMinorUnits,
          recoveredMinorUnits: live.recoveredMinorUnits,
          targetMinorUnits: live.targetMinorUnits,
        })}
        buttonLabel="View recovery plan"
        onContinue={() => setView({ name: "plan", id: view.planId })}
      />
    );
  }
  if (view.name === "move") {
    const plan = board.plans.find((item) => item.id === view.id);
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <Move
        key={view.key}
        workspaceId={workspaceId}
        plan={plan}
        sources={board.sources}
        onClose={() => setView({ name: "plan", id: plan.id })}
        onMoved={(receipt) => {
          refresh(Crypto.randomUUID());
          setView({
            name: "moved",
            planId: plan.id,
            title: plan.title,
            movedMinorUnits: receipt.transfer.amount.minorUnits,
            countedMinorUnits: receipt.contribution.amountMinorUnits,
            currency: plan.currency,
          });
        }}
      />
    );
  }
  if (view.name === "plan" || (view.name === "entry" && board.plans.length === 1)) {
    const plan = view.name === "plan" ? board.plans.find((item) => item.id === view.id) : board.plans[0];
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <RecoveryPlanScreen
        plan={plan}
        month={board.currentMonth}
        onBack={back}
        onMove={() => { interact(); setView({ name: "move", key: Crypto.randomUUID(), id: plan.id }); }}
        onFind={() => setView({ name: "candidates", parentPlanId: plan.id })}
      />
    );
  }
  if (view.name === "entry" && board.plans.length > 1) {
    return <RecoveryPlanList plans={board.plans} onBack={back} onPlan={(id) => {
      interact();
      setView({ name: "plan", id });
    }} />;
  }
  const parentPlanId = view.name === "candidates" ? view.parentPlanId : null;
  return (
    <RecoveryCandidates
      currency={board.currency}
      month={board.currentMonth}
      candidates={board.candidates}
      onBack={back}
      onStart={(candidate) => {
        interact();
        setView({ name: "draft", key: Crypto.randomUUID(), candidate, parentPlanId });
      }}
    />
  );
}

function Draft({
  seed, onClose, onSaved,
}: {
  seed: RecoveryEditorSeed;
  onClose: () => void;
  onSaved: Parameters<typeof useRecoveryEditor>[1]["onSaved"];
}) {
  const save = useAction(api.savingsRecovery.activatePlan);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const editor = useRecoveryEditor(seed, { save, reportFailure, newKey: Crypto.randomUUID, onSaved });
  const back = () => { if (editor.canDismiss) onClose(); };
  useRecoveryBack(back);
  return (
    <RecoveryDraft
      candidate={seed.candidate}
      currency={seed.currency}
      destinations={seed.destinations}
      {...editor}
      onMonths={(count) => { interact(); editor.onMonths(count); }}
      onAmount={(value) => { interact(); editor.onAmount(value); }}
      onDestination={(id) => { interact(); editor.onDestination(id); }}
      onSave={() => { interact(); void editor.submit(); }}
      onBack={back}
    />
  );
}

function Move({
  workspaceId, plan, sources, onClose, onMoved,
}: {
  workspaceId: string;
  plan: Parameters<typeof useRecoveryMove>[0]["plan"];
  sources: Parameters<typeof useRecoveryMove>[0]["sources"];
  onClose: () => void;
  onMoved: Parameters<typeof useRecoveryMove>[1]["onMoved"];
}) {
  const contribute = useAction(api.savingsRecovery.recordContribution);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const move = useRecoveryMove({ workspaceId, plan, sources }, {
    move: contribute, reportFailure, newKey: Crypto.randomUUID, onMoved,
  });
  const back = () => { if (move.canDismiss) onClose(); };
  useRecoveryBack(back);
  return (
    <RecoveryMoveScreen
      plan={plan}
      sources={sources}
      {...move}
      onSource={(id) => { interact(); move.onSource(id); }}
      onAmount={(value) => { interact(); move.onAmount(value); }}
      submit={async () => { interact(); await move.submit(); }}
      onBack={back}
    />
  );
}

function useRecoveryBack(onBack: (() => void) | null) {
  const navigation = useNavigation();
  usePreventRemove(onBack !== null, ({ data }) => {
    if (data.action.type === "GO_BACK" || data.action.type === "POP") onBack?.();
    else navigation.dispatch(data.action);
  });
}
