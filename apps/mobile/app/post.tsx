import { useLocalEntryInteraction } from "../src/local-auth/interaction";
import { CategoryPicker } from "../src/features/categories/CategoryPicker";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useMutation, useQuery } from "convex/react";
import * as Crypto from "expo-crypto";
import { Redirect, router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatMoney, localDate } from "../src/features/money";
import {
  clearPendingExpense,
  loadPendingExpense,
  savePendingExpense,
  type PendingExpense,
} from "../src/features/pendingExpense";
import { Choice, Header, Screen, SecondaryButton } from "../src/ui/core";
import { spacing } from "../src/ui/tokens";
import { PostingForm } from "../src/features/posting/PostingForm";
import { useExpenseEditor } from "../src/features/posting/useExpenseEditor";

type Defaults = NonNullable<ReturnType<typeof usePersonalDefaults>>;
function PostMoney({
  defaults,
  subject,
}: {
  defaults: Defaults;
  subject: string;
}) {
  const recordInteraction = useLocalEntryInteraction();
  const [categoryVisible, setCategoryVisible] = useState(false);
  const categories = useQuery(api.accounting.listUserCategories, {
    workspaceId: defaults.workspace.id,
  });
  const post = useMutation(api.accounting.recordCashExpense);
  const dateSheet = useRef<BottomSheetModal>(null);
  const placeSheet = useRef<BottomSheetModal>(null);
  const { workspace, financialAccountProfile: profile } = defaults;
  const transport = useMemo(
    () => ({
      load: () => loadPendingExpense(subject),
      save: (payload: PendingExpense) => savePendingExpense(subject, payload),
      post,
      clear: () => clearPendingExpense(subject),
      newKey: Crypto.randomUUID,
    }),
    [subject, post],
  );
  const editor = useExpenseEditor(
    {
      workspaceId: workspace.id,
      financialAccountProfileId: profile.id,
      currency: workspace.functionalCurrency === "USD" ? "USD" : "COP",
    },
    transport,
  );
  const { date, setDate } = editor;
  return (
    <>
      <PostingForm
        currency={workspace.functionalCurrency}
        place={profile.name}
        category={
          editor.userCategoryId
            ? (categories?.find((c) => c.id === editor.userCategoryId)?.name ??
              "Saved category")
            : "No category"
        }
        {...editor}
        date={new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(`${editor.date}T12:00:00`),
        )}
        posted={
          editor.posted
            ? `${editor.posted.description || "Entry"} · ${formatMoney({ ...editor.posted.amount, minorUnits: -editor.posted.amount.minorUnits })}`
            : null
        }
        onAmountChange={(value) => {
          recordInteraction();
          editor.setAmount(value);
        }}
        onDescriptionChange={(value) => {
          recordInteraction();
          editor.setDescription(value);
        }}
        onBack={() => router.back()}
        onPlace={() => placeSheet.current?.present()}
        onCategory={() => setCategoryVisible(true)}
        onDate={() => dateSheet.current?.present()}
        onPost={() => void editor.submit()}
        onDone={editor.dismissPosted}
      />
      <CategoryPicker
        workspaceId={workspace.id}
        value={editor.userCategoryId}
        onChange={editor.setUserCategoryId}
        visible={categoryVisible && editor.editable}
        onClose={() => setCategoryVisible(false)}
      />
      <BottomSheetModal
        ref={placeSheet}
        snapPoints={["35%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xl }}>
          <Header title="Place" />
          <Choice
            label="My money"
            selected
            onPress={() => placeSheet.current?.dismiss()}
          />
        </BottomSheetView>
      </BottomSheetModal>
      <BottomSheetModal
        ref={dateSheet}
        snapPoints={["55%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xl }}>
          <Header title="Date occurred" />
          <DateTimePicker
            value={new Date(`${date}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, selected) => {
              if (selected) {
                recordInteraction();
                setDate(localDate(selected));
              }
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
  return defaults && userId ? (
    <PostMoney defaults={defaults} subject={userId} />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
