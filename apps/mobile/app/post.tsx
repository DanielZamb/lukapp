import { useLocalEntryInteraction } from "../src/local-auth/interaction";
import { CategoryPicker } from "../src/features/categories/CategoryPicker";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatMoney, localDate } from "../src/features/money";
import { defaultAccountingDate } from "../src/features/timeZones";
import { Header, Screen, SecondaryButton, ui } from "../src/ui/core";
import { spacing } from "../src/ui/tokens";
import { PostingForm } from "../src/features/posting/PostingForm";
import { PlaceSheet } from "../src/features/posting/PlaceSheet";
import { AccountSetupForm } from "../src/features/posting/AccountSetupForm";
import {
  usePostingEditor,
  type IntakeBinding,
} from "../src/features/posting/usePostingEditor";
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
  const recordInteraction = useLocalEntryInteraction();
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [placeTarget, setPlaceTarget] = useState<"source" | "destination">(
    "source",
  );
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
  const { workspace, financialAccountProfile: defaultProfile } = defaults;
  const drafts = useLocalEntryDrafts({
    subject,
    workspaceId: workspace.id,
  });
  const intake = useIntakeCandidates({
    subject,
    workspaceId: workspace.id,
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
  const editor = usePostingEditor(
    {
      workspaceId: workspace.id,
      financialAccountProfileId: initialProfileId ?? defaultProfile.id,
      currency: workspace.functionalCurrency === "USD" ? "USD" : "COP",
      timeZone: workspace.timeZone,
    },
    usePostingTransport(subject),
    {
      drafts: candidateId ? null : drafts.port,
      draftId: candidateId ? undefined : draftId,
      intake: binding,
    },
  );
  const profile = profiles?.find((place) => place.id === editor.profileId);
  const categoryEnabled = editor.entryType === "normal";
  const categoryValid =
    !categoryEnabled || canPostCategories(editor.categories, categories);
  const placesValid =
    !!profile &&
    (editor.entryType !== "transfer" ||
      !!profiles?.some((place) => place.id === editor.destinationId));
  const setup = editor.setup;
  useEffect(() => {
    if (editor.blockedByPendingPostings) router.replace("/drafts");
  }, [editor.blockedByPendingPostings]);
  useEffect(() => {
    if (setup !== null && !setupPresented.current)
      setupSheet.current?.present();
    else if (setup === null && setupPresented.current)
      setupSheet.current?.dismiss();
    setupPresented.current = setup !== null;
  }, [setup]);
  function interaction(action: () => void) {
    recordInteraction();
    action();
  }
  const hint =
    editor.entryType === "transfer"
      ? "Move money from Place to To. Paying a card or loan reduces what you owe. Record any fee as a separate expense."
      : editor.entryType === "initial"
        ? `${profile?.productKind === "creditCard" || profile?.productKind === "loan" ? "Enter the amount owed" : "Enter the amount held"} on the starting date. Use zero or a positive amount. Earlier activity is outside Start Tracking.`
        : "Use a positive amount for income and a negative amount for spending. Choose up to three categories; each counts the full amount.";
  const selectedDate = setup?.date ?? editor.date;
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
  return (
    <>
      <PostingForm
        {...editor}
        currency={workspace.functionalCurrency}
        place={profile?.name ?? "Choose a place"}
        destination={
          profiles?.find((place) => place.id === editor.destinationId)?.name
        }
        category={
          editor.categories.ids
            .map(
              (id) =>
                categories?.find((category) => category.id === id)?.name ??
                "Saved category",
            )
            .join(" · ") || "No category"
        }
        categoryEnabled={categoryEnabled}
        hint={hint}
        categoryNeedsPrimary={
          categoryEnabled &&
          !!categories &&
          needsPrimary(editor.categories.ids, categories) &&
          !editor.categories.primaryId
        }
        canSubmit={
          !setup &&
          editor.canSubmit &&
          (editor.pending || (categoryValid && placesValid))
        }
        date={new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(`${editor.date}T12:00:00`),
        )}
        posted={
          editor.posted
            ? `${editor.posted.description || "Entry"} · ${formatMoney(editor.posted.amount)}`
            : null
        }
        postedTitle={editor.posted?.title}
        onAmountChange={(value) => interaction(() => editor.setAmount(value))}
        onDescriptionChange={(value) =>
          interaction(() => editor.setDescription(value))
        }
        onEntryType={(value) => interaction(() => editor.setEntryType(value))}
        onBack={() => router.back()}
        onPlace={() => {
          setPlaceTarget("source");
          setSearch("");
          placeSheet.current?.present();
        }}
        onDestination={() => {
          setPlaceTarget("destination");
          setSearch("");
          placeSheet.current?.present();
        }}
        onCategory={() => setCategoryVisible(true)}
        onDate={() => dateSheet.current?.present()}
        onPost={() => void editor.submit()}
        onKeepDraft={() => {
          void editor.keepDraft().then((id) => {
            if (id) router.setParams({ draftId: id });
          });
        }}
        canKeepDraft={editor.canKeepDraft}
        onDone={editor.dismissPosted}
      />
      {categoryEnabled && (
        <CategoryPicker
          key={editor.direction}
          direction={editor.direction}
          workspaceId={workspace.id}
          value={editor.categories}
          onChange={editor.setCategories}
          visible={categoryVisible && editor.editable}
          onClose={() => setCategoryVisible(false)}
        />
      )}
      <PlaceSheet
        sheetRef={placeSheet}
        title={placeTarget === "source" ? "Place" : "To"}
        search={search}
        onSearch={(value) => interaction(() => setSearch(value))}
        places={profiles}
        selectedId={
          placeTarget === "source" ? editor.profileId : editor.destinationId
        }
        excludedId={
          placeTarget === "destination"
            ? editor.profileId
            : (editor.destinationId ?? undefined)
        }
        disabled={!editor.editable}
        onSelect={(id) =>
          interaction(() => {
            if (placeTarget === "source") editor.setProfileId(id);
            else editor.setDestinationId(id);
            placeSheet.current?.dismiss();
          })
        }
        onAdd={() =>
          interaction(() => {
            placeSheet.current?.dismiss();
            editor.setSetup({
              name: "",
              productKind: "bankAccount",
              amount: "0",
              date: defaultAccountingDate(workspace.timeZone),
              target:
                placeTarget === "destination"
                  ? { kind: "destination", sourceProfileId: editor.profileId }
                  : { kind: "source" },
            });
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
        onDate={() => dateSheet.current?.present()}
        onSubmit={() => void editor.submit()}
        onDismiss={() => editor.setSetup(null)}
      />
      <BottomSheetModal
        ref={dateSheet}
        snapPoints={["55%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xl }}>
          <Header title={setup ? "Starting date" : "Date occurred"} />
          <DateTimePicker
            value={new Date(`${selectedDate}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, selected) => {
              if (selected)
                interaction(() => {
                  if (setup)
                    editor.setSetup({ ...setup, date: localDate(selected) });
                  else editor.setDate(localDate(selected));
                });
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
