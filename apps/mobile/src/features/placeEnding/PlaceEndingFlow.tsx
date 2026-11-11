import { usePreventRemove } from "@react-navigation/native";
import { useAction, useQuery } from "convex/react";
import * as Crypto from "expo-crypto";
import { useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { formatLongDate, useT, type MessageKey } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { amountOfMinorUnits, openAmount, type AmountSession } from "../amount/session";
import { useFormState, withFields } from "../amount/useAmountState";
import { api } from "../api";
import { formatMoney } from "../money";
import { useFrozenCommand, type CommandState } from "../useFrozenCommand";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import {
  answerSpec, balanceCase, blockerView, categoryChoice, closeRequest, everyPlace, heldReason, keepAllowed, lineComplete, placeChoice, refusalMessage,
  refusalOf, remainingMinorUnits, sameMoney, settlesEnding, staleNotice, typedNameMatches, undoRequest, workspaceDay,
  type Act, type Answer, type Blocker, type ChoiceView, type CloseReceipt, type CloseRequest, type LineDraft, type Reviewed,
  type SourceBlocker, type StaleNotice, type UndoReceipt, type UndoRequest,
} from "./model";
import {
  BlockersScreen, ChooseScreen, DefaultScreen, EndedScreen, LinesScreen, LoadingScreen, PickScreen, ReceiptScreen, ReviewScreen,
  UndoConfirmScreen, UnreadableScreen, UnresolvedScreen, type PickOption,
} from "./PlaceEndingScreens";
import { useSourceBlocker } from "./sources";
import { useUndoPreview } from "./undoPreview";
import { useUnresolvedEnding } from "./unresolved";

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

/** The person's answers and where they are in the flow, read once by a press. */
type Flow = {
  act: Act | null;
  steps: Step[];
  adding: boolean;
  replacement: string | null;
  lines: LineDraft[];
  typed: string;
  /** The balance and day the Close answers settle, as reviewed. */
  reviewed: Reviewed | null;
  receipt: CloseReceipt | null;
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
  const [flow, setFlow, readFlow] = useFormState<Flow>({
    act: null, steps: [{ name: "choose" }], adding: false, replacement: null, lines: [], typed: "", reviewed: null, receipt: null,
  });
  const change = (patch: Partial<Flow>) => setFlow((now) => withFields(now, patch));
  const moveSteps = (next: (steps: Step[]) => Step[]) => setFlow((now) => ({ ...now, steps: next(now.steps) }));
  const { act, steps, adding, replacement, lines, typed, reviewed, receipt } = flow;
  const [notice, setNotice] = useState<StaleNotice | null>(null);
  /** The preview whose numbers are on the confirmation, and the workspace month the server read it in. */
  const [shownPreview, setShownPreview] = useState<{ fingerprint: string; month: string } | null>(null);
  /** Why those numbers were refreshed under the person, if they were. */
  const [previewChanged, setPreviewChanged] = useState<MessageKey | null>(null);
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null);
  const [sendBlock, setSendBlock] = useState<SourceBlocker | null>(null);
  const nextLine = useRef(0);
  const leaving = useRef(false);
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
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
  // The request is on the phone before it leaves, or it doesn't leave; the command forgets it once its outcome is known.
  const close = useFrozenCommand<CloseRequest, CloseReceipt>({
    send: useAction(api.accounting.closePlace), reportFailure, refusalCode,
    settles: settlesEnding, keep: (request) => unresolved.keep({ act: "close", request }), forget: settle,
    onDone: (done) => change({ receipt: done, steps: [{ name: "review" }] }),
  });
  const undo = useFrozenCommand<UndoRequest, UndoReceipt>({
    send: useAction(api.accounting.startUndoPlace), reportFailure, refusalCode,
    settles: settlesEnding, keep: (request) => unresolved.keep({ act: "undo", request }), forget: settle,
    onDone: () => leave(onStarted),
  });
  // The preview is asked for again in a new month, and after a Start refused as stale, which a subscription alone misses.
  const staleStart = undo.state.name === "open" && undo.state.refusal?.code === "place_undo_preview_stale"
    ? undo.state.refusal.request.idempotencyKey : null;
  const [renewedFor, setRenewedFor] = useState("");
  if (staleStart !== null && staleStart !== renewedFor) setRenewedFor(staleStart);
  const { preview, renewed } = useUndoPreview(act === "undo" ? { workspaceId, financialAccountProfileId: profileId } : null,
    `${calendar.month} ${renewedFor}`);
  /** The unknown-outcome message, and why the latest retry was turned away if it was. */
  const uncertainMessage = (ending: Act, state: CommandState<unknown>) => state.name !== "uncertain" ? ""
    : [t(ending === "undo" ? "placeEnding.undoUncertain" : "placeEnding.closeUncertain"), ...(state.refusal ? [heldReason(state.refusal, translator)] : [])].join(" ");
  const command = act === "undo" ? undo : close;
  const locked = close.frozen || undo.frozen;
  const lockedNow = () => !close.canEdit() || !undo.canEdit();
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
    if (lockedNow()) return;
    interact();
    const now = readFlow();
    if (now.receipt) return leave(onEnded);
    // A Place that ended or started undoing elsewhere has no step left to return to.
    if (place && place.status !== "open") return leave(onBack);
    if (now.act === "undo") undo.dismissRefusal(); else close.dismissRefusal();
    if (now.adding) return change({ adding: false });
    const at = now.steps[now.steps.length - 1]!;
    if (at.name === "confirm") { setShownPreview(null); setPreviewChanged(null); }
    if (at.name === "lines" || at.name === "review") setNotice(null);
    if (now.steps.length > 1) return moveSteps((current) => current.slice(0, -1));
    leave(onBack);
  }
  usePreventRemove(locked || steps.length > 1 || adding || receipt !== null, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    if (data.action.type === "GO_BACK" || data.action.type === "POP") back();
    else if (!lockedNow()) navigation.dispatch(data.action);
  });

  const others = (places ?? []).filter((item) => item.status === "open" && item.id !== profileId);
  if (!places || !closure) return <LoadingScreen onBack={back} />;
  if (!place) return <EndedScreen title={t("placeEnding.missingTitle")} detail={t("placeEnding.missingDetail")} onBack={back} />;
  const name = place.name;
  const live: Reviewed = { balance: closure.balance, nature: closure.nature, accountingDate: workspaceDay(closure.accountingDate, calendar.date) };

  // The facts under an open Close moved: withdraw what was built on them before this render reaches the screen.
  const changed = act === "close" && reviewed && !locked && !receipt ? staleNotice(reviewed, live, notice) : null;
  if (changed && reviewed) {
    setNotice(changed);
    const situation = balanceCase(live);
    change({ reviewed: live, ...(sameMoney(reviewed.balance, live.balance) ? {}
      : { lines: keepAllowed(lines, situation), adding: false, steps: restack(steps, situation === "zero") }) });
    if (close.state.name === "open" && close.state.refusal) close.release();
  }
  // The Undo preview changed while its numbers were on the confirmation: those numbers and the typed name no longer count.
  if (act === "undo" && step.name === "confirm" && preview && !locked) {
    const month = preview.closure.accountingDate.slice(0, 7);
    if (shownPreview === null) setShownPreview({ fingerprint: preview.fingerprint, month });
    else if (preview.fingerprint !== shownPreview.fingerprint) {
      setShownPreview({ fingerprint: preview.fingerprint, month });
      change({ typed: "" });
      setPreviewChanged(month === shownPreview.month ? "placeEnding.undoChanged" : "placeEnding.undoMonthChanged");
      if (undo.state.name === "open" && undo.state.refusal) undo.release();
    } else if (staleStart !== null && staleStart === renewedFor && renewed) {
      // The preview read afresh for this refusal shows the same numbers: say so and let Start be tried again.
      setPreviewChanged("placeEnding.undoUnchanged");
      undo.release();
    }
  }

  if (sendBlock && sources === null) setSendBlock(null);

  const basis = reviewed ?? live;
  const balance = basis.balance;
  const situation = balanceCase(basis);

  /** The steps of `chosen`; a Close of a zero balance has no answers to give. */
  function sequence(chosen: Act, basisNow: Reviewed | null): Step[] {
    const zero = basisNow !== null && balanceCase(basisNow) === "zero";
    const tail: Step[] = chosen === "undo" ? [{ name: "confirm" }] : zero ? [{ name: "review" }] : [{ name: "lines" }, { name: "review" }];
    return closure?.requiresReplacementDefault ? [{ name: "default" }, ...tail] : tail;
  }
  function advance() {
    const now = readFlow();
    if (!now.act) return;
    interact();
    const at = now.steps[now.steps.length - 1]!;
    const below = now.steps[now.steps.length - 2];
    // Choosing again from a confirmation returns to that confirmation.
    if (at.name === "default" && (below?.name === "review" || below?.name === "confirm"))
      return moveSteps((current) => current.slice(0, -1));
    if (at.name === "lines") setNotice(null);
    const order = sequence(now.act, now.reviewed);
    const next = order[order.findIndex((item) => item.name === at.name) + 1];
    if (next) moveSteps((current) => [...current, next]);
  }
  function choose(chosen: Act) {
    interact();
    close.dismissRefusal();
    undo.dismissRefusal();
    setResolvedNotice(null);
    const basisNow = chosen === "close" ? live : null;
    change({
      ...(chosen !== readFlow().act ? { lines: [], typed: "", adding: false } : {}),
      act: chosen, reviewed: basisNow, steps: [{ name: "choose" }, sequence(chosen, basisNow)[0]!],
    });
    setNotice(null);
    setShownPreview(null);
    setPreviewChanged(null);
  }

  if (unresolved.stored === undefined) return <LoadingScreen onBack={back} />;
  if (unresolved.stored === "unreadable") return <UnreadableScreen onRetry={() => { interact(); unresolved.retryRead(); }} onBack={back} />;
  if (receipt) return <ReceiptScreen name={name} receipt={receipt} onDone={back} />;
  if (pending && endedStatus !== "closed" && endedStatus !== "undone") {
    const resending = pending.act === "close" ? close : undo;
    const resend = () => {
      interact();
      const outcome = pending.act === "close" ? close.resend(pending.request) : undo.resend(pending.request);
      void outcome.then((result) => {
        if (result !== "refused" || !refusal.current) return;
        const stale = staleResend[refusal.current.code];
        setResolvedNotice(stale ? t(stale) : t("placeEnding.unresolvedRefused", { reason: refusalMessage(refusal.current, pending.act, translator) }));
      });
    };
    return <UnresolvedScreen ending={pending} name={name} workspaceId={workspaceId} nature={closure.nature} places={places}
      busy={resending.busy} error={uncertainMessage(pending.act, resending.state)}
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
      return <BlockersScreen act={act} name={name} blockers={blockers} onBack={() => { interact(); change({ steps: [{ name: "choose" }] }); }}
        onSources={() => { interact(); onSources(); }} onCloseInstead={() => choose("close")} />;
  }

  if (step.name === "default")
    return <DefaultScreen act={act} name={name} places={others} selected={replacement}
      onSelect={(id) => { interact(); change({ replacement: id }); }}
      onContinue={replacement && others.map((item) => item.id).includes(replacement) ? advance : undefined} onBack={back} />;

  const findLine = (id: string) => readFlow().lines.find((line) => line.id === id);
  function update(id: string, patch: Partial<LineDraft>) {
    setFlow((now) => ({ ...now, lines: now.lines.map((line) => line.id === id ? { ...line, ...patch } : line) }));
  }
  const amountFor = (currency: string, minorUnits: number): AmountSession => minorUnits > 0
    ? amountOfMinorUnits(currency, minorUnits, { hideZeroDecimals: true }) : openAmount(currency);
  function addLine(answer: Answer) {
    const now = readFlow();
    if (!close.canEdit() || !now.reviewed) return;
    interact();
    const owed = now.reviewed.balance;
    const { kind } = answerSpec(answer);
    const only = kind === "transfer" && others.length === 1 ? { id: others[0]!.id, name: others[0]!.name } : null;
    const line: LineDraft = { id: `line-${nextLine.current++}`, answer, target: only, amount: amountFor(owed.currency, remainingMinorUnits(owed, now.lines)) };
    const nextLines = [...now.lines, line];
    const answered = (kind === "adjustment" || only) && nextLines.length === 1 && lineComplete(line) && remainingMinorUnits(owed, nextLines) === 0;
    if (answered) setNotice(null);
    change({ lines: nextLines, adding: false, steps: answered ? [...now.steps, { name: "review" }]
      : kind === "adjustment" || only ? [...now.steps] : [...now.steps, { name: "pick", lineId: line.id }] });
  }
  /** Gives the line the Pick step is open for the option chosen there. */
  function pickTarget(option: PickOption) {
    const now = readFlow();
    const at = now.steps[now.steps.length - 1];
    if (!close.canEdit() || !now.reviewed || at?.name !== "pick") return;
    interact();
    const nextLines = now.lines.map((line) => line.id === at.lineId ? { ...line, target: { id: option.id, name: option.label } } : line);
    const rest = now.steps.slice(0, -1);
    const firstAnswer = rest[rest.length - 1]?.name === "lines" && nextLines.length === 1 && nextLines.every(lineComplete)
      && remainingMinorUnits(now.reviewed.balance, nextLines) === 0;
    if (firstAnswer) setNotice(null);
    change({ lines: nextLines, steps: firstAnswer ? [...rest, { name: "review" }] : rest });
  }
  const repick = (lineId: string) => { if (close.canEdit()) { interact(); moveSteps((current) => [...current, { name: "pick", lineId }]); } };
  const repickDefault = () => {
    if (readFlow().act === "undo" ? undo.canEdit() : close.canEdit()) { interact(); moveSteps((current) => [...current, { name: "default" }]); }
  };

  if (step.name === "pick") {
    const line = findLine(step.lineId);
    if (!line) return <LoadingScreen onBack={back} />;
    const { kind } = answerSpec(line.answer);
    const options: PickOption[] | undefined = kind === "transfer"
      ? others.map((item) => ({ id: item.id, label: item.name, emoji: item.emoji }))
      : categories?.filter((category) => category.nature === "Expense")
        .map((category) => ({ id: category.id, label: category.name, emoji: category.style.emoji }));
    return <PickScreen kind={kind === "transfer" ? "place" : "category"} answer={line.answer} options={options} selected={line.target?.id ?? null}
      onSelect={pickTarget} onBack={back} />;
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
      onAnswer={addLine} onAdd={() => { interact(); change({ adding: true }); }}
      onCancelAdd={() => { interact(); change({ adding: false }); }} onPick={repick}
      onAmount={(id, amount) => {
        if (close.canEdit() && amount.currency === readFlow().reviewed?.balance.currency) { interact(); update(id, { amount }); }
      }}
      onRemove={(id) => { if (close.canEdit()) { interact(); setFlow((now) => ({ ...now, lines: now.lines.filter((line) => line.id !== id) })); } }}
      onContinue={advance} onBack={back} />;

  const waiting = command.state.name === "open" && command.state.refusal !== null
    && (command.state.refusal.code === "place_close_balance_stale" || command.state.refusal.code === "place_undo_preview_stale");
  const error = command.state.name === "uncertain" ? uncertainMessage(act, command.state)
    : command.state.name === "unsaved" ? t("placeEnding.notSaved")
    : command.state.name === "open" && command.state.refusal?.code === "place_close_date_stale"
      ? t("placeEnding.refuseDateStale", { date: formatLongDate(language, Date.parse(`${basis.accountingDate}T12:00:00Z`), "UTC") })
    : command.state.name === "open" && command.state.refusal && refusal.current ? refusalMessage(refusal.current, act, translator)
    : sendBlock ? (({ title, detail }) => `${title} ${detail}`)(blockerView(sendBlock, act, translator)) : "";

  if (step.name === "confirm") {
    const snapshot = preview?.snapshot ?? null;
    return <UndoConfirmScreen name={name} balance={balance} snapshot={snapshot} changed={previewChanged && t(previewChanged)}
      replacement={replacementChoice} onRepickDefault={repickDefault} typed={typed} editable={!undo.frozen}
      onTyped={(value) => { if (undo.canEdit()) { interact(); change({ typed: value }); } }}
      busy={undo.busy} uncertain={undo.state.name === "uncertain"} error={error} onBack={locked ? undefined : back}
      canConfirm={!undo.busy && (undo.state.name === "uncertain"
        || (!!snapshot && !waiting && !replacementChoice?.unavailable && typedNameMatches(typed, name)))}
      onConfirm={(shown) => {
        interact();
        if (undo.canEdit() && !clearToSend()) return;
        void undo.submit(() => {
          const now = readFlow();
          return shown && typedNameMatches(now.typed, name) && !(now.replacement && placeChoice(now.replacement, places, t).unavailable)
            ? undoRequest({ previewFingerprint: shown.fingerprint, workspaceId, placeId: profileId, replacement: now.replacement,
              idempotencyKey: Crypto.randomUUID() }, t)
            : null;
        });
      }} />;
  }

  return <ReviewScreen name={name} balance={balance} lines={lines} choiceOf={choiceOf} accountingDate={basis.accountingDate}
    notice={noticeLines} replacement={replacementChoice} unavailable={unavailable} onRepick={repick} onRepickDefault={repickDefault}
    busy={close.busy} uncertain={close.state.name === "uncertain"} error={error} onBack={locked ? undefined : back}
    canConfirm={!close.busy && (close.state.name === "uncertain" || (!unavailable && !waiting))}
    onConfirm={(shown) => {
      interact();
      if (close.canEdit() && !clearToSend()) return;
      void close.submit(() => {
        const now = readFlow();
        return now.lines.some((line) => choiceOf(line)?.unavailable) || (now.replacement && placeChoice(now.replacement, places, t).unavailable) ? null
          : closeRequest({ reviewed: shown, workspaceId, place: { id: profileId, name }, lines: now.lines, replacement: now.replacement,
            idempotencyKey: Crypto.randomUUID() }, t);
      });
    }} />;
}
