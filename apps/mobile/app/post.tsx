import { useLocalEntryInteraction } from "../src/local-auth/interaction";
import { CategoryPicker } from "../src/features/categories/CategoryPicker";
import type { AccountSetupRequest } from "../src/features/categories/model";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useAction, useConvex, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
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
import { SheetProvider } from "../src/ui/SheetProvider";
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
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { factsFromCandidate, suggestionOf } from "../src/features/intake/facts";
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
  const ui = useUi();
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
    if (!candidateId) return;
    let active = true;
    void intake.read(candidateId).then((row) => {
      if (!active) return;
      if (!row) {
        setMissingCandidate(true);
        return;
      }
      setBinding({
        id: row.id,
        facts: factsFromCandidate(row),
        suggestion: suggestionOf(row),
        parserVersion: row.parserVersion,
        consentVersion: row.consentVersion,
        confirm: async (input) => {
          const result = await confirmOne(input);
          const sign = input.confirmed.direction === "out" ? -1 : 1;
          return {
            description: result.posted.description,
            amount: {
              currency: result.posted.amount.currency,
              minorUnits: sign * Math.abs(result.posted.amount.minorUnits),
            },
          };
        },
        consume: () => intake.consume(row.id),
        fail: (error) => intake.fail(row.id, error),
      });
    });
    return () => {
      active = false;
    };
  }, [candidateId, confirmOne, intake.consume, intake.fail, intake.read]);
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
      setImpact({ description: "Batch", hits });
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
    ? "From drafts"
    : draftId
      ? "Draft on this device"
      : undefined;
  if (candidateId && missingCandidate)
    return (
      <Screen>
        <Header title="Post money" onBack={() => router.back()} />
        <Text accessibilityRole="alert" style={ui.error}>
          This Candidate is no longer on this device.
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
  const blockedReason = !editor.description.trim() ? "Add a description before posting."
    : !profile ? "Choose the place this money moves from."
    : editor.entryType === "transfer" && !destination ? "Choose where the money goes in To."
    : editor.entryType === "transfer" && editor.transferReviewRequired ? "Confirm From and To before posting."
    : !categoryValid ? "Choose a category and, if requested, its primary category."
    : !editor.canSubmit ? "Enter a valid amount before posting."
    : needsBudgetCheck && budget === undefined ? "Checking your budget…" : undefined;
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
        place={profile ? `${profile.emoji ?? "💰"} ${profile.name}` : "Pick"}
        destination={
          destination
            ? `${destination.emoji ?? "💰"} ${destination.name}`
            : "Pick"
        }
        category={
          editor.categories.ids
            .map((id) => {
              const category = categories?.find(
                (category) => category.id === id,
              );
              return category
                ? `${category.style.emoji} ${category.name}`
                : "Saved category";
            })
            .join(" · ") || "Pick"
        }
        categoryEnabled={categoryEnabled}
        blockedReason={blockedReason}
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
        date={new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(`${editor.date}T12:00:00`),
        )}
        posted={
          mode !== "batch" && editor.posted
            ? `${editor.posted.description || "Entry"} · ${editor.posted.amount.minorUnits > 0 ? "+" : ""}${formatMoney(editor.posted.amount)}`
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
              expenseMinorUnits: -parseMoney(editor.amount, "es-CO", workspace.functionalCurrency),
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
        title={placeTarget === "source" ? "From" : "To"}
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
          <Header title="Date occurred" />
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
            label="Done"
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
        rowFor={(item) => batchRowFor({ item, categories, profiles })}
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
