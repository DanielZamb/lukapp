import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import { Text } from "react-native";
import { Choice, Header, PrimaryButton, theme, ui } from "../../ui/core";
import { spacing } from "../../ui/tokens";
import type { PlaceDraft } from "./usePostingEditor";
import type { PlaceKind } from "./pendingPostingSchema";

const kinds: Array<[PlaceKind, string]> = [
  ["cash", "Cash or wallet"],
  ["bankAccount", "Bank account"],
  ["savingsAccount", "Savings account"],
  ["creditCard", "Credit card"],
  ["loan", "Loan"],
];
export function AccountSetupForm(props: {
  sheetRef: RefObject<BottomSheetModal | null>;
  value: PlaceDraft | null;
  currency: string;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  error: string;
  canSubmit: boolean;
  onChange: (value: PlaceDraft) => void;
  onDate: () => void;
  onSubmit: () => void;
  onDismiss: () => void;
}) {
  const value = props.value;
  const owed =
    value?.productKind === "creditCard" || value?.productKind === "loan";
  return (
    <BottomSheetModal
      ref={props.sheetRef}
      snapPoints={["92%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={props.editable}
      enableContentPanningGesture={props.editable}
      onDismiss={props.onDismiss}
      backgroundStyle={{ backgroundColor: theme.background }}
    >
      {value && (
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.xxl, gap: spacing.lg }}
        >
          <Header title="Add place" eyebrow="START TRACKING" />
          <Text style={ui.label}>NAME</Text>
          <BottomSheetTextInput
            accessibilityLabel="Place name"
            placeholder="Name of this place"
            value={value.name}
            editable={props.editable}
            onChangeText={(name) => props.onChange({ ...value, name })}
            style={ui.input}
          />
          {kinds.map(([productKind, label]) => (
            <Choice
              key={productKind}
              label={label}
              selected={value.productKind === productKind}
              onPress={() => {
                if (props.editable) props.onChange({ ...value, productKind });
              }}
            />
          ))}
          <Text style={ui.label}>
            {owed ? "AMOUNT OWED" : "AMOUNT HELD"} · {props.currency}
          </Text>
          <Text style={ui.muted}>
            {owed
              ? "How much is outstanding on this date?"
              : "How much do you hold on this date?"}{" "}
            Enter zero or a positive amount. Earlier activity is outside Start
            Tracking.
          </Text>
          <BottomSheetTextInput
            accessibilityLabel={owed ? "Amount owed" : "Amount held"}
            value={value.amount}
            editable={props.editable}
            keyboardType="numbers-and-punctuation"
            onChangeText={(amount) => props.onChange({ ...value, amount })}
            style={ui.input}
          />
          <Choice
            label="Starting date"
            detail={value.date}
            selected={false}
            onPress={() => {
              if (props.editable) props.onDate();
            }}
          />
          {!!props.error && (
            <Text accessibilityRole="alert" style={ui.error}>
              {props.error}
            </Text>
          )}
          {props.pending && (
            <Text style={ui.muted}>
              This setup is saved for retry. Its answers stay fixed until
              confirmed.
            </Text>
          )}
          <PrimaryButton
            label={
              props.busy
                ? "Setting up…"
                : props.pending
                  ? "Retry setup"
                  : "Start tracking"
            }
            disabled={!props.canSubmit}
            onPress={props.onSubmit}
          />
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}
