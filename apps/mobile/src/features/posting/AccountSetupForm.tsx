import type { Theme } from "../../ui/tokens";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Field, Header, PrimaryButton, useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import type { PlaceDraft } from "./usePostingEditor";
import type { PlaceKind } from "./pendingPostingSchema";

const assetKinds: Array<[PlaceKind, string]> = [
  ["bankAccount", "Checking"],
  ["savingsAccount", "Savings"],
  ["cash", "Wallet"],
];
const debtKinds: Array<[PlaceKind, string]> = [["creditCard", "Credit card"], ["loan", "Loan"]];
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
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => accountSetupStyles(theme), [theme]);
  const lookSheet = useRef<BottomSheetModal>(null);
  const [lookEmoji, setLookEmoji] = useState("💰");
  const [lookOpen, setLookOpen] = useState(false);
  const value = props.value;
  const debt = value !== null && (value.productKind === null || value.productKind === "creditCard" || value.productKind === "loan");
  const kinds = debt ? debtKinds : assetKinds;
  const balanceLabel = debt ? "How much do you still owe?" : "Balance today";
  const hasValue = value !== null;
  useEffect(() => {
    if (Platform.OS !== "android" || !hasValue) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (props.editable) {
        if (lookOpen) lookSheet.current?.dismiss();
        else props.sheetRef.current?.dismiss();
      }
      return true;
    });
    return () => subscription.remove();
  }, [hasValue, lookOpen, props.editable, props.sheetRef]);
  return (
    <>
      <BottomSheetModal
        ref={props.sheetRef}
        stackBehavior="push"
        snapPoints={["80%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={props.editable}
        enableContentPanningGesture={props.editable}
        onDismiss={() => {
          setLookOpen(false);
          props.onDismiss();
        }}
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
                    accessibilityLabel={label}
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
                onPress={() => {
                  setLookEmoji(value.emoji ?? "💰");
                  setLookOpen(true);
                  lookSheet.current?.present();
                }}
                style={styles.look}
              >
                <Text style={styles.emoji}>{value.emoji ?? "💰"}</Text>
                <Text style={ui.muted}>Change</Text>
              </Pressable>
            </View>
            <Field
              label={balanceLabel}
              accessibilityLabel={balanceLabel}
              value={value.amount}
              editable={props.editable}
              keyboardType="numbers-and-punctuation"
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
      {value && (
        <BottomSheetModal
          ref={lookSheet}
          stackBehavior="push"
          snapPoints={["55%"]}
          enableDynamicSizing={false}
          enablePanDownToClose={props.editable}
          enableContentPanningGesture={props.editable}
          onDismiss={() => {
            setLookOpen(false);
            setLookEmoji(value.emoji ?? "💰");
          }}
          backgroundStyle={{ backgroundColor: theme.background }}
          backdropComponent={(propsBackdrop) => (
            <BottomSheetBackdrop
              {...propsBackdrop}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              pressBehavior={props.editable ? "close" : "none"}
            />
          )}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
        >
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
                    checked: lookEmoji === emoji,
                  }}
                  disabled={!props.editable}
                  onPress={() => setLookEmoji(emoji)}
                  style={[
                    styles.emojiChip,
                    lookEmoji === emoji && styles.selected,
                  ]}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <BottomSheetTextInput
              accessibilityLabel="Custom emoji"
              editable={props.editable}
              value={emojis.includes(lookEmoji) ? "" : lookEmoji}
              onChangeText={(input) => {
                const emoji = [...input][0];
                if (emoji) setLookEmoji(emoji);
              }}
              placeholder="Or type your own"
              placeholderTextColor={theme.mutedForeground}
              style={styles.customEmojiInput}
            />
            <PrimaryButton
              label="Use this"
              trailingIcon="checkmark"
              disabled={!props.editable}
              onPress={() => {
                props.onChange({ ...value, emoji: lookEmoji });
                lookSheet.current?.dismiss();
              }}
            />
          </BottomSheetScrollView>
        </BottomSheetModal>
      )}
    </>
  );
}

function accountSetupStyles(theme: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.xxl, gap: spacing.xl },
    field: { gap: spacing.sm },
    label: { fontFamily: font.semibold, fontSize: 14, color: theme.foreground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      maxWidth: "100%",
      paddingVertical: spacing.sm,
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
      height: touchTarget,
      width: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    customEmojiInput: {
      minHeight: touchTarget,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      backgroundColor: theme.secondary,
      color: theme.foreground,
    },
  });
}
