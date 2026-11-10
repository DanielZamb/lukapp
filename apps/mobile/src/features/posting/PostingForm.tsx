import { AmountField } from "../amount/AmountField";
import type { AmountSession } from "../amount/session";
import type { AmountNotice } from "../amount/storedText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ReactNode } from "react";
import { ComposeModeToggle } from "./ComposeModeToggle";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import { useT } from "../../i18n";
import type { ReadableLayout } from "../../ui/layout";
import { Header, ListGroup, ListRow, PrimaryButton, SecondaryButton, Screen, useUi, useTheme } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";

export type EntryType = "normal" | "initial" | "transfer";
export type PostingFormProps = {
  entryType?: EntryType;
  onEntryType?: (value: EntryType) => void;
  destination?: string;
  onDestination?: () => void;
  categoryEnabled?: boolean;
  sourceNote?: string;
  /** Shown under the header in place of the source note, e.g. the notification a Candidate came from. */
  notification?: ReactNode;
  currency: string;
  amount: AmountSession;
  /** Set when a saved amount reopened in a new form or could not be read. */
  amountNotice?: AmountNotice | null;
  /** True while the chosen category decides the sign. */
  signLocked?: boolean;
  description: string;
  date: string;
  place: string;
  category: string;
  categoryNeedsPrimary?: boolean;
  editable: boolean;
  loading: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  error: string;
  posted: string | null;
  onAmountChange: (value: AmountSession) => void;
  onDescriptionChange: (value: string) => void;
  onBack: () => void;
  onPlace: () => void;
  onCategory: () => void;
  onDate: () => void;
  onPost: () => void;
  onDone: () => void;
  lockEntryType?: boolean;
  batchCount?: number;
  onBatch?: () => void;
  saveToBatch?: boolean;
  blockedReason?: string;
  /** Actions under Post, such as keeping or discarding this entry. */
  secondaryActions?: ReactNode;
  transferReview?: {
    required: boolean;
    canConfirm: boolean;
    onSwap: () => void;
    onConfirm: () => void;
  };
};

function postingFormStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    rowTitle: { fontFamily: font.bold },
    rowValue: { fontFamily: font.semibold },
    banner: {
      margin: spacing.xxl,
      marginTop: spacing.md,
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    postedIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    done: {
      minHeight: touchTarget,
      minWidth: touchTarget,
      alignItems: "center",
      justifyContent: "center",
    },
    openField: { gap: spacing.xs },
    fieldLabel: {
      fontFamily: font.semibold,
      fontSize: 14,
      color: theme.mutedForeground,
    },
    description: {
      minHeight: 44,
      padding: 0,
      fontFamily: font.regular,
      fontSize: fontSize.body,
      lineHeight: 24,
      color: theme.foreground,
    },
    bannerTitle: {
      fontFamily: font.bold,
      fontSize: fontSize.body,
      color: theme.foreground,
    },
    detail: {
      fontFamily: font.regular,
      fontSize: fontSize.label,
      color: theme.mutedForeground,
    },
    segmentText: {
      fontFamily: font.bold,
      fontSize: fontSize.body,
      color: theme.foreground,
    },
    amountRow: {
      flexDirection: layout.reflow ? "column" : "row",
      alignItems: layout.reflow ? "stretch" : "center",
      gap: spacing.sm,
      minHeight: 72,
    },
    currency: {
      fontFamily: font.semibold,
      fontSize: 28,
      color: theme.mutedForeground,
    },
    amountField: { flex: layout.reflow ? 0 : 1 },
    amount: {
      fontFamily: font.extrabold,
      fontSize: fontSize.hero,
      minHeight: 64,
      padding: 0,
    },
    types: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
    chip: {
      maxWidth: "100%",
      paddingVertical: spacing.sm,
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
    },
    chipText: {
      flexShrink: 1,
      fontFamily: font.semibold,
      fontSize: (fontSize.label + fontSize.body) / 2,
      color: theme.foreground,
    },
  });
}

