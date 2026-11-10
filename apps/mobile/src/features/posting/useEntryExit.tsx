import { usePreventRemove } from "@react-navigation/native";
import { router, useNavigation } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text } from "react-native";
import { useT } from "../../i18n";
import { ConfirmSheet } from "../../ui/ConfirmSheet";
import { SecondaryButton, useUi } from "../../ui/core";
import type { DiscardOutcome } from "../discardOutcome";
import { formatMoney } from "../money";
import { displayedMinorUnits, type AmountSession } from "../amount/session";

type ExitEditor = {
  unsaved: boolean;
  draftId?: string;
  pending: boolean;
  busy: boolean;
  posted: unknown;
  description: string;
  amount: AmountSession;
  keepDraft(): Promise<string | undefined>;
  discardDraft(): Promise<DiscardOutcome | undefined>;
  discardCandidate(): Promise<DiscardOutcome | undefined>;
};
type ExitSheet = { kind: "leave"; resume: () => void } | { kind: "discard-draft" } | { kind: "discard-candidate" };

function amountLabel(amount: AmountSession) {
  const minorUnits = displayedMinorUnits(amount);
  return minorUnits ? formatMoney({ currency: amount.currency, minorUnits: Math.abs(minorUnits) }) : "";
}

/**
 * Leaving, keeping and discarding one entry. Every exit returns to the screen that opened this one.
 * Leaving with unsaved input asks first, including the iOS back swipe, which only usePreventRemove can hold.
 * A frozen posting or confirmation offers no discard.
 */
export function useEntryExit({ editor, enabled, candidateRoute, onCandidateLeave, refresh }: {
  editor: ExitEditor;
  /** False while another composer, such as the batch editor, owns the screen. */
  enabled: boolean;
  candidateRoute: boolean;
  /** Lets the Candidate review guard pass once its Candidate is discarded. */
  onCandidateLeave: () => void;
  refresh: () => Promise<unknown>;
}): { actions: ReactNode; sheet: ReactNode } {
  const { t } = useT();
  const ui = useUi();
  const navigation = useNavigation();
  const [sheet, setSheet] = useState<ExitSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const leaving = useRef(false);
  usePreventRemove(enabled && !candidateRoute && editor.unsaved, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    setFailure("");
    setSheet({ kind: "leave", resume: () => navigation.dispatch(data.action) });
  });
  useEffect(() => {
    if (editor.pending) setSheet((open) => (open?.kind === "leave" ? null : open));
  }, [editor.pending]);

  function leave(resume?: () => void) {
    leaving.current = true;
    setSheet(null);
    if (resume) resume();
    else if (router.canGoBack()) router.back();
    else router.replace("/drafts");
  }
  function open(next: ExitSheet) {
    setNotice("");
    setFailure("");
    setSheet(next);
  }
  function close() {
    if (busy) return;
    setSheet(null);
    setFailure("");
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await work();
    } catch {
      setFailure(t("drafts.discardFailed"));
    } finally {
      setBusy(false);
    }
  }
  const keep = (resume?: () => void) => run(async () => {
    if (await editor.keepDraft()) leave(resume);
    else if (resume) setFailure(t("drafts.keepFailed"));
  });
  const discardDraft = () => run(async () => {
    const outcome = await editor.discardDraft();
    if (outcome === "discarded" || outcome === "gone") return leave();
    setSheet(null);
    if (outcome === "frozen") setNotice(t("drafts.draftFrozen"));
  });
  const discardCandidate = () => run(async () => {
    const outcome = await editor.discardCandidate();
    if (outcome === "discarded" || outcome === "gone") {
      onCandidateLeave();
      return leave();
    }
    setSheet(null);
    if (outcome === "changed") setNotice(t("drafts.candidateChanged"));
    if (outcome === "frozen") setNotice(t("drafts.candidateFrozen"));
    await refresh().catch(() => {});
  });

  const amount = amountLabel(editor.amount);
  const title = editor.description.trim() || t(candidateRoute ? "drafts.unnamedCandidate" : "drafts.incompleteDraft");
  const detail = amount ? `${title} · ${amount}` : title;
  const disabled = busy || editor.busy;
  const actions = !enabled || editor.posted !== null ? null : (
    <>
      {notice ? <Text accessibilityRole="alert" style={ui.error}>{notice}</Text> : null}
      {candidateRoute && !editor.pending ? (
        <SecondaryButton label={t("drafts.discardThisCandidate")} tone="danger" disabled={disabled}
          onPress={() => open({ kind: "discard-candidate" })} />
      ) : null}
      {!candidateRoute && editor.unsaved ? (
        <SecondaryButton label={editor.draftId ? t("drafts.saveChanges") : t("drafts.keepDraft")} disabled={disabled}
          onPress={() => void keep()} />
      ) : null}
      {!candidateRoute && editor.draftId && !editor.pending ? (
        <SecondaryButton label={t("drafts.discardDraft")} tone="danger" disabled={disabled}
          onPress={() => open({ kind: "discard-draft" })} />
      ) : null}
    </>
  );
  let node: ReactNode = null;
  if (sheet?.kind === "leave") {
    const existing = !!editor.draftId;
    node = <ConfirmSheet label={t("drafts.unsavedLabel")} busy={busy} error={failure} onDismiss={close}
      title={existing ? t("drafts.leaveDraftTitle") : t("drafts.leaveNewTitle")}
      body={existing ? t("drafts.leaveDraftBody") : t("drafts.leaveNewBody")}
      actions={[
        { label: existing ? t("drafts.saveChanges") : t("drafts.keepDraft"), tone: "primary", onPress: () => void keep(sheet.resume) },
        { label: existing ? t("drafts.discardChanges") : t("common.discard"), tone: "danger", onPress: () => leave(sheet.resume) },
        { label: t("drafts.continueEditing"), onPress: close },
      ]} />;
  } else if (sheet) {
    const candidate = sheet.kind === "discard-candidate";
    node = <ConfirmSheet label={t(candidate ? "drafts.discardCandidateTitle" : "drafts.discardDraftTitle")}
      busy={busy} error={failure} onDismiss={close} detail={detail}
      title={t(candidate ? "drafts.discardCandidateTitle" : "drafts.discardDraftTitle")}
      body={t(candidate ? "drafts.discardCandidateBody" : "drafts.discardDraftBody")}
      actions={[
        { label: t("common.discard"), tone: "danger", onPress: () => void (candidate ? discardCandidate() : discardDraft()) },
        { label: t("common.cancel"), onPress: close },
      ]} />;
  }
  return { actions, sheet: node };
}
