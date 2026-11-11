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
import { useT, type MessageKey } from "../../i18n";
import { kindDetails, placeKinds, type PlaceKind as PlaceChoice } from "../places/model";
import { AmountField } from "../amount/AmountField";
import { Sheet } from "../../ui/Sheet";
import { PickerSheet } from "../../ui/PickerSheet";

type KindChip = readonly [id: string, productKind: PlaceKind, label: MessageKey];
const assetLabels: Record<PlaceChoice, MessageKey> = {
  Checking: "posting.setupKindChecking", Savings: "posting.setupKindSavings",
  DigitalWallet: "posting.setupKindDigitalWallet", Cash: "posting.setupKindWallet",
};
const assetKinds: KindChip[] = placeKinds.map((choice) => [choice, kindDetails[choice].productKind, assetLabels[choice]]);
const debtKinds: KindChip[] = [
  ["creditCard", "creditCard", "posting.setupKindCreditCard"],
  ["loan", "loan", "posting.setupKindLoan"],
];
const emojis = ["💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗"];
const emojiNames: Record<string, MessageKey | undefined> = {
  "💰": "posting.emojiMoneyBag",
  "🏦": "posting.emojiBank",
  "👛": "posting.emojiWallet",
  "💳": "posting.emojiCard",
  "🏠": "posting.emojiHome",
  "💼": "posting.emojiBriefcase",
  "🪙": "posting.emojiCoin",
  "🐷": "posting.emojiPiggyBank",
  "✨": "posting.emojiSparkles",
  "🚗": "posting.emojiCar",
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
  /** Only the fields that changed, applied by the owner to its latest draft. */
  onChange: (change: Partial<PlaceDraft>) => void;
  onSubmit: () => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => accountSetupStyles(theme), [theme]);
  const customEmojiTypography = useTextPreset("nativeInput", styles.customEmojiInput);
  const lookSheet = useRef<BottomSheetModal>(null);
  const [lookEmoji, setLookEmoji] = useState("💰");
  const [lookOpen, setLookOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
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
  const selected = kinds.find(([id, productKind]) => id === chosen && productKind === value?.productKind)?.[0]
    ?? kinds.find(([, productKind]) => productKind === value?.productKind)?.[0];
  const balanceLabel = debt ? t("posting.setupOwed") : t("posting.setupBalance");
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
        label={t("posting.setupTitle")}
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
                  ? t("posting.setupAdding")
                  : props.pending
                    ? t("posting.setupRetry")
                    : t("posting.setupSubmit"),
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
                <Header title={t("posting.setupTitle")} eyebrow={t("posting.setupEyebrow")} />
                <Field
                  label={t("posting.setupName")}
                  accessibilityLabel={t("posting.setupNameA11y")}
                  autoFocus={focusedField === "name" || undefined}
                  onFocus={() => setFocusedField("name")}
                  placeholder={t("posting.setupNamePlaceholder")}
                  value={value.name}
                  editable={props.editable}
                  onChangeText={(name) => props.onChange({ name })}
                  InputComponent={BottomSheetTextInput}
                />
                <View style={styles.field}>
                  <Text preset="fieldLabel" style={styles.label}>
                    {t("posting.setupType")}
                  </Text>
                  <View
                    style={styles.chips}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t("posting.setupTypeA11y")}
                  >
                    {kinds.map(([id, productKind, labelKey]) => (
                      <Pressable
                        key={id}
                        accessibilityLabel={t(labelKey)}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: selected === id,
                          disabled: !props.editable,
                        }}
                        disabled={!props.editable}
                        onPress={() => {
                          setChosen(id);
                          props.onChange({ productKind });
                        }}
                        style={[
                          styles.chip,
                          selected === id && styles.selected,
                        ]}
                      >
                        <Text style={ui.body}>{t(labelKey)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.field}>
                  <Text preset="fieldLabel" style={styles.label}>
                    {t("posting.setupLook")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("posting.setupChooseEmoji")}
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
                      {t("posting.setupChange")}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.field}>
                  <Text preset="fieldLabel" style={styles.label}>{balanceLabel}</Text>
                  <AmountField
                    session={value.amount}
                    onChange={(amount) => props.onChange({ amount })}
                    editable={props.editable}
                    inputAccessibilityLabel={balanceLabel}
                    placeholder="0"
                    InputComponent={BottomSheetTextInput}
                    inputStyle={ui.input}
                  />
                </View>
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
                    {t("posting.setupPendingNote")}
                  </Text>
                )}
                <PrimaryButton
                  label={
                    props.busy
                      ? t("posting.setupAdding")
                      : props.pending
                        ? t("posting.setupRetry")
                        : t("posting.setupSubmit")
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
              label={t("posting.setupName")}
              accessibilityLabel={t("posting.setupNameA11y")}
              autoFocus={focusedField === "name" || undefined}
              onFocus={() => setFocusedField("name")}
              placeholder={t("posting.setupNamePlaceholder")}
              value={value.name}
              editable={props.editable}
              onChangeText={(name) => props.onChange({ name })}
              InputComponent={BottomSheetTextInput}
            />
            <View style={{ gap: spacing.sm }}>
              <Text variant="section">{t("posting.setupType")}</Text>
              {kinds.map(([id, productKind, labelKey]) => (
                <ChoiceRow
                  key={id}
                  presentation="option"
                  label={t(labelKey)}
                  selected={selected === id}
                  disabled={!props.editable}
                  onPress={() => {
                    setChosen(id);
                    props.onChange({ productKind });
                  }}
                />
              ))}
            </View>
            <FactRow
              label={t("posting.setupLook")}
              value={t(emojiNames[value.emoji ?? "💰"] ?? "posting.setupCustomEmoji")}
              leading={
                <EmojiTile emoji={value.emoji ?? "💰"} color={theme.primary} />
              }
              actionLabel={t("posting.setupChange")}
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
            <View style={styles.field}>
              <Text variant="section">{balanceLabel}</Text>
              <AmountField
                session={value.amount}
                onChange={(amount) => props.onChange({ amount })}
                editable={props.editable}
                inputAccessibilityLabel={balanceLabel}
                placeholder="0"
                InputComponent={BottomSheetTextInput}
                inputStyle={ui.input}
              />
            </View>
            {!!props.error && (
              <Text variant="meta" tone="danger" accessibilityRole="alert">
                {props.error}
              </Text>
            )}
            {props.pending && (
              <Text variant="meta" tone="muted">
                {t("posting.setupPendingNote")}
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
                label: t("posting.setupUseThis"),
                icon: "checkmark",
                disabled: !props.editable,
                onPress: () => {
                  props.onChange({ emoji: lookEmoji });
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
                <Header title={t("posting.setupLook")} />
                <View style={styles.chips}>
                  {emojis.map((emoji) => (
                    <Pressable
                      key={emoji}
                      accessibilityRole="radio"
                      accessibilityLabel={t("posting.setupEmojiA11y", { emoji })}
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
                  accessibilityLabel={t("posting.setupCustomEmoji")}
                  autoFocus={focusedField === "emoji" || undefined}
                  onFocus={() => setFocusedField("emoji")}
                  editable={props.editable}
                  value={emojis.includes(lookEmoji) ? "" : lookEmoji}
                  onChangeText={(input) => {
                    const emoji = [...input][0];
                    if (emoji) setLookEmoji(emoji);
                  }}
                  placeholder={t("posting.setupCustomEmojiPlaceholder")}
                  placeholderTextColor={theme.mutedForeground}
                />
                <PrimaryButton
                  label={t("posting.setupUseThis")}
                  trailingIcon="checkmark"
                  disabled={!props.editable}
                  onPress={() => {
                    props.onChange({ emoji: lookEmoji });
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
            title={t("posting.setupLook")}
            onClose={() => lookSheet.current?.dismiss()}
            disabled={!props.editable}
          />
          <EmojiGrid
            options={emojis.map((emoji) => ({
              value: emoji,
              label: t("posting.setupEmojiA11y", { emoji }),
            }))}
            value={lookEmoji}
            onChange={(emoji) => {
              if (props.editable) setLookEmoji(emoji);
            }}
          />
          <Field
            label={t("posting.setupCustomEmoji")}
            accessibilityLabel={t("posting.setupCustomEmoji")}
            autoFocus={focusedField === "emoji" || undefined}
            onFocus={() => setFocusedField("emoji")}
            editable={props.editable}
            value={emojis.includes(lookEmoji) ? "" : lookEmoji}
            onChangeText={(input) => {
              const emoji = [...input][0];
              if (emoji) setLookEmoji(emoji);
            }}
            placeholder={t("posting.setupCustomEmojiPlaceholder")}
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
