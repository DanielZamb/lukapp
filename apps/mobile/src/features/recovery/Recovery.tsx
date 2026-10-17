import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { ConfirmationScreen, Screen } from "../../ui/core";
import { api } from "../api";
import { formatMoney } from "../money";
import { movedCopy, type RecoveryCandidate } from "./model";
import {
  RecoveryBoard,
  RecoveryDraft,
  RecoveryMoveScreen,
  RecoveryPlanScreen,
} from "./RecoveryScreens";
import { useRecoveryEditor, type RecoveryEditorSeed } from "./useRecoveryEditor";
import { useRecoveryMove } from "./useRecoveryMove";

type View =
  | { name: "board" }
  | { name: "draft"; key: string; candidate: RecoveryCandidate }
  | { name: "activated"; planId: string; title: string; installmentMinorUnits: number; currency: string }
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

export function Recovery({ workspaceId, onBack }: { workspaceId: string; onBack: () => void }) {
  const [refreshKey, refresh] = useState(Crypto.randomUUID);
  const [view, setView] = useState<View>({ name: "board" });
  const board = useQuery(api.savingsRecovery.evaluate, { workspaceId, refreshKey });
  const interact = useLocalEntryInteraction();
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
        onClose={() => setView({ name: "board" })}
        onSaved={(receipt) => {
          refresh(Crypto.randomUUID());
          setView({
            name: "activated",
            planId: receipt.plan.id,
            title: receipt.plan.title,
            installmentMinorUnits: receipt.plan.installmentMinorUnits,
            currency: receipt.plan.currency,
          });
        }}
      />
    );
  }
  if (view.name === "activated") {
    return (
      <ConfirmationScreen
        title="Recovery plan active"
        detail={`${view.title} will begin with a ${formatMoney({ currency: view.currency, minorUnits: view.installmentMinorUnits })} contribution.`}
        buttonLabel="View recovery plan"
        onContinue={() => setView({ name: "plan", id: view.planId })}
      />
    );
  }
  if (view.name === "moved") {
    const live = board.plans.find((item) => item.id === view.planId);
    if (!live) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <ConfirmationScreen
        title={`${formatMoney({ currency: view.currency, minorUnits: view.movedMinorUnits })} moved`}
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
  if (view.name === "plan") {
    const plan = board.plans.find((item) => item.id === view.id);
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <RecoveryPlanScreen
        plan={plan}
        onBack={() => setView({ name: "board" })}
        onMove={() => { interact(); setView({ name: "move", key: Crypto.randomUUID(), id: plan.id }); }}
        onFind={() => setView({ name: "board" })}
      />
    );
  }
  return (
    <RecoveryBoard
      currency={board.currency}
      plans={board.plans}
      candidates={board.candidates}
      onBack={onBack}
      onPlan={(id) => { interact(); setView({ name: "plan", id }); }}
      onStart={(candidate) => {
        interact();
        setView({ name: "draft", key: Crypto.randomUUID(), candidate });
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
      onBack={onClose}
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
  return (
    <RecoveryMoveScreen
      plan={plan}
      sources={sources}
      {...move}
      onSource={(id) => { interact(); move.onSource(id); }}
      onAmount={(value) => { interact(); move.onAmount(value); }}
      submit={async () => { interact(); await move.submit(); }}
      onBack={onClose}
    />
  );
}
