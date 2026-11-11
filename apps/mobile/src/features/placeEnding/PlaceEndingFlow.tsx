import { usePreventRemove } from "@react-navigation/native";
import { useAction, useQuery } from "convex/react";
import * as Crypto from "expo-crypto";
import { useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { formatLongDate, useT, type MessageKey } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { amountOfMinorUnits, openAmount, type AmountSession } from "../amount/session";
import { useAmountState } from "../amount/useAmountState";
import { api } from "../api";
import { formatMoney } from "../money";
import { refusalCodeOf, useFrozenCommand } from "../useFrozenCommand";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import {
  answerSpec, balanceCase, blockerView, categoryChoice, closeRequest, everyPlace, keepAllowed, lineComplete, placeChoice, refusalMessage, refusalOf,
  remainingMinorUnits, sameMoney, staleNotice, typedNameMatches, undoRequest, workspaceDay,
  type Act, type Answer, type Blocker, type ChoiceView, type CloseReceipt, type CloseRequest, type LineDraft, type Reviewed,
  type SourceBlocker, type StaleNotice, type UndoReceipt, type UndoRequest,
} from "./model";
import {
  BlockersScreen, ChooseScreen, DefaultScreen, EndedScreen, LinesScreen, LoadingScreen, PickScreen, ReceiptScreen, ReviewScreen,
  UndoConfirmScreen, UnreadableScreen, UnresolvedScreen, type PickOption,
} from "./PlaceEndingScreens";
import { useSourceBlocker } from "./sources";
import { useUnresolvedEnding, type UnresolvedEnding } from "./unresolved";

/** A resent request refused as stale was never recorded; the person starts a fresh review. */
const staleResend: Record<string, MessageKey> = {
  place_close_balance_stale: "placeEnding.unresolvedStaleBalance",
  place_close_date_stale: "placeEnding.unresolvedStaleDate",
  place_undo_preview_stale: "placeEnding.unresolvedStaleUndo",
};

type Step =
  | { name: "choose" }
  | { name: "default" }
  | { name: "lines" }
  | { name: "pick"; lineId: string }
  | { name: "review" }
  | { name: "confirm" };

export type PlaceEndingProps = {
  workspaceId: string;
  profileId: string;
  /** The workspace's time zone, for the day a closing is recorded on. */
  timeZone: string;
  /** Returns to the account page that opened the flow. */
  onBack: () => void;
  /** After the Place has closed: returns to the Places list. */
  onEnded: () => void;
  /** After Undo has started: returns to the account page, which follows its progress. */
  onStarted: () => void;
  /** Opens the notification sources screen; coming back returns to the same step. */
  onSources: () => void;
};

/** After a balance change, the person is returned to the step that depends on it; the steps before it stay. */
function restack(steps: Step[], zero: boolean): Step[] {
  const at = steps[steps.length - 1]!.name;
  if (at === "choose" || at === "default") return steps;
  return [...steps.filter((step) => step.name === "choose" || step.name === "default"), zero ? { name: "review" } : { name: "lines" }];
}

/**
 * Ending a Place: choosing Close or Undo, clearing what blocks it, choosing a new Default Place when needed and,
 * for Close, saying where the money went. Each step returns to the one before it; a sent command whose outcome
 * is unknown locks the flow until it is retried with the same request.
 *
 * A confirmation belongs to the values on screen. Close binds the balance and day it shows and Undo binds the
 * preview fingerprint of the numbers it shows; when either changes underneath, the confirmation is withdrawn and the
 * person is told what changed before confirming again.
 */
export function PlaceEndingFlow({ workspaceId, profileId, timeZone, onBack, onEnded, onStarted, onSources }: PlaceEndingProps) {
  const translator = useT();
  const { t, language } = translator;
  const interact = useLocalEntryInteraction();
  const navigation = useNavigation();
  const reportFailure = useDeviceAccessFailure();
  const calendar = useWorkspaceCalendar(timeZone);
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId, ...everyPlace });
  const closure = useQuery(api.accounting.placeClosure, { workspaceId, financialAccountProfileId: profileId });
  const [act, setAct] = useState<Act | null>(null);
  const [steps, setSteps] = useState<Step[]>([{ name: "choose" }]);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [lines, setLines, readLines] = useAmountState<LineDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [receipt, setReceipt] = useState<CloseReceipt | null>(null);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [notice, setNotice] = useState<StaleNotice | null>(null);
  const [shownPreview, setShownPreview] = useState<string | null>(null);
  const [previewChanged, setPreviewChanged] = useState(false);
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null);
  const [sendBlock, setSendBlock] = useState<SourceBlocker | null>(null);
  const nextLine = useRef(0);
  const leaving = useRef(false);
  const categories = useQuery(api.accounting.listUserCategories, act === "close" ? { workspaceId } : "skip");
  const preview = useQuery(api.accounting.previewUndoPlace, act === "undo" ? { workspaceId, financialAccountProfileId: profileId, cursor: null } : "skip");
  const { blocker: sources, atSend: sourcesAtSend } = useSourceBlocker(workspaceId, profileId);
  const refusal = useRef<ReturnType<typeof refusalOf>>(null);
  const refusalCode = (error: unknown) => { refusal.current = refusalOf(error); return refusal.current?.code ?? null; };
  const unresolved = useUnresolvedEnding(workspaceId, profileId);
  const pending = unresolved.stored && unresolved.stored !== "unreadable" ? unresolved.stored : null;
  const endedStatus = places?.find((item) => item.id === profileId)?.status;
  const { settle } = unresolved;
  useEffect(() => {
    // The backend reports the Place as ended, so whatever the stored request did, it has nothing left to do.
    if (pending && (endedStatus === "closed" || endedStatus === "undone")) void settle(pending.request).catch(() => {});
  }, [pending, endedStatus, settle]);
  /** The request is on the phone before it leaves, and forgotten only once its outcome is known. */
  async function recorded<Receipt>(ending: UnresolvedEnding, send: () => Promise<Receipt>) {
    await unresolved.keep(ending).catch(() => {});
    try {
      const receipt = await send();
      await settle(ending.request).catch(() => {});
      return receipt;
    } catch (error) {
      if (refusalCodeOf(error) !== null) await settle(ending.request).catch(() => {});
      throw error;
    }
  }
  const closeAction = useAction(api.accounting.closePlace);
  const undoAction = useAction(api.accounting.startUndoPlace);
  const close = useFrozenCommand<CloseRequest, CloseReceipt>({
    send: (request) => recorded({ act: "close", request }, () => closeAction(request)), reportFailure, refusalCode,
    onDone: (done) => { setReceipt(done); setSteps([{ name: "review" }]); },
  });
  const undo = useFrozenCommand<UndoRequest, UndoReceipt>({
    send: (request) => recorded({ act: "undo", request }, () => undoAction(request)), reportFailure, refusalCode,
    onDone: () => leave(onStarted),
  });
  const command = act === "undo" ? undo : close;
  const locked = close.frozen || undo.frozen;
  const step = steps[steps.length - 1]!;
  const place = places?.find((item) => item.id === profileId);

  /** A new request leaves only if no notification source on this phone points at the Place at this moment. */
  function clearToSend() {
    const blocked = sourcesAtSend();
    setSendBlock(blocked);
    return blocked === null;
  }
  function leave(go: () => void) {
    leaving.current = true;
    go();
  }
  function back() {
    if (locked) return;
    interact();
    if (receipt) return leave(onEnded);
    // A Place that ended or started undoing elsewhere has no step left to return to.
    if (place && place.status !== "open") return leave(onBack);
    if (command.state.name === "open" && command.state.refusal) command.release();
    if (adding) return setAdding(false);
    if (step.name === "confirm") { setShownPreview(null); setPreviewChanged(false); }
    if (step.name === "lines" || step.name === "review") setNotice(null);
    if (steps.length > 1) return setSteps((current) => current.slice(0, -1));
    leave(onBack);
  }
  usePreventRemove(locked || steps.length > 1 || adding || receipt !== null, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    if (data.action.type === "GO_BACK" || data.action.type === "POP") back();
    else if (!locked) navigation.dispatch(data.action);
  });

  const others = (places ?? []).filter((item) => item.status === "open" && item.id !== profileId);
  if (!places || !closure) return <LoadingScreen onBack={back} />;
  if (!place) return <EndedScreen title={t("placeEnding.missingTitle")} detail={t("placeEnding.missingDetail")} onBack={back} />;
  const name = place.name;
  const live: Reviewed = { balance: closure.balance, nature: closure.nature, accountingDate: workspaceDay(closure.accountingDate, calendar.date) };

  // The facts under an open Close moved: withdraw what was built on them before this render reaches the screen.
  const changed = act === "close" && reviewed && !locked && !receipt ? staleNotice(reviewed, live, notice) : null;
  if (changed && reviewed) {
    setReviewed(live);
    setNotice(changed);
    if (!sameMoney(reviewed.balance, live.balance)) {
      const situation = balanceCase(live);
      setLines(keepAllowed(lines, situation));
      setAdding(false);
      setSteps(restack(steps, situation === "zero"));
    }
    if (close.state.name === "open" && close.state.refusal) close.release();
  }
  // The Undo preview changed while its numbers were on the confirmation: those numbers and the typed name no longer count.
  if (act === "undo" && step.name === "confirm" && preview && !locked) {
    if (shownPreview === null) setShownPreview(preview.fingerprint);
    else if (preview.fingerprint !== shownPreview) {
      setShownPreview(preview.fingerprint);
      setTyped("");
      setPreviewChanged(true);
      if (undo.state.name === "open" && undo.state.refusal) undo.release();
    }
  }

  if (sendBlock && sources === null) setSendBlock(null);

  const basis = reviewed ?? live;
  const balance = basis.balance;
  const situation = balanceCase(basis);

  function sequence(chosen: Act): Step[] {
    const tail: Step[] = chosen === "undo" ? [{ name: "confirm" }] : situation === "zero" ? [{ name: "review" }] : [{ name: "lines" }, { name: "review" }];
    return closure?.requiresReplacementDefault ? [{ name: "default" }, ...tail] : tail;
  }
  function advance() {
    if (!act) return;
    interact();
    const below = steps[steps.length - 2];
    // Choosing again from a confirmation returns to that confirmation.
    if (step.name === "default" && (below?.name === "review" || below?.name === "confirm"))
      return setSteps((current) => current.slice(0, -1));
    if (step.name === "lines") setNotice(null);
    const order = sequence(act);
    const at = order.findIndex((item) => item.name === step.name);
    const next = order[at + 1];
    if (next) setSteps((current) => [...current, next]);
  }
  function choose(chosen: Act) {
    interact();
    if (close.state.name === "open" && close.state.refusal) close.release();
    if (undo.state.name === "open" && undo.state.refusal) undo.release();
    setResolvedNotice(null);
    if (chosen !== act) { setLines([]); setTyped(""); setAdding(false); }
    setAct(chosen);
    setReviewed(chosen === "close" ? live : null);
    setNotice(null);
    setShownPreview(null);
    setPreviewChanged(false);
    setSteps([{ name: "choose" }, sequence(chosen)[0]!]);
  }

  if (unresolved.stored === undefined) return <LoadingScreen onBack={back} />;
  if (unresolved.stored === "unreadable") return <UnreadableScreen onRetry={() => { interact(); unresolved.retryRead(); }} onBack={back} />;
  if (receipt) return <ReceiptScreen name={name} receipt={receipt} onDone={back} />;
  if (pending && endedStatus !== "closed" && endedStatus !== "undone") {
    const resending = pending.act === "close" ? close : undo;
    const resend = () => {
      interact();
      const outcome = pending.act === "close" ? close.submit(() => pending.request) : undo.submit(() => pending.request);
      void outcome.then((result) => {
        if (result !== "refused" || !refusal.current) return;
        const stale = staleResend[refusal.current.code];
        setResolvedNotice(stale ? t(stale) : t("placeEnding.unresolvedRefused", { reason: refusalMessage(refusal.current, pending.act, translator) }));
      });
    };
    return <UnresolvedScreen ending={pending} name={name} workspaceId={workspaceId} nature={closure.nature} places={places}
      busy={resending.busy} error={resending.state.name === "uncertain" ? t(pending.act === "undo" ? "placeEnding.undoUncertain" : "placeEnding.closeUncertain") : ""}
      onSend={resend} onBack={locked ? undefined : back} />;
  }
  if (!locked && place.status !== "open")
    return <EndedScreen title={t(place.status === "undoing" ? "placeEnding.blockUndoingTitle" : "placeEnding.blockEndedTitle")}
      detail={t(place.status === "undoing" ? "placeEnding.blockUndoingDetail" : "placeEnding.blockEndedDetail")} onBack={back} />;
  if (step.name === "choose" || !act)
    return <ChooseScreen name={name} notice={resolvedNotice} onBack={back} onClose={() => choose("close")} onUndo={() => choose("undo")} />;

  if (!locked) {
    const server = act === "undo" ? preview?.blockers : closure.blockers;
    if (server === undefined || sources === undefined) return <LoadingScreen onBack={back} />;
    const blockers: Blocker[] = [...(sources ? [sources] : []), ...server];
    if (blockers.length)
      return <BlockersScreen act={act} name={name} blockers={blockers} onBack={() => { interact(); setSteps([{ name: "choose" }]); }}
        onSources={() => { interact(); onSources(); }} onCloseInstead={() => choose("close")} />;
  }

  if (step.name === "default")
    return <DefaultScreen act={act} name={name} places={others} selected={replacement}
      onSelect={(id) => { interact(); setReplacement(id); }}
      onContinue={replacement && others.some((item) => item.id === replacement) ? advance : undefined} onBack={back} />;

  const findLine = (id: string) => readLines().find((line) => line.id === id);
  function update(id: string, change: Partial<LineDraft>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...change } : line));
  }
  const amountFor = (minorUnits: number): AmountSession => minorUnits > 0
    ? amountOfMinorUnits(balance.currency, minorUnits, { hideZeroDecimals: true }) : openAmount(balance.currency);
  function addLine(answer: Answer) {
    if (!close.canEdit()) return;
    interact();
    const current = readLines();
    const remaining = remainingMinorUnits(balance, current);
    const { kind } = answerSpec(answer);
    const only = kind === "transfer" && others.length === 1 ? { id: others[0]!.id, name: others[0]!.name } : null;
    const line: LineDraft = { id: `line-${nextLine.current++}`, answer, target: only, amount: amountFor(remaining) };
    const nextLines = [...current, line];
    setLines(nextLines);
    setAdding(false);
    if (kind === "adjustment" || only) {
      if (nextLines.length === 1 && lineComplete(line) && remainingMinorUnits(balance, nextLines) === 0) {
        setNotice(null);
        setSteps((current) => [...current, { name: "review" }]);
      }
    } else setSteps((current) => [...current, { name: "pick", lineId: line.id }]);
  }
  function pickTarget(lineId: string, option: PickOption) {
    if (!close.canEdit()) return;
    interact();
    const nextLines = readLines().map((line) => line.id === lineId ? { ...line, target: { id: option.id, name: option.label } } : line);
    setLines(nextLines);
    const rest = steps.slice(0, -1);
    const firstAnswer = rest[rest.length - 1]?.name === "lines" && nextLines.length === 1 && nextLines.every(lineComplete)
      && remainingMinorUnits(balance, nextLines) === 0;
    if (firstAnswer) setNotice(null);
    setSteps(firstAnswer ? [...rest, { name: "review" }] : rest);
  }
  const repick = (lineId: string) => { if (close.canEdit()) { interact(); setSteps((current) => [...current, { name: "pick", lineId }]); } };
  const repickDefault = () => { if (command.canEdit()) { interact(); setSteps((current) => [...current, { name: "default" }]); } };

  if (step.name === "pick") {
    const line = findLine(step.lineId);
    if (!line) return <LoadingScreen onBack={back} />;
    const { kind } = answerSpec(line.answer);
    const options: PickOption[] | undefined = kind === "transfer"
      ? others.map((item) => ({ id: item.id, label: item.name, emoji: item.emoji }))
      : categories?.filter((category) => category.nature === "Expense")
        .map((category) => ({ id: category.id, label: category.name, emoji: category.style.emoji }));
    return <PickScreen kind={kind === "transfer" ? "place" : "category"} answer={line.answer} options={options} selected={line.target?.id ?? null}
      onSelect={(option) => pickTarget(line.id, option)} onBack={back} />;
  }

  const choiceOf = (line: LineDraft): ChoiceView | null => !line.target ? null
    : answerSpec(line.answer).kind === "transfer" ? placeChoice(line.target.id, places, t, line.target.name)
    : categories ? categoryChoice(line.target, categories, t) : { label: line.target.name, unavailable: false };
  const replacementChoice = replacement ? placeChoice(replacement, places, t) : null;
  const unavailable = lines.some((line) => choiceOf(line)?.unavailable) || !!replacementChoice?.unavailable;
  const noticeLines = notice ? [
    ...(notice.balance && !sameMoney(notice.balance.from, notice.balance.to) ? [t(situation === "zero" ? "placeEnding.staleBalanceZero" : "placeEnding.staleBalance",
      { name, from: formatMoney(notice.balance.from, { hideZeroDecimals: true }), to: formatMoney(notice.balance.to, { hideZeroDecimals: true }) })] : []),
    ...(notice.date ? [t("placeEnding.staleDate", { date: formatLongDate(language, Date.parse(`${notice.date}T12:00:00Z`), "UTC") })] : []),
  ] : [];

  if (step.name === "lines")
    return <LinesScreen name={name} situation={situation} balance={balance} lines={lines} adding={adding || lines.length === 0}
      editable={!close.frozen} choiceOf={choiceOf} notice={noticeLines} blocked={unavailable}
      onAnswer={addLine} onAdd={() => { interact(); setAdding(true); }}
      onCancelAdd={() => { interact(); setAdding(false); }} onPick={repick}
      onAmount={(id, amount) => { if (close.canEdit() && amount.currency === balance.currency) { interact(); update(id, { amount }); } }}
      onRemove={(id) => { if (close.canEdit()) { interact(); setLines((current) => current.filter((line) => line.id !== id)); } }}
      onContinue={advance} onBack={back} />;

  const waiting = command.state.name === "open" && command.state.refusal !== null
    && (command.state.refusal.code === "place_close_balance_stale" || command.state.refusal.code === "place_undo_preview_stale");
  const error = command.state.name === "uncertain"
    ? t(act === "undo" ? "placeEnding.undoUncertain" : "placeEnding.closeUncertain")
    : command.state.name === "open" && command.state.refusal?.code === "place_close_date_stale"
      ? t("placeEnding.refuseDateStale", { date: formatLongDate(language, Date.parse(`${basis.accountingDate}T12:00:00Z`), "UTC") })
    : command.state.name === "open" && command.state.refusal && refusal.current ? refusalMessage(refusal.current, act, translator)
    : sendBlock ? (({ title, detail }) => `${title} ${detail}`)(blockerView(sendBlock, act, translator)) : "";

  if (step.name === "confirm") {
    const snapshot = preview?.snapshot ?? null;
    return <UndoConfirmScreen name={name} balance={balance} snapshot={snapshot} changed={previewChanged}
      replacement={replacementChoice} onRepickDefault={repickDefault} typed={typed} editable={!undo.frozen}
      onTyped={(value) => { if (undo.canEdit()) { interact(); setTyped(value); } }}
      busy={undo.busy} uncertain={undo.state.name === "uncertain"} error={error} onBack={locked ? undefined : back}
      canConfirm={!undo.busy && (undo.state.name === "uncertain"
        || (!!snapshot && !waiting && !replacementChoice?.unavailable && typedNameMatches(typed, name)))}
      onConfirm={() => {
        interact();
        if (!undo.frozen && !clearToSend()) return;
        void undo.submit(() => snapshot && typedNameMatches(typed, name) && !replacementChoice?.unavailable
          ? undoRequest({ previewFingerprint: snapshot.fingerprint, workspaceId, placeId: profileId, replacement, idempotencyKey: Crypto.randomUUID() }, t)
          : null);
      }} />;
  }

  return <ReviewScreen name={name} balance={balance} lines={lines} choiceOf={choiceOf} accountingDate={basis.accountingDate}
    notice={noticeLines} replacement={replacementChoice} unavailable={unavailable} onRepick={repick} onRepickDefault={repickDefault}
    busy={close.busy} uncertain={close.state.name === "uncertain"} error={error} onBack={locked ? undefined : back}
    canConfirm={!close.busy && (close.state.name === "uncertain" || (!unavailable && !waiting))}
    onConfirm={() => {
      interact();
      if (!close.frozen && !clearToSend()) return;
      void close.submit(() => {
        const pressed = readLines();
        return pressed.some((line) => choiceOf(line)?.unavailable) || replacementChoice?.unavailable ? null
          : closeRequest({ reviewed: basis, workspaceId, place: { id: profileId, name }, lines: pressed, replacement, idempotencyKey: Crypto.randomUUID() }, t);
      });
    }} />;
}
