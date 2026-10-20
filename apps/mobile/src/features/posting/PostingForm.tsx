import { formatCopInput } from "../money";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
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
import type { ReadableLayout } from "../../ui/layout";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, useUi, useTheme } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";

export type EntryType = "normal" | "initial" | "transfer";
export type PostingFormProps = {
  entryType?: EntryType;
  onEntryType?: (value: EntryType) => void;
  destination?: string;
  onDestination?: () => void;
  categoryEnabled?: boolean;
  sourceNote?: string;
  currency: string;
  amount: string;
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
  onAmountChange: (value: string) => void;
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
    amount: {
      flex: layout.reflow ? 0 : 1,
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
              <Text style={styles.bannerTitle}>Posted</Text>
              <Text style={styles.detail} numberOfLines={1}>
                {props.posted}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={props.onDone}
              style={styles.done}
            >
              <Text style={styles.segmentText}>Done</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <Header title="Post money" eyebrow="NEW ENTRY" onBack={props.onBack} />
      {props.sourceNote ? (
        <Text style={styles.detail}>{props.sourceNote}</Text>
      ) : null}
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
        <TextInput
          accessibilityLabel="Signed amount"
          value={props.amount === "-" ? "-0" : props.amount}
          onChangeText={(value) => props.onAmountChange(formatCopInput(value))}
          editable={props.editable}
          keyboardType="numbers-and-punctuation"
          placeholder="-0"
          placeholderTextColor={theme.mutedForeground}
          style={[
            styles.amount,
            {
              color:
                props.amount === "-" ? theme.mutedForeground : theme.foreground,
            },
          ]}
        />
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Entry type"
        style={styles.types}
      >
        {(
          [
            ["normal", "Normal"],
            ["initial", "Initial balance"],
            ["transfer", "Transfer"],
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
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          accessibilityLabel="Description"
          value={props.description}
          onChangeText={props.onDescriptionChange}
          editable={props.editable}
          placeholder="What was it"
          maxLength={500}
          multiline
          placeholderTextColor={theme.mutedForeground}
          style={styles.description}
        />
      </View>
      <ListGroup>
        <ListRow
          title="Place"
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={props.place}
          onPress={props.editable ? props.onPlace : undefined}
        />
        {props.entryType === "transfer" && (
          <ListRow
            title="To"
            value={props.destination ?? "Choose a place"}
            onPress={props.editable ? props.onDestination : undefined}
            titleStyle={styles.rowTitle}
            valueStyle={styles.rowValue}
          />
        )}
        {props.entryType !== "initial" && (
          <ListRow
            title="Category"
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
          title="Date occurred"
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={props.date}
          onPress={props.editable ? props.onDate : undefined}
        />
      </ListGroup>
      {props.categoryNeedsPrimary && (
        <Text style={styles.detail}>
          Open Category to choose which category is primary.
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
          This entry is saved for retry. Its answers stay fixed until posting is
          confirmed.
        </Text>
      )}
      {props.posted === null && (
        <PrimaryButton
          label={
            props.saveToBatch
              ? "Add to batch"
              : props.busy
                ? "Posting…"
                : props.pending
                  ? "Retry posting"
                  : "Post"
          }
          trailingIcon="checkmark"
          disabled={!props.canSubmit}
          onPress={props.onPost}
        />
      )}
    </Screen>
  );
}
