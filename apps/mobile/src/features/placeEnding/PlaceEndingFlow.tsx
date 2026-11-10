import { usePreventRemove } from "@react-navigation/native";
import { useAction, useQuery } from "convex/react";
import * as Crypto from "expo-crypto";
import { useNavigation } from "expo-router";
import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { amountOfMinorUnits, openAmount, type AmountSession } from "../amount/session";
import { api } from "../api";
import { useFrozenCommand } from "../useFrozenCommand";
import {
  answerSpec, balanceCase, closeRequest, everyPlace, lineComplete, refusalMessage, refusalOf, remainingMinorUnits, typedNameMatches, undoRequest,
  type Act, type Answer, type Blocker, type CloseReceipt, type CloseRequest, type LineDraft, type UndoReceipt, type UndoRequest,
} from "./model";
import {
  BlockersScreen, ChooseScreen, DefaultScreen, EndedScreen, LinesScreen, LoadingScreen, PickScreen, ReceiptScreen, ReviewScreen,
  UndoConfirmScreen, type PickOption,
} from "./PlaceEndingScreens";
import { useSourceBlocker } from "./sources";
import { useUndoPreview } from "./useUndoPreview";

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
  /** Returns to the account page that opened the flow. */
  onBack: () => void;
  /** After the Place has closed: returns to the Places list. */
  onEnded: () => void;
  /** After Undo has started: returns to the account page, which follows its progress. */
  onStarted: () => void;
  /** Opens the notification sources screen; coming back returns to the same step. */
  onSources: () => void;
};

/**
 * Ending a Place: choosing Close or Undo, clearing what blocks it, choosing a new Default Place when needed and,
 * for Close, saying where the money went. Each step returns to the one before it; a sent command whose outcome
 * is unknown locks the flow until it is retried with the same request.
 */