export function PostingForm(props: PostingFormProps) {
  const { t } = useT();
  const signOnly = /^[+−-]$/.test(props.amount.editor.text.trim());
  const notice = props.amountNotice?.kind === "converted"
    ? t("amount.noticeConverted", { previous: props.amountNotice.previous, current: props.amount.editor.text })
    : props.amountNotice?.kind === "reenter" ? t("amount.noticeReenter", { previous: props.amountNotice.previous }) : null;
  const ui = useUi();
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => postingFormStyles(theme, layout), [theme, layout]);
  return (
    <Screen
      contentStyle={{ gap: spacing.xl }}
      footer={
        !props.saveToBatch && props.posted !== null ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.banner}
          >
            <View style={styles.postedIcon}>
              <Ionicons
                name="checkmark"
                size={18}
                color={theme.primaryForeground}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={styles.bannerTitle}>{t("posting.formPosted")}</Text>
              <Text style={styles.detail} numberOfLines={2}>
                {props.posted}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.done")}
              onPress={props.onDone}
              style={styles.done}
            >
              <Text style={styles.segmentText}>{t("common.done")}</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <Header title={t("posting.title")} eyebrow={t("posting.eyebrow")} onBack={props.onBack} />
      {props.notification ?? (props.sourceNote ? (
        <Text style={styles.detail}>{props.sourceNote}</Text>
      ) : null)}
      {!props.saveToBatch && (
        <ComposeModeToggle
          mode="one"
          count={props.batchCount}
          disabled={!props.onBatch || !props.editable}
          onMode={(mode) => {
            if (mode === "batch") props.onBatch?.();
          }}
        />
      )}
      <View style={styles.amountRow}>
        <Text style={styles.currency}>
          {props.currency === "COP" ? "$" : props.currency}
        </Text>
        <View style={styles.amountField}>
          <AmountField
            session={props.amount}
            onChange={props.onAmountChange}
            editable={props.editable}
            inputAccessibilityLabel={t("posting.formAmountA11y")}
            placeholder="0"
            sign={{ disabled: props.signLocked === true }}
            notice={notice}
            inputStyle={[styles.amount, { color: signOnly ? theme.mutedForeground : theme.foreground }]}
          />
        </View>
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("posting.formEntryTypeA11y")}
        style={styles.types}
      >
        {(
          [
            ["normal", t("posting.formTypeNormal")],
            ["initial", t("posting.formTypeInitial")],
            ["transfer", t("posting.formTypeTransfer")],
          ] satisfies Array<[EntryType, string]>
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{
              checked: (props.entryType ?? "normal") === value,
              disabled: !props.editable || props.lockEntryType === true,
            }}
            disabled={
              !props.editable ||
              !props.onEntryType ||
              props.lockEntryType === true
            }
            onPress={
              props.lockEntryType === true
                ? undefined
                : () => props.onEntryType?.(value)
            }
            style={[
              styles.chip,
              (props.entryType ?? "normal") === value && {
                borderColor: theme.primary,
                borderWidth: 2,
              },
            ]}
          >
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.openField}>
        <Text style={styles.fieldLabel}>{t("posting.formDescription")}</Text>
        <TextInput
          accessibilityLabel={t("posting.formDescription")}
          value={props.description}
          onChangeText={props.onDescriptionChange}
          editable={props.editable}
          placeholder={t("posting.formDescriptionPlaceholder")}
          maxLength={500}
          multiline
          placeholderTextColor={theme.mutedForeground}
          style={styles.description}
        />
      </View>
      <ListGroup>
        <ListRow
          title={props.entryType === "transfer" ? t("posting.formFrom") : t("posting.formPlace")}
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={props.place}
          onPress={props.editable ? props.onPlace : undefined}
        />
        {props.entryType === "transfer" && (
          <ListRow
            title={t("posting.formTo")}
            value={props.destination ?? t("posting.formChoosePlace")}
            onPress={props.editable ? props.onDestination : undefined}
            titleStyle={styles.rowTitle}
            valueStyle={styles.rowValue}
          />
        )}
        {(props.entryType ?? "normal") === "normal" && (
          <ListRow
            title={t("posting.formCategory")}
            value={props.category}
            onPress={
              props.editable && props.categoryEnabled !== false
                ? props.onCategory
                : undefined
            }
            titleStyle={styles.rowTitle}
            valueStyle={styles.rowValue}
          />
        )}
        <ListRow
          title={t("posting.formDate")}
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={props.date}
          onPress={props.editable ? props.onDate : undefined}
        />
      </ListGroup>
      {props.entryType === "transfer" && <View style={ui.section}>
        <Text style={styles.detail}>{t("posting.formTransferHelp")}</Text>
        {props.transferReview && <>
          <SecondaryButton label={t("posting.formSwap")} disabled={!props.editable || !props.transferReview.canConfirm}
            onPress={props.transferReview.onSwap} />
          {props.transferReview.required && <PrimaryButton label={t("posting.formConfirmPlaces")}
            disabled={!props.editable || !props.transferReview.canConfirm} onPress={props.transferReview.onConfirm} />}
        </>}
      </View>}
      {!!props.blockedReason && !props.canSubmit && !props.pending && <Text style={styles.detail}>{props.blockedReason}</Text>}
      {props.categoryNeedsPrimary && (
        <Text style={styles.detail}>
          {t("posting.formPrimaryHint")}
        </Text>
      )}
      {props.loading && <ActivityIndicator color={theme.primary} />}
      {!!props.error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {props.error}
        </Text>
      )}
      {props.pending && (
        <Text style={styles.detail}>
          {t("posting.formPendingNote")}
        </Text>
      )}
      {props.posted === null && (
        <PrimaryButton
          label={
            props.saveToBatch
              ? t("posting.formAddToBatch")
              : props.busy
                ? t("posting.formPosting")
                : props.pending
                  ? t("posting.formRetry")
                  : t("posting.formPost")
          }
          trailingIcon="checkmark"
          disabled={!props.canSubmit}
          onPress={props.onPost}
        />
      )}
      {props.secondaryActions}
    </Screen>
  );
}
