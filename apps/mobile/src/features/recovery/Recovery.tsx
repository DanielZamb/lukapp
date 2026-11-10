import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Screen } from "../../ui/core";
import { api } from "../api";
import {
  movedCopy,
  openCancelledPlan,
  recoveryMoney,
  type RecoveryCandidate,
  type RecoveryContribution,
  type RecoveryPlanView,
} from "./model";
import { RecoveryCancelScreen, RecoveryCorrectScreen } from "./RecoveryLifecycleScreens";
import {
  RecoveryActivated,
  RecoveryCandidates,
  RecoveryDraft,
  RecoveryMoveScreen,
  RecoveryMoved,
  RecoveryPlanList,
  RecoveryPlanScreen,
  type RecoveryPlanNotice,
} from "./RecoveryScreens";
import { useRecoveryEditor, type RecoveryEditorSeed } from "./useRecoveryEditor";
import { useRecoveryCancel, useRecoveryCorrection } from "./useRecoveryLifecycle";
import { useRecoveryMove } from "./useRecoveryMove";

type CandidatesView = { name: "candidates"; parentPlanId: string | null };
type PlanView = { name: "plan"; id: string; notice?: RecoveryPlanNotice };
type View =
  | { name: "entry" }
  | CandidatesView
  | { name: "draft"; key: string; candidate: RecoveryCandidate; replacesPlanId: string | null; from: CandidatesView | PlanView }
  | { name: "activated"; title: string; installmentMinorUnits: number; currency: string; activationMonth: string }
  | PlanView
  | { name: "move"; key: string; id: string }
  | { name: "cancel"; key: string; id: string }
  | { name: "correct"; key: string; id: string; contributionId: string }
  | {
    name: "moved";
    planId: string;
    title: string;
    movedMinorUnits: number;
    countedMinorUnits: number;
    currency: string;
  };

export function Recovery({ workspaceId, timeZone, onBack, onViewPlans, onHome }: {
  workspaceId: string;
  timeZone: string;
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
          replacesPlanId: view.replacesPlanId,
        }}
        onClose={() => setView(view.from)}
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
      <RecoveryMoved
        title={`${recoveryMoney({ currency: view.currency, minorUnits: view.movedMinorUnits })} moved`}
        detail={movedCopy({
          currency: view.currency,
          title: view.title,
          movedMinorUnits: view.movedMinorUnits,
          countedMinorUnits: view.countedMinorUnits,
          recoveredMinorUnits: live.recoveredMinorUnits,
          targetMinorUnits: live.targetMinorUnits,
        })}
        onViewPlan={() => setView({ name: "plan", id: view.planId })}
        onHome={onHome}
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
        timeZone={timeZone}
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
  if (view.name === "cancel") {
    const plan = board.plans.find((item) => item.id === view.id);
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <Cancel
        key={view.key}
        workspaceId={workspaceId}
        plan={plan}
        onClose={() => setView({ name: "plan", id: plan.id })}
        onCancelled={() => {
          refresh(Crypto.randomUUID());
          setView({ name: "plan", id: plan.id, notice: "cancelled" });
        }}
      />
    );
  }
  if (view.name === "correct") {
    const plan = board.plans.find((item) => item.id === view.id);
    const contribution = plan?.contributionHistory.find((item) => item.id === view.contributionId);
    if (!plan || !contribution) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    return (
      <Correct
        key={view.key}
        workspaceId={workspaceId}
        plan={plan}
        plans={board.plans}
        contribution={contribution}
        onClose={() => setView({ name: "plan", id: plan.id })}
        onCorrected={() => {
          refresh(Crypto.randomUUID());
          setView({ name: "plan", id: plan.id, notice: "corrected" });
        }}
      />
    );
  }
  if (view.name === "plan" || (view.name === "entry" && board.plans.length === 1)) {
    const plan = view.name === "plan" ? board.plans.find((item) => item.id === view.id) : board.plans[0];
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel="Loading Recovery" /></Screen>;
    const replacement = board.candidates.find((item) => item.journalEntryId === plan.sourceJournalEntryId) ?? null;
    return (
      <RecoveryPlanScreen
        plan={plan}
        plans={board.plans}
        month={board.currentMonth}
        timeZone={timeZone}
        replacement={replacement}
        notice={view.name === "plan" ? view.notice : undefined}
        onBack={back}
        onMove={() => { interact(); setView({ name: "move", key: Crypto.randomUUID(), id: plan.id }); }}
        onFind={() => setView({ name: "candidates", parentPlanId: plan.id })}
        onCancel={() => { interact(); setView({ name: "cancel", key: Crypto.randomUUID(), id: plan.id }); }}
        onReplace={() => {
          if (!replacement) return;
          interact();
          setView({
            name: "draft", key: Crypto.randomUUID(), candidate: replacement,
            replacesPlanId: plan.id, from: { name: "plan", id: plan.id },
          });
        }}
        onPlan={(id) => { interact(); setView({ name: "plan", id }); }}
        onFix={(contributionId) => {
          interact();
          setView({ name: "correct", key: Crypto.randomUUID(), id: plan.id, contributionId });
        }}
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
        setView({
          name: "draft", key: Crypto.randomUUID(), candidate,
          replacesPlanId: openCancelledPlan(board.plans, candidate.journalEntryId)?.id ?? null,
          from: { name: "candidates", parentPlanId },
        });
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
      replacing={!!seed.replacesPlanId}
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
  workspaceId, timeZone, plan, sources, onClose, onMoved,
}: {
  workspaceId: string;
  timeZone: string;
  plan: Parameters<typeof useRecoveryMove>[0]["plan"];
  sources: Parameters<typeof useRecoveryMove>[0]["sources"];
  onClose: () => void;
  onMoved: Parameters<typeof useRecoveryMove>[1]["onMoved"];
}) {
  const contribute = useAction(api.savingsRecovery.recordContribution);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const move = useRecoveryMove({ workspaceId, timeZone, plan, sources }, {
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

function Cancel({
  workspaceId, plan, onClose, onCancelled,
}: {
  workspaceId: string;
  plan: RecoveryPlanView;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const cancel = useAction(api.savingsRecovery.cancelPlan);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const form = useRecoveryCancel({ workspaceId, plan }, { cancel, reportFailure, newKey: Crypto.randomUUID, onCancelled });
  const back = () => { if (form.canDismiss) onClose(); };
  useRecoveryBack(back);
  return (
    <RecoveryCancelScreen
      plan={plan}
      {...form}
      onReason={(value) => { interact(); form.onReason(value); }}
      onConfirm={() => { interact(); void form.submit(); }}
      onBack={back}
    />
  );
}

function Correct({
  workspaceId, plan, plans, contribution, onClose, onCorrected,
}: {
  workspaceId: string;
  plan: RecoveryPlanView;
  plans: RecoveryPlanView[];
  contribution: RecoveryContribution;
  onClose: () => void;
  onCorrected: () => void;
}) {
  const correct = useAction(api.savingsRecovery.correctContribution);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const form = useRecoveryCorrection({ workspaceId, plan, plans, contribution }, {
    correct, reportFailure, newKey: Crypto.randomUUID, onCorrected,
  });
  const back = () => { if (form.canDismiss) onClose(); };
  useRecoveryBack(back);
  return (
    <RecoveryCorrectScreen
      plan={plan}
      contribution={contribution}
      {...form}
      onTarget={(target) => { interact(); form.onTarget(target); }}
      onReason={(value) => { interact(); form.onReason(value); }}
      onSave={() => { interact(); void form.submit(); }}
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