export function PlaceEndingFlow({ workspaceId, profileId, onBack, onEnded, onStarted, onSources }: PlaceEndingProps) {
  const translator = useT();
  const { t } = translator;
  const interact = useLocalEntryInteraction();
  const navigation = useNavigation();
  const reportFailure = useDeviceAccessFailure();
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId, ...everyPlace });
  const closure = useQuery(api.accounting.placeClosure, { workspaceId, financialAccountProfileId: profileId });
  const [act, setAct] = useState<Act | null>(null);
  const [steps, setSteps] = useState<Step[]>([{ name: "choose" }]);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [receipt, setReceipt] = useState<CloseReceipt | null>(null);
  const nextLine = useRef(0);
  const leaving = useRef(false);
  const categories = useQuery(api.accounting.listUserCategories, act === "close" ? { workspaceId } : "skip");
  const preview = useUndoPreview(workspaceId, profileId, act === "undo");
  const sources = useSourceBlocker(workspaceId, profileId);
  const refusal = useRef<ReturnType<typeof refusalOf>>(null);
  const refusalCode = (error: unknown) => { refusal.current = refusalOf(error); return refusal.current?.code ?? null; };
  const close = useFrozenCommand<CloseRequest, CloseReceipt>({
    send: useAction(api.accounting.closePlace), reportFailure, refusalCode,
    onDone: (done) => { setReceipt(done); setSteps([{ name: "review" }]); },
  });
  const undo = useFrozenCommand<UndoRequest, UndoReceipt>({
    send: useAction(api.accounting.startUndoPlace), reportFailure, refusalCode,
    onDone: () => leave(onStarted),
  });
  const command = act === "undo" ? undo : close;
  const locked = close.frozen || undo.frozen;
  const step = steps[steps.length - 1]!;
  const place = places?.find((item) => item.id === profileId);

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
  const balance = closure.balance;
  const situation = balanceCase(closure);
  const name = place.name;

  function sequence(chosen: Act): Step[] {
    const tail: Step[] = chosen === "undo" ? [{ name: "confirm" }] : situation === "zero" ? [{ name: "review" }] : [{ name: "lines" }, { name: "review" }];
    return closure?.requiresReplacementDefault ? [{ name: "default" }, ...tail] : tail;
  }
  function advance() {
    if (!act) return;
    interact();
    const order = sequence(act);
    const at = order.findIndex((item) => item.name === step.name);
    const next = order[at + 1];
    if (next) setSteps((current) => [...current, next]);
  }
  function choose(chosen: Act) {
    interact();
    if (chosen !== act) { setLines([]); setTyped(""); setAdding(false); }
    setAct(chosen);
    setSteps([{ name: "choose" }, sequence(chosen)[0]!]);
  }

  if (receipt) return <ReceiptScreen name={name} receipt={receipt} onDone={back} />;
  if (!locked && place.status !== "open")
    return <EndedScreen title={t(place.status === "undoing" ? "placeEnding.blockUndoingTitle" : "placeEnding.blockEndedTitle")}
      detail={t(place.status === "undoing" ? "placeEnding.blockUndoingDetail" : "placeEnding.blockEndedDetail")} onBack={back} />;
  if (step.name === "choose" || !act)
    return <ChooseScreen name={name} onBack={back} onClose={() => choose("close")} onUndo={() => choose("undo")} />;

  if (!locked) {
    const server = act === "undo" ? preview.first?.blockers : closure.blockers;
    if (server === undefined || sources === undefined) return <LoadingScreen onBack={back} />;
    const blockers: Blocker[] = [...(sources ? [sources] : []), ...server];
    if (blockers.length)
      return <BlockersScreen act={act} name={name} blockers={blockers} onBack={() => { interact(); setSteps([{ name: "choose" }]); }}
        onSources={() => { interact(); onSources(); }} onCloseInstead={() => choose("close")} />;
  }

  if (step.name === "default")
    return <DefaultScreen act={act} name={name} places={others} selected={replacement}
      onSelect={(id) => { interact(); setReplacement(id); }} onContinue={replacement ? advance : undefined} onBack={back} />;

  const findLine = (id: string) => lines.find((line) => line.id === id);
  function update(id: string, change: Partial<LineDraft>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...change } : line));
  }
  const amountFor = (minorUnits: number): AmountSession => minorUnits > 0
    ? amountOfMinorUnits(balance.currency, minorUnits, { hideZeroDecimals: true }) : openAmount(balance.currency);
  function addLine(answer: Answer) {
    if (!close.canEdit()) return;
    interact();
    const remaining = remainingMinorUnits(balance, lines);
    const { kind } = answerSpec(answer);
    const only = kind === "transfer" && others.length === 1 ? others[0]!.id : null;
    const line: LineDraft = { id: `line-${nextLine.current++}`, answer, target: only, amount: amountFor(remaining) };
    const nextLines = [...lines, line];
    setLines(nextLines);
    setAdding(false);
    if (kind === "adjustment" || only) {
      if (nextLines.length === 1 && lineComplete(line) && remainingMinorUnits(balance, nextLines) === 0) setSteps((current) => [...current, { name: "review" }]);
    } else setSteps((current) => [...current, { name: "pick", lineId: line.id }]);
  }
  function pickTarget(lineId: string, target: string) {
    if (!close.canEdit()) return;
    interact();
    const nextLines = lines.map((line) => line.id === lineId ? { ...line, target } : line);
    setLines(nextLines);
    const done = nextLines.length === 1 && nextLines.every(lineComplete) && remainingMinorUnits(balance, nextLines) === 0;
    setSteps((current) => [...current.slice(0, -1), ...(done ? [{ name: "review" } as const] : [])]);
  }

  if (step.name === "pick") {
    const line = findLine(step.lineId);
    if (!line) return <LoadingScreen onBack={back} />;
    const { kind } = answerSpec(line.answer);
    const options: PickOption[] | undefined = kind === "transfer"
      ? others.map((item) => ({ id: item.id, label: item.name, emoji: item.emoji }))
      : categories?.filter((category) => category.nature === "Expense")
        .map((category) => ({ id: category.id, label: category.name, emoji: category.style.emoji }));
    return <PickScreen kind={kind === "transfer" ? "place" : "category"} answer={line.answer} options={options} selected={line.target}
      onSelect={(id) => pickTarget(line.id, id)} onBack={back} />;
  }

  const targetName = (line: LineDraft) => answerSpec(line.answer).kind === "transfer"
    ? places.find((item) => item.id === line.target)?.name ?? null
    : categories?.find((category) => category.id === line.target)?.name ?? null;

  if (step.name === "lines")
    return <LinesScreen name={name} situation={situation} balance={balance} lines={lines} adding={adding || lines.length === 0}
      editable={!close.frozen} targetName={targetName} onAnswer={addLine} onAdd={() => { interact(); setAdding(true); }}
      onCancelAdd={() => { interact(); setAdding(false); }}
      onPick={(id) => { interact(); setSteps((current) => [...current, { name: "pick", lineId: id }]); }}
      onAmount={(id, amount) => { if (close.canEdit() && amount.currency === balance.currency) { interact(); update(id, { amount }); } }}
      onRemove={(id) => { if (close.canEdit()) { interact(); setLines((current) => current.filter((line) => line.id !== id)); } }}
      onContinue={advance} onBack={back} />;

  const replacementName = replacement ? others.find((item) => item.id === replacement)?.name ?? null : null;
  const error = command.state.name === "uncertain"
    ? t(act === "undo" ? "placeEnding.undoUncertain" : "placeEnding.closeUncertain")
    : command.state.name === "open" && command.state.refusal && refusal.current ? refusalMessage(refusal.current, act, translator) : "";

  if (step.name === "confirm")
    return <UndoConfirmScreen name={name} balance={balance} totals={preview.totals} settled={preview.settled} failed={preview.failed}
      replacementName={replacementName} typed={typed} editable={!undo.frozen}
      onTyped={(value) => { if (undo.canEdit()) { interact(); setTyped(value); } }} onRetryPreview={preview.retry}
      busy={undo.busy} uncertain={undo.state.name === "uncertain"} error={error} onBack={locked ? undefined : back}
      canConfirm={(undo.state.name === "uncertain" || (preview.settled && typedNameMatches(typed, name))) && !undo.busy}
      onConfirm={() => {
        interact();
        void undo.submit(() => typedNameMatches(typed, name) && preview.settled
          ? undoRequest({ workspaceId, placeId: profileId, replacement, idempotencyKey: Crypto.randomUUID() }, t) : null);
      }} />;

  return <ReviewScreen name={name} balance={balance} lines={lines} targetName={targetName} accountingDate={closure.accountingDate}
    replacementName={replacementName} busy={close.busy} uncertain={close.state.name === "uncertain"} error={error}
    onBack={locked ? undefined : back}
    onConfirm={() => {
      interact();
      void close.submit(() => closeRequest({ workspaceId, place: { id: profileId, name }, balance, lines, replacement,
        idempotencyKey: Crypto.randomUUID() }, t));
    }} />;
}
