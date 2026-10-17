import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import * as Crypto from "expo-crypto";
import { Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatMoney, localDate, parseMoney } from "../src/features/money";
import {
  clearPendingExpense,
  loadPendingExpense,
  savePendingExpense,
  type PendingExpense,
} from "../src/features/pendingExpense";
import {
  Choice,
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  ui,
} from "../src/ui/core";
import { radius, spacing } from "../src/ui/tokens";

type Defaults = NonNullable<ReturnType<typeof usePersonalDefaults>>;
function PostMoney({
  defaults,
  subject,
}: {
  defaults: Defaults;
  subject: string;
}) {
  const post = useMutation(api.accounting.recordCashExpense);
  const [amount, setAmount] = useState("-");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(localDate());
  const [pending, setPending] = useState<PendingExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dateSheet = useRef<BottomSheetModal>(null);
  const placeSheet = useRef<BottomSheetModal>(null);
  const submitting = useRef(false);
  const { workspace, financialAccountProfile: profile } = defaults;
  useEffect(() => {
    let active = true;
    loadPendingExpense(subject)
      .then((value) => {
        if (!active) return;
        if (
          value &&
          (value.workspaceId !== workspace.id ||
            value.financialAccountProfileId !== profile.id ||
            value.amount.currency !== workspace.functionalCurrency)
        )
          throw new Error("Pending expense belongs to another account");
        setPending(value);
        if (value) {
          setAmount(
            formatMoney({
              ...value.amount,
              minorUnits: -value.amount.minorUnits,
            }).replace(`${value.amount.currency} `, ""),
          );
          setDescription(value.description);
          setDate(value.accountingDate);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not restore your pending expense. Reopen this page to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [subject, workspace.id, profile.id, workspace.functionalCurrency]);
  let amountValid = false;
  try {
    amountValid = parseMoney(amount) < 0;
  } catch {
    /* Incomplete edits stay editable. */
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const signed = parseMoney(amount);
      if (signed >= 0)
        throw new Error("Enter a negative amount for an expense.");
      const payload = pending ?? {
        workspaceId: workspace.id,
        financialAccountProfileId: profile.id,
        amount: {
          currency: workspace.functionalCurrency === "USD" ? "USD" : "COP",
          minorUnits: -signed,
        },
        accountingDate: date,
        description: description.trim(),
        idempotencyKey: Crypto.randomUUID(),
      };
      await savePendingExpense(subject, payload);
      setPending(payload);
      await post(payload);
      await clearPendingExpense(subject);
      router.replace({ pathname: "/account", params: { posted: "1" } });
    } catch (error) {
      if (error instanceof ConvexError) {
        await clearPendingExpense(subject);
        setPending(null);
        setError(
          "Expense was rejected. Check the amount, date, and whether the month is open.",
        );
      } else
        setError(
          "Could not confirm posting. Retry to safely check the same expense.",
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const editable = !busy && !pending && !loading;
  return (
    <Screen>
      <Header
        title="Post money"
        eyebrow="NEW ENTRY"
        onBack={() => router.back()}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text
          style={[
            ui.title,
            {
              backgroundColor: "#f4f4f5",
              borderRadius: radius.full,
              padding: spacing.md,
            },
          ]}
        >
          One
        </Text>
        <Text style={ui.muted}>Batch comes later</Text>
      </View>
      <View style={{ marginVertical: spacing.xxl }}>
        <Text style={ui.label}>{workspace.functionalCurrency}</Text>
        <TextInput
          accessibilityLabel="Signed amount"
          value={amount}
          onChangeText={setAmount}
          editable={editable}
          keyboardType="numbers-and-punctuation"
          style={[ui.hero, { minHeight: 64 }]}
        />
        <Text style={ui.muted}>Expense · minus sign · comma for cents</Text>
      </View>
      <Text
        style={[
          ui.title,
          {
            alignSelf: "flex-start",
            backgroundColor: "#f4f4f5",
            borderRadius: radius.full,
            padding: spacing.md,
          },
        ]}
      >
        Normal
      </Text>
      <View>
        <Text style={ui.label}>Description</Text>
        <TextInput
          accessibilityLabel="Description"
          value={description}
          onChangeText={setDescription}
          editable={editable}
          placeholder="What was it"
          maxLength={500}
          style={ui.input}
        />
      </View>
      <ListGroup>
        <ListRow
          title="Place"
          value="My money"
          onPress={editable ? () => placeSheet.current?.present() : undefined}
        />
        <ListRow title="Category" value="No category" />
        <ListRow
          title="Date occurred"
          value={date}
          onPress={editable ? () => dateSheet.current?.present() : undefined}
        />
      </ListGroup>
      {loading && <ActivityIndicator />}
      {error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      {pending && (
        <Text style={ui.muted}>
          This expense is saved for retry. Its answers stay fixed until posting
          is confirmed.
        </Text>
      )}
      <PrimaryButton
        label={busy ? "Posting…" : pending ? "Retry posting" : "Post"}
        disabled={busy || loading || !amountValid}
        onPress={() => void submit()}
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
              if (selected) setDate(localDate(selected));
              if (Platform.OS !== "ios") dateSheet.current?.dismiss();
            }}
          />
          <SecondaryButton
            label="Done"
            onPress={() => dateSheet.current?.dismiss()}
          />
        </BottomSheetView>
      </BottomSheetModal>
    </Screen>
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
