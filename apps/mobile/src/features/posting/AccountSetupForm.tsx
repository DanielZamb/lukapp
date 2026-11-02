import type { Theme } from "../../ui/tokens";
import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  ActionBar,
  ChoiceRow,
  EmojiGrid,
  EmojiTile,
  Field,
  FactRow,
  Header,
  PrimaryButton,
  SecondaryButton,
  SheetHeader,
  Text,
  useTextPreset,
  useTheme,
  useUi,
} from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import type { PlaceDraft } from "./usePostingEditor";
import type { PlaceKind } from "./pendingPostingSchema";
import { Sheet } from "../../ui/Sheet";
import { PickerSheet } from "../../ui/PickerSheet";

const assetKinds: Array<[PlaceKind, string]> = [
  ["bankAccount", "Checking"],
  ["savingsAccount", "Savings"],
  ["cash", "Wallet"],
];
const debtKinds: Array<[PlaceKind, string]> = [
  ["creditCard", "Credit card"],
  ["loan", "Loan"],
];
const emojis = ["💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗"];
const emojiNames: Record<string, string> = {
  "💰": "Money bag",
  "🏦": "Bank",
  "👛": "Wallet",
  "💳": "Card",
  "🏠": "Home",
  "💼": "Briefcase",
  "🪙": "Coin",
  "🐷": "Piggy bank",
  "✨": "Sparkles",
  "🚗": "Car",
};

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
  const customEmojiTypography = useTextPreset("nativeInput", styles.customEmojiInput);
  const lookSheet = useRef<BottomSheetModal>(null);
  const [lookEmoji, setLookEmoji] = useState("💰");
  const [lookOpen, setLookOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "name" | "balance" | "emoji" | null
  >(null);
  const value = props.value;
  const debt =
    value !== null &&
    (value.productKind === null ||
      value.productKind === "creditCard" ||
      value.productKind === "loan");
  const kinds = debt ? debtKinds : assetKinds;
  const balanceLabel = debt ? "How much do you still owe?" : "Balance today";
  const hasValue = value !== null;
  useEffect(() => {
    if (Platform.OS !== "android" || !hasValue) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (props.editable) {
          if (lookOpen) lookSheet.current?.dismiss();
          else props.sheetRef.current?.dismiss();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [hasValue, lookOpen, props.editable, props.sheetRef]);
  return (
    <>
      <Sheet
        sheetRef={props.sheetRef}
        label="Add a place"
        tall
        busy={!props.editable}
        closeLabel={false}
        onDismiss={() => {
          setLookOpen(false);
          props.onDismiss();
        }}
        nativeModalProps={{
          stackBehavior: "push",
          enableContentPanningGesture: props.editable,
        }}
        scrollProps={{
          contentContainerStyle: {
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            gap: 32,
          },
        }}
        footer={
          value ? (
            <ActionBar
              primary={{
                label: props.busy
                  ? "Adding…"
                  : props.pending
                    ? "Retry setup"
                    : "Add this place",
                icon: "checkmark",
                disabled: !props.canSubmit,
                onPress: props.onSubmit,
              }}
            />
          ) : undefined
        }

        legacyFooter={null}
        legacyBody={
          <>
            {value && (
              <BottomSheetScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.content}
              >
                <Header title="Add a place" eyebrow="ANOTHER PLACE" />
                <Field
                  label="Name you recognize"
                  accessibilityLabel="Account name"
                  autoFocus={focusedField === "name" || undefined}
                  onFocus={() => setFocusedField("name")}
                  placeholder="Savings"
                  value={value.name}
                  editable={props.editable}
                  onChangeText={(name) => props.onChange({ ...value, name })}
                  InputComponent={BottomSheetTextInput}
                />
                <View style={styles.field}>
                  <Text preset="fieldLabel" style={styles.label}>
                    Type
                  </Text>
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
                        onPress={() =>
                          props.onChange({ ...value, productKind })
                        }
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
                  <Text preset="fieldLabel" style={styles.label}>
                    Look
                  </Text>
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
                    <Text preset="emoji26">{value.emoji ?? "💰"}</Text>
                    <Text preset="body" style={ui.muted}>
                      Change
                    </Text>
                  </Pressable>
                </View>
                <Field
                  label={balanceLabel}
                  accessibilityLabel={balanceLabel}
                  autoFocus={focusedField === "balance" || undefined}
                  onFocus={() => setFocusedField("balance")}
                  value={value.amount}
                  editable={props.editable}
                  keyboardType="numbers-and-punctuation"
                  placeholder="0"
                  onChangeText={(amount) =>
                    props.onChange({ ...value, amount })
                  }
                  InputComponent={BottomSheetTextInput}
                />
                {!!props.error && (
                  <Text
                    preset="caption"
                    accessibilityRole="alert"
                    style={ui.error}
                  >
                    {props.error}
                  </Text>
                )}
                {props.pending && (
                  <Text preset="body" style={ui.muted}>
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
          </>
        }
        legacyNativeModalProps={{
          stackBehavior: "push",
          snapPoints: ["80%"],
          enableDynamicSizing: false,
          enablePanDownToClose: props.editable,
          enableContentPanningGesture: props.editable,
          backgroundStyle: { backgroundColor: theme.background },
          keyboardBehavior: "interactive",
          keyboardBlurBehavior: "restore",
        }}
      >
        {value && (
          <>
            <Field
              label="Name you recognize"
              accessibilityLabel="Account name"
              autoFocus={focusedField === "name" || undefined}
              onFocus={() => setFocusedField("name")}
              placeholder="Savings"
              value={value.name}
              editable={props.editable}
              onChangeText={(name) => props.onChange({ ...value, name })}
              InputComponent={BottomSheetTextInput}
            />
            <View style={{ gap: spacing.sm }}>
              <Text variant="section">Type</Text>
              {kinds.map(([productKind, label]) => (
                <ChoiceRow
                  key={productKind}
                  presentation="option"
                  label={label}
                  selected={value.productKind === productKind}
                  disabled={!props.editable}
                  onPress={() => props.onChange({ ...value, productKind })}
                />
              ))}
            </View>
            <FactRow
              label="Look"
              value={emojiNames[value.emoji ?? "💰"] ?? "Custom emoji"}
              leading={
                <EmojiTile emoji={value.emoji ?? "💰"} color={theme.primary} />
              }
              actionLabel="Change"
              onPress={
                props.editable
                  ? () => {
                      setLookEmoji(value.emoji ?? "💰");
                      setLookOpen(true);
                      lookSheet.current?.present();
                    }
                  : undefined
              }
            />
            <Field
              label={balanceLabel}
              accessibilityLabel={balanceLabel}
              autoFocus={focusedField === "balance" || undefined}
              onFocus={() => setFocusedField("balance")}
              value={value.amount}
              editable={props.editable}
              keyboardType="numbers-and-punctuation"
              placeholder="0"
              onChangeText={(amount) => props.onChange({ ...value, amount })}
              InputComponent={BottomSheetTextInput}
            />
            {!!props.error && (
              <Text variant="meta" tone="danger" accessibilityRole="alert">
                {props.error}
              </Text>
            )}
            {props.pending && (
              <Text variant="meta" tone="muted">
                This setup is saved for retry. Its answers stay fixed until
                confirmed.
              </Text>
            )}
          </>
        )}
      </Sheet>
      {value && (
        <PickerSheet
          sheetRef={lookSheet}
          busy={!props.editable}
          stickyHeader={false}
          onDismiss={() => {
            setLookOpen(false);
            setLookEmoji(value.emoji ?? "💰");
          }}
          footer={
            <ActionBar
              primary={{
                label: "Use this",
                icon: "checkmark",
                disabled: !props.editable,
                onPress: () => {
                  props.onChange({ ...value, emoji: lookEmoji });
                  lookSheet.current?.dismiss();
                },
              }}
            />
          }
          nativeModalProps={{ stackBehavior: "push" }}
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
                      <Text preset="emoji26">{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                <BottomSheetTextInput
                  {...customEmojiTypography}
                  accessibilityLabel="Custom emoji"
                  autoFocus={focusedField === "emoji" || undefined}
                  onFocus={() => setFocusedField("emoji")}
                  editable={props.editable}
                  value={emojis.includes(lookEmoji) ? "" : lookEmoji}
                  onChangeText={(input) => {
                    const emoji = [...input][0];
                    if (emoji) setLookEmoji(emoji);
                  }}
                  placeholder="Or type your own"
                  placeholderTextColor={theme.mutedForeground}
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
            </>
          }
          legacyNativeModalProps={{
            stackBehavior: "push",
            topInset: undefined,
            handleIndicatorStyle: undefined,
            snapPoints: ["55%"],
            enableDynamicSizing: false,
            enablePanDownToClose: props.editable,
            enableContentPanningGesture: props.editable,
            backgroundStyle: { backgroundColor: theme.background },
            backdropComponent: (propsBackdrop) => (
              <BottomSheetBackdrop
                {...propsBackdrop}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                pressBehavior={props.editable ? "close" : "none"}
              />
            ),
            keyboardBehavior: "interactive",
            keyboardBlurBehavior: "restore",
          }}
          legacyBodyMode="native"
        >
          <SheetHeader
            title="Look"
            onClose={() => lookSheet.current?.dismiss()}
            disabled={!props.editable}
          />
          <EmojiGrid
            options={emojis.map((emoji) => ({
              value: emoji,
              label: `Emoji ${emoji}`,
            }))}
            value={lookEmoji}
            onChange={(emoji) => {
              if (props.editable) setLookEmoji(emoji);
            }}
          />
          <Field
            label="Custom emoji"
            accessibilityLabel="Custom emoji"
            autoFocus={focusedField === "emoji" || undefined}
            onFocus={() => setFocusedField("emoji")}
            editable={props.editable}
            value={emojis.includes(lookEmoji) ? "" : lookEmoji}
            onChangeText={(input) => {
              const emoji = [...input][0];
              if (emoji) setLookEmoji(emoji);
            }}
            placeholder="Or type your own"
            InputComponent={BottomSheetTextInput}
          />
        </PickerSheet>
      )}
    </>
  );
}

function accountSetupStyles(theme: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.xxl, gap: spacing.xl },
    field: { gap: spacing.sm },
    label: { fontFamily: font.semibold, color: theme.foreground },
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
