import { useLocalEntryInteraction } from "../src/local-auth/interaction";
import { formatLongDate, useT } from "../src/i18n";
import { CategoryPicker } from "../src/features/categories/CategoryPicker";
import type { AccountSetupRequest } from "../src/features/categories/model";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet";
import { useAction, useConvex, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, Platform, Text, View } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatMoney, localDate, parseMoney } from "../src/features/money";
import { PostingImpactSheet } from "../src/features/budget/PostingImpactSheet";
import {
  postingBudgetImpact,
  batchPostingBudgetImpact,
  type PostingBudgetImpact,
} from "../src/features/budget/postingImpact";
import { defaultAccountingDate } from "../src/features/timeZones";
import { PrimaryButton, Header, Screen, SecondaryButton, useTheme, useUi } from "../src/ui/core";
import { spacing } from "../src/ui/tokens";
import { PostingForm } from "../src/features/posting/PostingForm";
import { BatchNativeStack, batchRowFor } from "../src/features/posting/BatchNativeStack";
import { usePostingBatch } from "../src/features/posting/usePostingBatch";
import { PlaceSheet } from "../src/features/posting/PlaceSheet";
import { AccountSetupForm } from "../src/features/posting/AccountSetupForm";
import {
  usePostingEditor,
  type IntakeBinding,
  type PlaceDraft,
} from "../src/features/posting/usePostingEditor";
import { usePostingBatchStorage } from "../src/features/posting/postingBatchStorage";
import { usePostingTransport } from "../src/features/posting/usePostingTransport";
import { useEntryExit } from "../src/features/posting/useEntryExit";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { createCandidateBinding } from "../src/features/intake/postingBinding";
import { NotificationCard, signedAmountText } from "../src/features/intake/NotificationCard";
import {
  canPostCategories,
  needsPrimary,
} from "../src/features/categories/transactionSelection";

