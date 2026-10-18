import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useRef, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Field, Header, PrimaryButton, theme, ui } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import type { PlaceDraft } from "./usePostingEditor";
import type { PlaceKind } from "./pendingPostingSchema";

const kinds: Array<[PlaceKind, string]> = [
  ["bankAccount", "Checking"],
  ["savingsAccount", "Savings"],
  ["cash", "Wallet"],
];
const emojis = ["💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗"];

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
  onSubmit: () => void;
  onDismiss: () => void;
}) {
  const lookSheet = useRef<BottomSheetModal>(null);
  const value = props.value;
  return (
    <>
      <BottomSheetModal
        ref={props.sheetRef}
        snapPoints={["80%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={props.editable}
        enableContentPanningGesture={props.editable}
        onDismiss={props.onDismiss}
        backgroundStyle={{ backgroundColor: theme.background }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        {value && (
          <BottomSheetScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Header title="Add a place" eyebrow="ANOTHER PLACE" />
            <Field
              label="Name you recognize"
              accessibilityLabel="Account name"
              placeholder="Savings"
              value={value.name}
              editable={props.editable}
              onChangeText={(name) => props.onChange({ ...value, name })}
              InputComponent={BottomSheetTextInput}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>
              <View
                style={styles.chips}
                accessibilityRole="radiogroup"
                accessibilityLabel="Place type"
              >
                {kinds.map(([productKind, label]) => (
                  <Pressable
                    key={productKind}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: value.productKind === productKind,
                      disabled: !props.editable,
                    }}
                    disabled={!props.editable}
                    onPress={() => props.onChange({ ...value, productKind })}
                    style={[
                      styles.chip,
                      value.productKind === productKind && styles.selected,
                    ]}
                  >
                    <Text style={ui.body}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Look</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose emoji"
                disabled={!props.editable}
                onPress={() => lookSheet.current?.present()}
                style={styles.look}
              >
                <Text style={styles.emoji}>{value.emoji ?? "💰"}</Text>
                <Text style={ui.muted}>Change</Text>
              </Pressable>
            </View>
            <Field
              label="Balance today"
              accessibilityLabel="Balance today"
              value={value.amount}
              editable={props.editable}
              keyboardType="decimal-pad"
              placeholder="0"
              onChangeText={(amount) => props.onChange({ ...value, amount })}
              InputComponent={BottomSheetTextInput}
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
                  ? "Adding…"
                  : props.pending
                    ? "Retry setup"
                    : "Add this place"
              }
              trailingIcon="checkmark"
              disabled={!props.canSubmit}
              onPress={props.onSubmit}
            />
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
      <BottomSheetModal
        ref={lookSheet}
        snapPoints={["55%"]}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: theme.background }}
      >
        {value && (
          <BottomSheetScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Header title="Look" />
            <View style={styles.chips}>
              {emojis.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="radio"
                  accessibilityLabel={`Emoji ${emoji}`}
                  accessibilityState={{
                    checked: (value.emoji ?? "💰") === emoji,
                  }}
                  disabled={!props.editable}
                  onPress={() => props.onChange({ ...value, emoji })}
                  style={[
                    styles.emojiChip,
                    (value.emoji ?? "💰") === emoji && styles.selected,
                  ]}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <BottomSheetTextInput
              accessibilityLabel="Custom emoji"
              placeholder="Or type your own"
              maxLength={32}
              value={emojis.includes(value.emoji ?? "💰") ? "" : value.emoji}
              editable={props.editable}
              onChangeText={(emoji) => props.onChange({ ...value, emoji })}
              style={ui.input}
            />
            <PrimaryButton
              label="Use this"
              trailingIcon="checkmark"
              onPress={() => lookSheet.current?.dismiss()}
            />
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xxl, gap: spacing.xl },
  field: { gap: spacing.sm },
  label: { fontFamily: font.semibold, fontSize: 14, color: theme.foreground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.secondary,
  },
  selected: { borderColor: theme.primary, borderWidth: 2 },
  look: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  emoji: { fontSize: 26 },
  emojiChip: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
