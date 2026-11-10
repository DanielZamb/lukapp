import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useT } from "../../i18n";
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

type PlanView = { name: "plan"; id: string; notice?: RecoveryPlanNotice; caller?: PlanView };
type CandidatesView = { name: "candidates"; parent: PlanView | null };
type View =
  | { name: "entry" }
  | CandidatesView
  | { name: "draft"; key: string; candidate: RecoveryCandidate; replacesPlanId: string | null; from: CandidatesView | PlanView }
  | { name: "activated"; title: string; installmentMinorUnits: number; currency: string; activationMonth: string }
  | PlanView
  | { name: "move"; key: string; plan: PlanView }
  | { name: "cancel"; key: string; plan: PlanView }
  | { name: "correct"; key: string; plan: PlanView; contributionId: string }
  | {
    name: "moved";
    plan: PlanView;
    title: string;
    movedMinorUnits: number;
    countedMinorUnits: number;
    currency: string;
  };

/** A plan already open in this chain is returned to as it was; any other plan opens one step further. */
function linkedPlan(from: PlanView, id: string): PlanView {
  for (let open: PlanView | undefined = from; open; open = open.caller)
    if (open.id === id) return open;
  return { name: "plan", id, caller: from };
}

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
  const { t } = useT();
  const back = () => {
    if (view.name === "plan" && view.caller) {
      setView(view.caller);
    } else if (view.name === "candidates" && view.parent) {
      setView(view.parent);
    } else if (view.name === "plan" && board && board.plans.length > 1) {
      setView({ name: "entry" });
    } else if (view.name !== "activated" && view.name !== "moved") {
      onBack();
    }
  };
  useRecoveryBack(
    view.name === "activated" || view.name === "moved"
      || (view.name === "candidates" && view.parent !== null)
      || (view.name === "plan" && (!!view.caller || (!!board && board.plans.length > 1)))
      ? back : null,
  );
  if (!board) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
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
    const live = board.plans.find((item) => item.id === view.plan.id);
    if (!live) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
    return (
      <RecoveryMoved
        title={t("recovery.movedTitle", { amount: recoveryMoney({ currency: view.currency, minorUnits: view.movedMinorUnits }) })}
        detail={movedCopy({
          currency: view.currency,
          title: view.title,
          movedMinorUnits: view.movedMinorUnits,
          countedMinorUnits: view.countedMinorUnits,
          recoveredMinorUnits: live.recoveredMinorUnits,
          targetMinorUnits: live.targetMinorUnits,
        }, t)}
        onViewPlan={() => setView(view.plan)}
        onHome={onHome}
      />
    );
  }
  if (view.name === "move") {
    const plan = board.plans.find((item) => item.id === view.plan.id);
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
    return (
      <Move
        key={view.key}
        workspaceId={workspaceId}
        timeZone={timeZone}
        plan={plan}
        sources={board.sources}
        onClose={() => setView(view.plan)}
        onMoved={(receipt) => {
          refresh(Crypto.randomUUID());
          setView({
            name: "moved",
            plan: view.plan,
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
    const plan = board.plans.find((item) => item.id === view.plan.id);
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
    return (
      <Cancel
        key={view.key}
        workspaceId={workspaceId}
        plan={plan}
        onClose={() => setView(view.plan)}
        onCancelled={() => {
          refresh(Crypto.randomUUID());
          setView({ ...view.plan, notice: "cancelled" });
        }}
      />
    );
  }
  if (view.name === "correct") {
    const plan = board.plans.find((item) => item.id === view.plan.id);
    const contribution = plan?.contributionHistory.find((item) => item.id === view.contributionId);
    if (!plan || !contribution) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
    return (
      <Correct
        key={view.key}
        workspaceId={workspaceId}
        plan={plan}
        plans={board.plans}
        contribution={contribution}
        onClose={() => setView(view.plan)}
        onCorrected={() => {
          refresh(Crypto.randomUUID());
          setView({ ...view.plan, notice: "corrected" });
        }}
      />
    );
  }
  if (view.name === "plan" || (view.name === "entry" && board.plans.length === 1)) {
    const plan = view.name === "plan" ? board.plans.find((item) => item.id === view.id) : board.plans[0];
    if (!plan) return <Screen><ActivityIndicator accessibilityLabel={t("recovery.loading")} /></Screen>;
    const shown: PlanView = view.name === "plan" ? view : { name: "plan", id: plan.id };
    const replacement = board.candidates.find((item) => item.journalEntryId === plan.sourceJournalEntryId) ?? null;
    return (
      <RecoveryPlanScreen
        plan={plan}
        plans={board.plans}
        month={board.currentMonth}
        timeZone={timeZone}
        replacement={replacement}
        notice={shown.notice}
        onBack={back}
        onMove={() => { interact(); setView({ name: "move", key: Crypto.randomUUID(), plan: shown }); }}
        onFind={() => setView({ name: "candidates", parent: shown })}
        onCancel={() => { interact(); setView({ name: "cancel", key: Crypto.randomUUID(), plan: shown }); }}
        onReplace={() => {
          if (!replacement) return;
          interact();
          setView({
            name: "draft", key: Crypto.randomUUID(), candidate: replacement,
            replacesPlanId: plan.id, from: shown,
          });
        }}
        onPlan={(id) => { interact(); setView(linkedPlan(shown, id)); }}
        onFix={(contributionId) => {
          interact();
          setView({ name: "correct", key: Crypto.randomUUID(), plan: shown, contributionId });
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
  const parent = view.name === "candidates" ? view.parent : null;
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
          from: { name: "candidates", parent },
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
