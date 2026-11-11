import { useLocalEntryInteraction } from "../src/local-auth/interaction";
import { formatLongDate, useT } from "../src/i18n";
import { CategoryPicker } from "../src/features/categories/CategoryPicker";
import type { AccountSetupRequest } from "../src/features/categories/model";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { type BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useAction, useConvex, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  View,
} from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatAmount, formatMoney, localDate } from "../src/features/money";
import { openAmount } from "../src/features/amount/session";
import { useFormState, withFields, type ReadAtPress } from "../src/features/amount/useAmountState";
import { confirmShown, sameValue, showing, type Shown } from "../src/features/confirmation";
import { categoryColor } from "../src/features/categories/appearance";
import type { Category } from "../src/features/categories/model";
import { PostingImpactSheet } from "../src/features/budget/PostingImpactSheet";
import {
  postingBudgetImpact,
  batchPostingBudgetImpact,
  type PostingBudgetImpact,
} from "../src/features/budget/postingImpact";
import { defaultAccountingDate } from "../src/features/timeZones";
import {
  ActionBar,
  CenteredMoment,
  ChoiceRow,
  Header,
  IconTile,
  Presentation,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SheetHeader,
  Text,
  useTheme,
  useUi,
} from "../src/ui/core";
import { SheetProvider } from "../src/ui/SheetProvider";
import { Sheet } from "../src/ui/Sheet";
import { PickerSheet } from "../src/ui/PickerSheet";
import { spacing } from "../src/ui/tokens";
import {
  PostingForm,
  postingDateOptions,
} from "../src/features/posting/PostingForm";
import {
  BatchNativeStack,
  batchRowFor,
} from "../src/features/posting/BatchNativeStack";
import { usePostingBatch } from "../src/features/posting/usePostingBatch";
import { PlaceSheet } from "../src/features/posting/PlaceSheet";
import { AccountSetupForm } from "../src/features/posting/AccountSetupForm";
import {
  usePostingEditor,
  type EntrySnapshot,
  type IntakeBinding,
  type PlaceDraft,
} from "../src/features/posting/usePostingEditor";
import { usePostingBatchStorage } from "../src/features/posting/postingBatchStorage";
import { usePostingTransport } from "../src/features/posting/usePostingTransport";
import { useEntryExit } from "../src/features/posting/useEntryExit";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { createCandidateBinding } from "../src/features/intake/postingBinding";
import { everyPlace, placeLabel, unavailablePlaceReason } from "../src/features/placeEnding/model";
import { NotificationCard, signedAmount } from "../src/features/intake/NotificationCard";
import {
  canPostCategories,
  needsPrimary,
} from "../src/features/categories/transactionSelection";

type Defaults = NonNullable<ReturnType<typeof usePersonalDefaults>>;
/** The entry fields a route check reads, as the editor renders them or reads them at a press. */
type EntryView = ReturnType<ReturnType<typeof usePostingEditor>["read"]> | ReturnType<typeof usePostingEditor>;
/**
 * A Budget warning before posting: for one entry, the entry as checked and the Budget month it was checked against;
 * for the batch, the queue held locked while the warning is open.
 */
type Impact =
  | { kind: "entry"; entry: EntrySnapshot; month: string; description: string; hits: PostingBudgetImpact }
  | { kind: "batch"; description: string; hits: PostingBudgetImpact };