type Defaults = NonNullable<ReturnType<typeof usePersonalDefaults>>;
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
  const [placeTarget, setPlaceTarget] = useState<"source" | "destination">(
    "source",
  );
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const categories = useQuery(api.accounting.listUserCategories, {
    workspaceId: defaults.workspace.id,
  });
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, {
    workspaceId: defaults.workspace.id,
  });
  const dateSheet = useRef<BottomSheetModal>(null);
  const placeSheet = useRef<BottomSheetModal>(null);
  const setupSheet = useRef<BottomSheetModal>(null);
  const setupPresented = useRef(false);
  const destinationRequest = useRef<AccountSetupRequest | null>(null);
  const setupAfterPicker = useRef<PlaceDraft | null>(null);
  const { workspace, financialAccountProfile: defaultProfile } = defaults;
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
      setImpact({ description: t("posting.batchImpactTitle"), hits });
    });
  });
  const [mode, setMode] = useState<"one" | "batch">("one");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
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
    setEditingId(undefined);
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
    currency: workspace.functionalCurrency,
    enabled: mode === "one",
    candidateRoute: !!candidateId,
    onCandidateLeave: () => { leavingCandidate.current = true; },
    refresh: intake.refresh,
  });
  const profile = profiles?.find((place) => place.id === editor.profileId);
  const destination = profiles?.find(
    (place) => place.id === editor.destinationId,
  );
  const needsBudgetCheck =
    editor.entryType === "normal" &&
    editor.direction === "out" &&
    !editor.pending;
  const budget = useQuery(
    api.budget.evaluate,
    needsBudgetCheck
      ? { workspaceId: workspace.id, month: editor.date.slice(0, 7) }
      : "skip",
  );
  const [impact, setImpact] = useState<{
    description: string;
    hits: PostingBudgetImpact;
  } | null>(null);
  const categoryEnabled = editor.entryType === "normal";
  const categoryValid =
    !categoryEnabled ||
    ((editor.entryType === "transfer" || editor.categories.ids.length > 0) &&
      canPostCategories(editor.categories, categories));
  const placesValid =
    !!profile &&
    (editor.entryType !== "transfer" ||
      !!profiles?.some((place) => place.id === editor.destinationId));
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
      <Screen>
        <Header title={t("posting.title")} onBack={() => router.back()} />
        <Text accessibilityRole="alert" style={ui.error}>
          {t("posting.candidateMissing")}
        </Text>
      </Screen>
    );
  if (candidateId && !binding)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  const completeEntry = editor.description.trim().length > 0 && categoryValid && placesValid;
  const blockedReason = !editor.description.trim() ? t("posting.blockedDescription")
    : !profile ? t("posting.blockedPlace")
    : editor.entryType === "transfer" && !destination ? t("posting.blockedDestination")
    : editor.entryType === "transfer" && editor.transferReviewRequired ? t("posting.blockedTransferReview")
    : !categoryValid ? t("posting.blockedCategory")
    : !editor.canSubmit ? t("posting.blockedAmount")
    : needsBudgetCheck && budget === undefined ? t("posting.checkingBudget") : undefined;
  const canQueue =
    editor.canSubmit &&
    !setup &&
    !impact &&
    completeEntry &&
    !editor.pending &&
    !candidateId;
  async function saveToBatch() {
    if (!canQueue) return false;
    const draft = editor.captureForBatch();
    if (!draft || !(await batch.keep(draft, editingId))) return false;
    editor.resetComposer();
    closeCompose();
    return true;
  }
  const form = (
    <>
      <PostingForm
        {...editor}
        sourceNote={sourceNote}
        notification={binding?.notification ? (
          <NotificationCard
            notification={binding.notification}
            appLabel={appLabel}
            currency={workspace.functionalCurrency}
            amount={editor.amount}
            editable={editor.editable}
            onUseAmount={(minor) => interaction(() => editor.setAmount(
              signedAmountText(minor, workspace.functionalCurrency, editor.amount, binding.originalSuggestion.direction)))}
            onUseDescription={(text) => interaction(() => editor.setDescription(text))}
          />
        ) : undefined}
        batchCount={batch.queue.length}
        onBatch={
          !candidateId && !editor.pending && !setup
            ? () => {
                if (canQueue) void saveToBatch();
                setMode("batch");
              }
            : undefined
        }
        saveToBatch={mode === "batch"}
        lockEntryType={editor.lockEntryType}
        currency={workspace.functionalCurrency}
        place={profile ? `${profile.emoji ?? "💰"} ${profile.name}` : t("posting.pick")}
        destination={
          destination
            ? `${destination.emoji ?? "💰"} ${destination.name}`
            : t("posting.pick")
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
        onAmountChange={(value) => interaction(() => editor.setAmount(value))}
        onDescriptionChange={(value) =>
          interaction(() => editor.setDescription(value))
        }
        onEntryType={(value) => interaction(() => editor.setEntryType(value))}
        onBack={mode === "batch" ? closeCompose : () => router.back()}
        onPlace={() => {
          setPlaceTarget("source");
          setSearch("");
          setPlacePickerOpen(true);
          placeSheet.current?.present();
        }}
        onDestination={() => {
          setPlaceTarget("destination");
          setSearch("");
          setPlacePickerOpen(true);
          placeSheet.current?.present();
        }}
        onCategory={() => setCategoryVisible(true)}
        onDate={() => {
          if (!setup) dateSheet.current?.present();
        }}
        onPost={() => {
          if (mode === "batch") {
            void saveToBatch();
            return;
          }
          if (
            impact || !editor.canSubmit || setup ||
            (!editor.pending && (!categoryValid || !placesValid))
          ) return;
          if (needsBudgetCheck) {
            if (!budget) return;
            const hits = postingBudgetImpact({
              jars: budget.jars,
              categoryIds: editor.categories.ids,
              expenseMinorUnits: -parseMoney(editor.amount, workspace.functionalCurrency),
            });
            if (hits.length) {
              Keyboard.dismiss();
              setImpact({ description: editor.description.trim(), hits });
              return;
            }
          }
          void editor.submit();
        }}
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
            setPlaceTarget("destination");
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
          if (setup) editor.setSetup(setup);
        }}
        onSelect={(id) =>
          interaction(() => {
            if (placeTarget === "source") editor.setProfileId(id);
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
              amount: "0",
              date: defaultAccountingDate(workspace.timeZone),
              target:
                placeTarget === "destination"
                  ? { kind: "destination", sourceProfileId: editor.profileId }
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
        onChange={(value) => interaction(() => editor.setSetup(value))}
        onSubmit={() => void editor.submit()}
        onDismiss={() => {
          setupPresented.current = false;
          editor.setSetup(null);
        }}
      />
      <BottomSheetModal
        ref={dateSheet}
        backgroundStyle={{ backgroundColor: theme.background }}
        snapPoints={["55%"]}
        enableDynamicSizing={false}
      >
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
      </BottomSheetModal>
    </>
  );
  const impactSheet = impact && (
    <PostingImpactSheet
          currency={workspace.functionalCurrency}
      {...impact}
      onReconsider={() => {
        setImpact(null);
        batchDecision.current?.(false);
        batchDecision.current = null;
      }}
      onContinue={() => {
        setImpact(null);
        if (batchDecision.current) {
          batchDecision.current(true);
          batchDecision.current = null;
        } else void editor.submit();
      }}
    />
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
        compose={<BottomSheetModalProvider>{form}</BottomSheetModalProvider>}
        onCancel={closeCompose}
        onAdd={() => {
          editor.resetComposer();
          setEditingId(undefined);
          setComposing(true);
        }}
        onEdit={(item) => {
          if (editor.editBatchDraft(item)) {
            setEditingId(item.id);
            setComposing(true);
          }
        }}
        onBack={() => router.back()}
        onOne={() => {
          editor.resetComposer();
          setMode("one");
        }}
        rowFor={(item) => batchRowFor({ item, categories, profiles, t })}
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