/** What this route shows around the entry, read with `readRoute()` at a press. */
type RouteState = {
  placeTarget: "source" | "destination";
  mode: "one" | "batch";
  editingId: string | undefined;
  impact: Shown<Impact> | null;
  /** Why the last Post sent nothing, when the entry changed under its Budget check. */
  notice: "changed" | "unchecked" | null;
};
function PostMoney({
  defaults,
  subject,
  initialProfileId,
  draftId,
  candidateId,
}: {
  defaults: Defaults;
  subject: string;
  initialProfileId?: string;
  draftId?: string;
  candidateId?: string;
}) {
  const translator = useT();
  const { t, language } = translator;
  const ui = useUi();
  const navigation = useNavigation();
  const leavingCandidate = useRef(false);
  const theme = useTheme();
  const recordInteraction = useLocalEntryInteraction();
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [route, setRoute, readRoute] = useFormState<RouteState>({
    placeTarget: "source", mode: "one", editingId: undefined, impact: null, notice: null,
  });
  const routeChange = (patch: Partial<RouteState>) => setRoute((now) => withFields(now, patch));
  const { placeTarget, mode, impact, notice } = route;
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [receiptCategory, setReceiptCategory] = useState<Pick<
    Category,
    "name" | "style"
  > | null>(null);
  const categories = useQuery(api.accounting.listUserCategories, {
    workspaceId: defaults.workspace.id,
  });
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, {
    workspaceId: defaults.workspace.id,
  });
  // Pickers offer open Places only; this read names a Place a Draft or Candidate kept after it ended.
  const allProfiles = useQuery(api.accounting.listFinancialAccountProfiles, {
    workspaceId: defaults.workspace.id,
    ...everyPlace,
  });
  const dateSheet = useRef<BottomSheetModal>(null);
  const placeSheet = useRef<BottomSheetModal>(null);
  const setupSheet = useRef<BottomSheetModal>(null);
  const setupPresented = useRef(false);
  const destinationRequest = useRef<AccountSetupRequest | null>(null);
  const setupAfterPicker = useRef<Omit<PlaceDraft, "amount" | "date"> | null>(null);
  const { workspace, financialAccountProfile: defaultProfile } = defaults;
  const dateOptions = postingDateOptions(workspace.timeZone, translator);
  const drafts = useLocalEntryDrafts({
    subject,
    workspaceId: workspace.id,
  });
  const intake = useIntakeCandidates({
    subject,
    workspaceId: workspace.id,
    currency: workspace.functionalCurrency,
  });
  const confirmOne = useAction(api.notificationIntake.confirmOne);
  const [binding, setBinding] = useState<IntakeBinding | null>(null);
  const [missingCandidate, setMissingCandidate] = useState(false);
  useEffect(() => {
    if (!candidateId || intake.count === null || binding?.id === candidateId) return;
    const row = intake.service.read(candidateId);
    if (!row || row.workspaceId !== workspace.id) { setMissingCandidate(true); return; }
    setMissingCandidate(false);
    setBinding(createCandidateBinding({ service: intake.service, candidateId, workspaceId: workspace.id, dispatch: confirmOne, translator }));
  }, [candidateId, confirmOne, intake.service, intake.count, binding?.id, workspace.id, translator]);
  const [appLabel, setAppLabel] = useState<string | undefined>();
  const notificationPackage = binding?.notification?.packageName;
  useEffect(() => {
    if (!notificationPackage) return;
    let current = true;
    void intake.service.listSources().then((sources) => {
      if (current) setAppLabel(sources.find((source) => source.packageName === notificationPackage)?.label);
    }).catch(() => {});
    return () => { current = false; };
  }, [intake.service, notificationPackage]);
  const transport = usePostingTransport(subject);
  const batchStorage = usePostingBatchStorage(subject, workspace.id);
  const convex = useConvex();
  const active = useRef(true);
  const batchDecision = useRef<((allow: boolean) => void) | null>(null);
  const checking = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      batchDecision.current?.(false);
    };
  }, []);
  const batch = usePostingBatch(transport, batchStorage, async (queue) => {
    const hits = await batchPostingBudgetImpact(
      queue.map((row) => row.command),
      (input) => convex.query(api.budget.evaluate, input),
    );
    if (!active.current) return false;
    if (!hits.length) return true;
    Keyboard.dismiss();
    return new Promise<boolean>((resolve) => {
      batchDecision.current = resolve;
      routeChange({ impact: showing({ kind: "batch", description: t("posting.batchImpactTitle"), hits }) });
    });
  });
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android" || !placePickerOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        placeSheet.current?.dismiss();
        return true;
      },
    );
    return () => subscription.remove();
  }, [placePickerOpen]);
  const closeCompose = useCallback(() => {
    setComposing(false);
    routeChange({ editingId: undefined });
    setCategoryVisible(false);
    dateSheet.current?.dismiss();
    placeSheet.current?.dismiss();
    setupSheet.current?.dismiss();
  }, []);
  useEffect(() => {
    if (composing && batch.waiting) closeCompose();
  }, [composing, batch.waiting, closeCompose]);
  const editor = usePostingEditor(
    {
      workspaceId: workspace.id,
      financialAccountProfileId: initialProfileId ?? defaultProfile.id,
      currency: workspace.functionalCurrency,
      timeZone: workspace.timeZone,
    },
    transport,
    {
      drafts: candidateId ? null : drafts.port,
      draftId: candidateId ? undefined : draftId,
      intake: binding,
      intakeRoute: !!candidateId,
    },
  );
  useEffect(() => {
    if (!candidateId) return;
    return navigation.addListener("beforeRemove", (event) => {
      if (leavingCandidate.current) return;
      event.preventDefault();
      void editor.saveCandidateReview().then(() => {
        leavingCandidate.current = true;
        navigation.dispatch(event.data.action);
      }).catch((error: unknown) => { transport.reportFailure?.(error); });
    });
  }, [candidateId, navigation, editor.saveCandidateReview, transport]);
  const exit = useEntryExit({
    editor,
    enabled: mode === "one",
    candidateRoute: !!candidateId,
    onCandidateLeave: () => { leavingCandidate.current = true; },
    refresh: intake.refresh,
  });
  const profile = profiles?.find((place) => place.id === editor.profileId);
  const destination = profiles?.find(
    (place) => place.id === editor.destinationId,
  );
  const keptSource = profile ? undefined : allProfiles?.find((place) => place.id === editor.profileId);
  const keptDestination = destination || editor.entryType !== "transfer" ? undefined
    : allProfiles?.find((place) => place.id === editor.destinationId);
  const unavailablePlace = unavailablePlaceReason(keptSource, t) ?? unavailablePlaceReason(keptDestination, t);
  /** What decides whether the entry may post or join the batch, from the entry as rendered or as read at a press. */
  const checksOf = (entry: EntryView) => {
    const categoryValid = entry.entryType !== "normal"
      || (entry.categories.ids.length > 0 && canPostCategories({ ids: [...entry.categories.ids], primaryId: entry.categories.primaryId }, categories));
    const placesValid = !!profiles?.some((place) => place.id === entry.profileId)
      && (entry.entryType !== "transfer" || !!profiles?.some((place) => place.id === entry.destinationId));
    return {
      categoryValid,
      placesValid,
      completeEntry: entry.description.trim().length > 0 && categoryValid && placesValid,
      needsBudgetCheck: entry.entryType === "normal" && entry.direction === "out" && !entry.pending,
    };
  };
  const queueable = (entry: EntryView, at: Pick<RouteState, "impact"> | ReadAtPress<Pick<RouteState, "impact">>) =>
    entry.canSubmit && !entry.setup && !at.impact && checksOf(entry).completeEntry && !entry.pending && !candidateId;
  const { categoryValid, placesValid, completeEntry, needsBudgetCheck } = checksOf(editor);
  const selectedCategory = categories?.find(
    (category) =>
      category.id === (editor.categories.primaryId ?? editor.categories.ids[0]),
  );
  const budget = useQuery(
    api.budget.evaluate,
    needsBudgetCheck
      ? { workspaceId: workspace.id, month: editor.date.slice(0, 7) }
      : "skip",
  );
  const categoryEnabled = editor.entryType === "normal";
  const setup = editor.setup;
  useEffect(() => {
    if (editor.blockedByPendingPostings) router.replace("/drafts");
  }, [editor.blockedByPendingPostings]);
  useEffect(() => {
    if (candidateId) return;
    if (setup !== null && !setupPresented.current)
      setupSheet.current?.present();
    else if (setup === null && setupPresented.current)
      setupSheet.current?.dismiss();
    setupPresented.current = setup !== null;
  }, [setup, candidateId]);
  function interaction(action: () => void) {
    recordInteraction();
    action();
  }
  const sourceNote = candidateId
    ? binding?.reviewNote ?? t("posting.fromCandidate")
    : draftId
      ? t("posting.draftOnDevice")
      : undefined;
  if (candidateId && missingCandidate)
    return (
      <Presentation
        legacy={
          <Screen>
            <Header title={t("posting.title")} onBack={() => router.back()} />
            <Text preset="caption" accessibilityRole="alert" style={ui.error}>
              {t("posting.candidateMissing")}
            </Text>
          </Screen>
        }
      >
        <Screen
          footer={
            <ActionBar
              primary={{
                label: t("posting.openDrafts"),
                icon: "arrow-forward",
                onPress: () => router.replace("/drafts"),
              }}
            />
          }
        >
          <CenteredMoment
            icon="eye-off-outline"
            tone="soft"
            title={t("posting.candidateGoneTitle")}
            body={t("posting.candidateGoneBody")}
          />
        </Screen>
      </Presentation>
    );
  if (candidateId && !binding)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  const blockedReason = unavailablePlace ?? (!editor.description.trim() ? t("posting.blockedDescription")
    : !profile ? t("posting.blockedPlace")
    : editor.entryType === "transfer" && !destination ? t("posting.blockedDestination")
    : editor.entryType === "transfer" && editor.transferReviewRequired ? t("posting.blockedTransferReview")
    : !categoryValid ? t("posting.blockedCategory")
    : !editor.canSubmit ? t("posting.blockedAmount")
    : needsBudgetCheck && budget === undefined ? t("posting.checkingBudget") : undefined);
  const canQueue = queueable(editor, route);
  /**
   * Posts the entry, after checking the Budget of the month it is in, read at the press. A crossing opens the warning
   * bound to the entry as checked; an entry that changed during the check is not sent.
   */
  async function post() {
    const at = readRoute();
    if (at.mode === "batch") {
      void saveToBatch();
      return;
    }
    const entry = editor.read();
    const checks = checksOf(entry);
    if (at.impact || checking.current || !entry.canSubmit || entry.setup || (!entry.pending && !checks.completeEntry)) return;
    setReceiptCategory(categories?.find((category) => category.id === (entry.categories.primaryId ?? entry.categories.ids[0])) ?? null);
    routeChange({ notice: null });
    if (!checks.needsBudgetCheck) {
      void editor.submit();
      return;
    }
    const snapshot = editor.snapshot();
    if (!snapshot) {
      // Nothing here to check against a Budget (a held entry): submit validates and sends it, or says why not.
      void editor.submit();
      return;
    }
    const month = snapshot.date.slice(0, 7);
    checking.current = true;
    try {
      const evaluated = await convex.query(api.budget.evaluate, { workspaceId: workspace.id, month });
      if (!active.current) return;
      if (evaluated.month !== month || !sameValue(editor.snapshot(), snapshot)) {
        routeChange({ notice: "changed" });
        return;
      }
      const hits = postingBudgetImpact({ jars: evaluated.jars, categoryIds: [...snapshot.categoryIds], expenseMinorUnits: -snapshot.minorUnits });
      if (hits.length) {
        Keyboard.dismiss();
        routeChange({ impact: showing({ kind: "entry", entry: snapshot, month, description: snapshot.description, hits }) });
        return;
      }
      void editor.submit(snapshot);
    } catch (error) {
      if (active.current && !transport.reportFailure?.(error)) routeChange({ notice: "unchecked" });
    } finally {
      checking.current = false;
    }
  }
  /** Continue on the Budget warning it was shown on: the batch goes on, or the entry posts only as it was checked. */
  function continueImpact(pressed: Shown<Impact>) {
    const open = readRoute().impact;
    const current = pressed.snapshot.kind === "entry" ? { ...pressed.snapshot, entry: editor.snapshot() } : pressed.snapshot;
    const outcome = confirmShown(open, pressed, current);
    if (outcome === "stale") return;
    routeChange({ impact: null, notice: outcome === "changed" ? "changed" : null });
    if (pressed.snapshot.kind === "batch") {
      batchDecision.current?.(outcome === "confirmed");
      batchDecision.current = null;
    } else if (outcome === "confirmed") void editor.submit(pressed.snapshot.entry);
  }
  function reconsiderImpact(pressed: Shown<Impact>) {
    if (confirmShown(readRoute().impact, pressed, pressed.snapshot) === "stale") return;
    routeChange({ impact: null });
    if (pressed.snapshot.kind === "batch") {
      batchDecision.current?.(false);
      batchDecision.current = null;
    }
  }
  async function saveToBatch() {
    const at = readRoute();
    if (!queueable(editor.read(), at)) return false;
    const draft = editor.captureForBatch();
    if (!draft || !(await batch.keep(draft, at.editingId))) return false;
    editor.resetComposer();
    closeCompose();
    return true;
  }
  const form = (
    <>
      <PostingForm
        {...editor}
        error={notice ? t(notice === "changed" ? "posting.entryChanged" : "posting.budgetUnchecked") : editor.error}
        sourceNote={sourceNote}
        notification={binding?.notification ? (
          <NotificationCard
            notification={binding.notification}
            appLabel={appLabel}
            currency={workspace.functionalCurrency}
            amount={editor.amount}
            editable={editor.editable}
            onUseAmount={(minor) => interaction(() => {
              const amount = editor.readAmount();
              editor.setAmount(signedAmount(minor, amount.currency, amount, binding.originalSuggestion.direction));
            })}
            onUseDescription={(text) => interaction(() => editor.setDescription(text))}
          />
        ) : undefined}
        batchCount={batch.queue.length}
        onBatch={
          !candidateId && !editor.pending && !setup
            ? () => {
                void saveToBatch();
                routeChange({ mode: "batch" });
              }
            : undefined
        }
        saveToBatch={mode === "batch"}
        lockEntryType={editor.lockEntryType}
        currency={workspace.functionalCurrency}
        place={profile ? `${profile.emoji ?? "💰"} ${profile.name}`
          : keptSource && unavailablePlaceReason(keptSource, t) ? `${keptSource.emoji ?? "💰"} ${placeLabel(keptSource, t)}` : t("posting.pick")}
        placeLook={
          profile
            ? { name: profile.name, emoji: profile.emoji ?? "💰" }
            : undefined
        }
        destinationLook={
          destination
            ? { name: destination.name, emoji: destination.emoji ?? "💰" }
            : undefined
        }
        categoryLook={
          selectedCategory
            ? {
                name: editor.categories.ids
                  .map(
                    (id) =>
                      categories?.find((category) => category.id === id)
                        ?.name ?? t("posting.savedCategory"),
                  )
                  .join(" · "),
                emoji: selectedCategory.style.emoji,
                color: {
                  light: categoryColor(selectedCategory.style),
                  dark: categoryColor(selectedCategory.style, "dark"),
                },
              }
            : undefined
        }
        destination={
          destination
            ? `${destination.emoji ?? "💰"} ${destination.name}`
            : keptDestination && unavailablePlaceReason(keptDestination, t)
              ? `${keptDestination.emoji ?? "💰"} ${placeLabel(keptDestination, t)}` : t("posting.pick")
        }
        category={
          editor.categories.ids
            .map((id) => {
              const category = categories?.find(
                (category) => category.id === id,
              );
              return category
                ? `${category.style.emoji} ${category.name}`
                : t("posting.savedCategory");
            })
            .join(" · ") || t("posting.pick")
        }
        categoryEnabled={categoryEnabled}
        blockedReason={blockedReason}
        secondaryActions={exit.actions}
        transferReview={editor.entryType === "transfer" ? {
          required: editor.transferReviewRequired,
          canConfirm: placesValid && !!editor.destinationId && editor.destinationId !== editor.profileId,
          pair: editor.destinationId ? { from: editor.profileId, to: editor.destinationId } : undefined,
          onSwap: editor.swapTransferPlaces,
          onConfirm: editor.confirmTransferReview,
        } : undefined}
        categoryNeedsPrimary={
          categoryEnabled &&
          !!categories &&
          needsPrimary(editor.categories.ids, categories) &&
          !editor.categories.primaryId
        }
        canSubmit={
          mode === "batch"
            ? canQueue
            : !setup &&
              !impact &&
              (!needsBudgetCheck || budget !== undefined) &&
              editor.canSubmit &&
              (editor.pending || completeEntry)
        }
        date={formatLongDate(language, new Date(`${editor.date}T12:00:00`))}
        posted={
          mode !== "batch" && editor.posted
            ? t("posting.postedSummary", {
              description: editor.posted.description || t("posting.untitledEntry"),
              amount: `${editor.posted.amount.minorUnits > 0 ? "+" : ""}${formatMoney(editor.posted.amount)}`,
            })
            : null
        }
        receipt={
          mode !== "batch" && editor.posted
            ? {
                description: editor.posted.description || t("posting.untitledEntry"),
                minorUnits: editor.posted.amount.minorUnits,
                amount: formatAmount(
                  Math.abs(editor.posted.amount.minorUnits),
                  editor.posted.amount.currency,
                  { hideZeroDecimals: true },
                ),
                category: receiptCategory
                  ? {
                      name: receiptCategory.name,
                      emoji: receiptCategory.style.emoji,
                      color: {
                        light: categoryColor(receiptCategory.style),
                        dark: categoryColor(receiptCategory.style, "dark"),
                      },
                    }
                  : undefined,
              }
            : undefined
        }
        onAnother={() => interaction(() => editor.resetComposer())}
        onAmountChange={(value) => interaction(() => editor.setAmount(value))}
        onDescriptionChange={(value) =>
          interaction(() => editor.setDescription(value))
        }
        onEntryType={(value) => interaction(() => editor.setEntryType(value))}
        onBack={mode === "batch" ? closeCompose : () => router.back()}
        onPlace={() => {
          routeChange({ placeTarget: "source" });
          setSearch("");
          setPlacePickerOpen(true);
          placeSheet.current?.present();
        }}
        onDestination={() => {
          routeChange({ placeTarget: "destination" });
          setSearch("");
          setPlacePickerOpen(true);
          placeSheet.current?.present();
        }}
        onCategory={() => setCategoryVisible(true)}
        onDate={() => {
          if (!editor.read().setup) dateSheet.current?.present();
        }}
        onPost={() => void post()}
        onDone={() => router.back()}
      />
      {categoryEnabled && (
        <CategoryPicker
          workspaceId={workspace.id}
          value={editor.categories}
          onChange={editor.setCategories}
          onAccountSetup={(request) => {
            if (!editor.beginTransfer()) return false;
            destinationRequest.current = request;
            routeChange({ placeTarget: "destination" });
            setSearch("");
            setPlacePickerOpen(true);
            placeSheet.current?.present();
            return true;
          }}
          visible={categoryVisible && editor.editable}
          onClose={() => setCategoryVisible(false)}
        />
      )}
      <PlaceSheet
        sheetRef={placeSheet}
        title={placeTarget === "source" ? t("posting.formFrom") : t("posting.formTo")}
        search={search}
        onSearch={(value) => interaction(() => setSearch(value))}
        places={profiles}
        selectedId={
          placeTarget === "source" ? editor.profileId : editor.destinationId
        }
        excludedId={
          placeTarget === "destination"
            ? editor.profileId
            : editor.entryType === "transfer"
              ? (editor.destinationId ?? undefined)
              : undefined
        }
        disabled={!editor.editable}
        onDismiss={() => {
          setPlacePickerOpen(false);
          destinationRequest.current = null;
          const setup = setupAfterPicker.current;
          setupAfterPicker.current = null;
          if (setup) editor.setSetup({ ...setup, amount: openAmount(workspace.functionalCurrency, "0"), date: defaultAccountingDate(workspace.timeZone) });
        }}
        onSelect={(id) =>
          interaction(() => {
            if (readRoute().placeTarget === "source") editor.setProfileId(id);
            else editor.setDestinationId(id);
            destinationRequest.current = null;
            setPlacePickerOpen(false);
            placeSheet.current?.dismiss();
          })
        }
        onAdd={() =>
          interaction(() => {
            setPlacePickerOpen(false);
            const request = destinationRequest.current;
            setupAfterPicker.current = {
              name: request?.name ?? "",
              productKind: request?.answer === "payDebt" ? null : "bankAccount",
              emoji: request?.style.emoji ?? "💰",
              target:
                readRoute().placeTarget === "destination"
                  ? { kind: "destination", sourceProfileId: editor.read().profileId }
                  : { kind: "source" },
            };
            placeSheet.current?.dismiss();
          })
        }
      />
      <AccountSetupForm
        sheetRef={setupSheet}
        value={setup}
        currency={workspace.functionalCurrency}
        editable={editor.editable}
        busy={editor.busy}
        pending={editor.pending}
        error={editor.error}
        canSubmit={editor.canSubmit}
        onChange={(change) => interaction(() => editor.changeSetup(change))}
        onSubmit={() => void editor.submit()}
        onDismiss={() => {
          setupPresented.current = false;
          editor.setSetup(null);
        }}
      />
      <PickerSheet
        sheetRef={dateSheet}
        busy={!editor.editable}
        stickyHeader={false}
        onDismiss={() => setCalendarOpen(false)}
        footer={
          <ActionBar
            primary={{
              label: t("common.done"),
              icon: "checkmark",
              onPress: () => dateSheet.current?.dismiss(),
              disabled: !editor.editable,
            }}
          />
        }
        scrollProps={{
          contentContainerStyle: {
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            gap: 32,
          },
        }}

        legacyFooter={null}
        legacyBody={
          <>
            <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xl }}>
              <Header title={t("posting.dateSheetTitle")} />
              <DateTimePicker
                value={new Date(`${editor.date}T12:00:00`)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, selected) => {
                  if (selected)
                    interaction(() => editor.setDate(localDate(selected)));
                  if (Platform.OS !== "ios") dateSheet.current?.dismiss();
                }}
              />
              <SecondaryButton
                label={t("common.done")}
                onPress={() => dateSheet.current?.dismiss()}
              />
            </BottomSheetView>
          </>
        }
        legacyNativeModalProps={{
          backgroundStyle: { backgroundColor: theme.background },
          snapPoints: ["55%"],
          enableDynamicSizing: false,
          topInset: undefined,
          handleIndicatorStyle: undefined,
          backdropComponent: undefined,
          enablePanDownToClose: undefined,
          enableContentPanningGesture: undefined,
          keyboardBehavior: undefined,
          keyboardBlurBehavior: undefined,
        }}
        legacyBodyMode="native"
      >
        <SheetHeader
          title={t("posting.dateSheetTitle")}
          eyebrow={t("posting.title").toUpperCase()}
          onClose={() => dateSheet.current?.dismiss()}
          disabled={!editor.editable}
        />
        <View style={{ gap: spacing.sm }}>
          {dateOptions.map((option) => (
            <ChoiceRow
              key={option.value}
              presentation="option"
              label={option.label}
              selected={editor.date === option.value}
              disabled={!editor.editable}
              onPress={() => interaction(() => editor.setDate(option.value))}
            />
          ))}
          <ChoiceRow
            presentation="option"
            label={t("posting.datePick")}
            leading={
              <IconTile icon="calendar-outline" tone="neutral" size={36} />
            }
            selected={
              !dateOptions.some((option) => editor.date === option.value)
            }
            disabled={!editor.editable}
            onPress={() => setCalendarOpen(true)}
          />
        </View>
        <Text variant="status" tone="muted">
          {t("posting.datePickHint")}
        </Text>
        {calendarOpen && (
          <DateTimePicker
            value={new Date(`${editor.date}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, selected) => {
              if (selected)
                interaction(() => editor.setDate(localDate(selected)));
              if (Platform.OS !== "ios") {
                setCalendarOpen(false);
                dateSheet.current?.dismiss();
              }
            }}
          />
        )}
      </PickerSheet>
    </>
  );
  const impactSheet = impact && (
    <PostingImpactSheet shown={impact} currency={workspace.functionalCurrency}
      categoryColors={Object.fromEntries(
        (categories ?? []).map((category) => [
          category.id,
          {
            light: categoryColor(category.style),
            dark: categoryColor(category.style, "dark"),
          },
        ]),
      )}
      onContinue={continueImpact} onReconsider={reconsiderImpact} />
  );
  if (mode === "one")
    return (
      <>
        {form}
        {impactSheet}
        {exit.sheet}
      </>
    );
  return (
    <>
      <BatchNativeStack
        batch={batch}
        currency={workspace.functionalCurrency}
        composing={composing}
        compose={<SheetProvider>{form}</SheetProvider>}
        onCancel={closeCompose}
        onAdd={() => {
          editor.resetComposer();
          routeChange({ editingId: undefined });
          setComposing(true);
        }}
        onEdit={(item) => {
          if (editor.editBatchDraft(item)) {
            routeChange({ editingId: item.id });
            setComposing(true);
          }
        }}
        onBack={() => router.back()}
        onOne={() => {
          editor.resetComposer();
          routeChange({ mode: "one" });
        }}
        rowFor={(item) => batchRowFor({ item, categories, profiles: allProfiles?.map((place) => ({ ...place, name: placeLabel(place, t) })), t })}
      />
      {impactSheet}
    </>
  );
}
export default function PostRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  const { profileId, draftId, candidateId } = useLocalSearchParams<{
    profileId?: string;
    draftId?: string;
    candidateId?: string;
  }>();
  return defaults && userId ? (
    <PostMoney
      defaults={defaults}
      subject={userId}
      initialProfileId={profileId}
      draftId={typeof draftId === "string" ? draftId : undefined}
      candidateId={typeof candidateId === "string" ? candidateId : undefined}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
