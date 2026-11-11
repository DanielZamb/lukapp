import { AmountField } from "../amount/AmountField";
import { AmountFrame } from "../../ui/AmountField";
import type { AmountSession } from "../amount/session";
import type { AmountNotice } from "../amount/storedText";
import { defaultAccountingDate } from "../timeZones";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ComposeModeToggle } from "./ComposeModeToggle";
import type { TransferPair } from "./usePostingEditor";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { Theme } from "../../ui/tokens";
import {
  ActionBar,
  CenteredMoment,
  ChipSet,
  EmojiTile,
  Field,
  Group,
  Header,
  IconTile,
  InlineNotice,
  ListGroup,
  ListRow,
  MoneyHero,
  Presentation,
  PrimaryButton,
  SecondaryButton,
  Screen,
  Text,
  useTextPreset,
  useUi,
  useTheme,
} from "../../ui/core";
import { formatDayMonth, useT, type Translator } from "../../i18n";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

export type EntryType = "normal" | "initial" | "transfer";

export function postingDateOptions(timeZone: string, { t, language }: Translator, now = new Date()) {
  const today = defaultAccountingDate(timeZone, now);
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  return [
    { value: today, label: t("posting.dateToday", { date: formatDayMonth(language, new Date(`${today}T12:00:00Z`), "UTC") }) },
    { value: yesterday, label: t("posting.dateYesterday", { date: formatDayMonth(language, previous, "UTC") }) },
  ];
}

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
  receipt?: {
    description: string;
    amount: string;
    minorUnits: number;
    category?: {
      name: string;
      emoji: string;
      color: ComponentProps<typeof EmojiTile>["color"];
    };
  };
  onAnother?: () => void;
  placeLook?: { name: string; emoji: string };
  destinationLook?: { name: string; emoji: string };
  categoryLook?: {
    name: string;
    emoji: string;
    color: ComponentProps<typeof EmojiTile>["color"];
  };
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
    /** The From and To shown beside the button; confirming applies only while they are still the pair. */
    pair?: TransferPair;
    onSwap: () => void;
    onConfirm: (shown?: TransferPair) => void;
  };
};

function postingFormStyles(theme: Theme) {
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
    bannerTitle: {
      fontFamily: font.bold,
      color: theme.foreground,
    },
    detail: {
      fontFamily: font.regular,
      color: theme.mutedForeground,
    },
    segmentText: {
      fontFamily: font.bold,
      color: theme.foreground,
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
      color: theme.foreground,
    },
  });
}

export function PostingForm(props: PostingFormProps) {
  const { t } = useT();
  const signOnly = /^[+−-]$/.test(props.amount.editor.text.trim());
  const notice = props.amountNotice?.kind === "reenter" ? t("amount.noticeReenter", { previous: props.amountNotice.previous }) : null;
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => postingFormStyles(theme), [theme]);
  const [focusedField, setFocusedField] = useState<"description" | null>(null);
  const amountInput = useTextPreset("amountInput", { minHeight: 64, padding: 0 });
  const amountField = (
    <AmountFrame
      currency={props.currency}
      legacyCurrency={props.currency === "COP" ? "$" : props.currency}
      direction={
        props.entryType === "transfer"
          ? undefined
          : props.amount.sign === "-"
            ? "out"
            : "in"
      }
      directionLabel={
        props.entryType === "transfer" ? t("posting.formMovesBetween") : undefined
      }
    >
      <AmountField
        session={props.amount}
        onChange={props.onAmountChange}
        editable={props.editable}
        inputAccessibilityLabel={t("posting.formAmountA11y")}
        placeholder="0"
        sign={{ disabled: props.signLocked === true }}
        notice={notice}
        inputStyle={[amountInput.style, { color: signOnly ? theme.mutedForeground : theme.foreground }]}
      />
    </AmountFrame>
  );
  const descriptionField = (
    <Field
      presentation="description"
      label={t("posting.formDescription")}
      accessibilityLabel={t("posting.formDescription")}
      autoFocus={focusedField === "description" || undefined}
      onFocus={() => setFocusedField("description")}
      value={props.description}
      onChangeText={props.onDescriptionChange}
      editable={props.editable}
      placeholder={t("posting.formDescriptionPlaceholder")}
      maxLength={500}
      multiline
    />
  );
  const legacy = (
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
              <Text preset="bodyStrong" style={styles.bannerTitle}>
                {t("posting.formPosted")}
              </Text>
              <Text preset="caption" style={styles.detail} numberOfLines={2}>
                {props.posted}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.done")}
              onPress={props.onDone}
              style={styles.done}
            >
              <Text preset="bodyStrong" style={styles.segmentText}>
                {t("common.done")}
              </Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <Header title={t("posting.title")} eyebrow={t("posting.eyebrow")} onBack={props.onBack} />
      {props.notification ?? (props.sourceNote ? (
        <Text preset="caption" style={styles.detail}>
          {props.sourceNote}
        </Text>
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
      {amountField}
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
            <Text preset="rowMoney" style={styles.chipText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {descriptionField}
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
      {props.entryType === "transfer" && (
        <View style={ui.section}>
          <Text preset="caption" style={styles.detail}>
            {t("posting.formTransferHelp")}
          </Text>
          {props.transferReview && (
            <>
              <SecondaryButton
                label={t("posting.formSwap")}
                disabled={!props.editable || !props.transferReview.canConfirm}
                onPress={props.transferReview.onSwap}
              />
              {props.transferReview.required && (
                <PrimaryButton
                  label={t("posting.formConfirmPlaces")}
                  disabled={!props.editable || !props.transferReview.canConfirm}
                  onPress={() => props.transferReview?.onConfirm(props.transferReview.pair)}
                />
              )}
            </>
          )}
        </View>
      )}
      {!!props.blockedReason && !props.canSubmit && !props.pending && (
        <Text preset="caption" style={styles.detail}>
          {props.blockedReason}
        </Text>
      )}
      {props.categoryNeedsPrimary && (
        <Text preset="caption" style={styles.detail}>
          {t("posting.formPrimaryHint")}
        </Text>
      )}
      {props.loading && <ActivityIndicator color={theme.primary} />}
      {!!props.error && (
        <Text preset="caption" accessibilityRole="alert" style={ui.error}>
          {props.error}
        </Text>
      )}
      {props.pending && (
        <Text preset="caption" style={styles.detail}>
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
  const postLabel = props.saveToBatch
    ? t("posting.formAddToBatch")
    : props.busy
      ? t("posting.formPosting")
      : props.pending
        ? t("posting.formRetry")
        : t("posting.formPost");
  const posted = !props.saveToBatch && props.posted !== null;
  const transferConfirmation =
    props.entryType === "transfer" && props.transferReview?.required
      ? props.transferReview
      : undefined;
  const reason =
    props.blockedReason && !props.canSubmit && !props.pending
      ? props.blockedReason
      : undefined;
  return (
    <Presentation legacy={legacy}>
      <Screen
        footer={
          posted ? (
            <ActionBar
              primary={{
                label: t("common.done"),
                onPress: props.onDone,
                icon: "checkmark",
              }}
              secondary={
                props.onAnother
                  ? {
                      label: t("posting.formPostAnother"),
                      onPress: props.onAnother,
                      icon: "add",
                    }
                  : undefined
              }
            />
          ) : (
            <ActionBar
              primary={
                transferConfirmation
                  ? {
                      label: t("posting.formConfirmPlaces"),
                      onPress: () => transferConfirmation.onConfirm(transferConfirmation.pair),
                      disabled:
                        !props.editable || !transferConfirmation.canConfirm,
                      icon: "checkmark",
                    }
                  : {
                      label: postLabel,
                      onPress: props.onPost,
                      disabled: !props.canSubmit,
                      icon: props.saveToBatch
                        ? "add"
                        : props.pending
                          ? "refresh-outline"
                          : "checkmark",
                    }
              }
              status={
                reason && !transferConfirmation?.canConfirm ? (
                  <InlineNotice tone="warning" title={reason} />
                ) : undefined
              }
            />
          )
        }
      >
        {posted ? (
          <CenteredMoment
            icon="checkmark"
            tone="positive"
            title={t("posting.formPosted")}
            body={props.receipt?.description ?? props.posted ?? undefined}
            amount={
              props.receipt ? (
                <MoneyHero
                  currency={props.currency}
                  amount={props.receipt.amount}
                  negative={props.receipt.minorUnits < 0}
                  tone={props.receipt.minorUnits > 0 ? "positive" : "default"}
                  align="center"
                />
              ) : undefined
            }
            chip={
              props.receipt?.category ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <EmojiTile
                    emoji={props.receipt.category.emoji}
                    color={props.receipt.category.color}
                    size={36}
                  />
                  <Text variant="rowTitle">{props.receipt.category.name}</Text>
                </View>
              ) : undefined
            }
          />
        ) : (
          <>
            <Header
              title={props.saveToBatch ? t("posting.formAddToBatch") : t("posting.title")}
              eyebrow={
                props.saveToBatch
                  ? t("posting.formBatchEyebrow", { count: props.batchCount ?? 0 })
                  : t("posting.eyebrow")
              }
              onBack={props.onBack}
            />
            {props.notification ?? (props.sourceNote ? (
              <Text variant="meta" tone="muted">
                {props.sourceNote}
              </Text>
            ) : null)}
            {props.pending ? (
              <InlineNotice
                tone="danger"
                title={t("posting.formCouldntPost")}
                detail={t("posting.formSavedForRetry")}
              />
            ) : props.error ? (
              <InlineNotice
                tone="danger"
                title={t("posting.formCouldntPost")}
                detail={props.error}
              />
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
            {amountField}
            <ChipSet
              label={t("posting.formEntryTypeA11y")}
              options={[
                {
                  value: "normal",
                  label: t("posting.formTypeNormal"),
                  disabled:
                    !props.editable ||
                    !props.onEntryType ||
                    props.lockEntryType,
                },
                {
                  value: "transfer",
                  label: t("posting.formTypeTransfer"),
                  disabled:
                    !props.editable ||
                    !props.onEntryType ||
                    props.lockEntryType,
                },
                {
                  value: "initial",
                  label: t("posting.formTypeInitial"),
                  wide: true,
                  disabled:
                    !props.editable ||
                    !props.onEntryType ||
                    props.lockEntryType,
                },
              ]}
              value={props.entryType ?? "normal"}
              onChange={(value) => props.onEntryType?.(value)}
            />
            {descriptionField}
            <Group
              title={
                props.entryType === "transfer" ? t("posting.formBetween") : t("posting.formEntryDetails")
              }
              pairGap={12}
            >
              <ListRow
                presentation="field"
                title={props.entryType === "transfer" ? t("posting.formFrom") : t("posting.formPlace")}
                value={props.placeLook?.name ?? props.place}
                leading={
                  <EmojiTile
                    emoji={props.placeLook?.emoji ?? "💰"}
                    color={theme.primary}
                  />
                }
                onPress={props.editable ? props.onPlace : undefined}
              />
              {props.entryType === "transfer" && (
                <ListRow
                  presentation="field"
                  title={t("posting.formTo")}
                  value={
                    props.destinationLook?.name ??
                    props.destination ??
                    t("posting.formChoosePlace")
                  }
                  leading={
                    <EmojiTile
                      emoji={props.destinationLook?.emoji ?? "💰"}
                      color={theme.primary}
                    />
                  }
                  onPress={props.editable ? props.onDestination : undefined}
                />
              )}
              {(props.entryType ?? "normal") === "normal" && (
                <ListRow
                  presentation="field"
                  title={t("posting.formCategory")}
                  value={props.categoryLook?.name ?? props.category}
                  leading={
                    <EmojiTile
                      emoji={props.categoryLook?.emoji ?? "🏷️"}
                      color={props.categoryLook?.color ?? theme.primary}
                    />
                  }
                  onPress={
                    props.editable && props.categoryEnabled !== false
                      ? props.onCategory
                      : undefined
                  }
                />
              )}
              <ListRow
                presentation="field"
                title={t("posting.formDate")}
                value={props.date}
                leading={<IconTile icon="calendar-outline" tone="neutral" />}
                onPress={props.editable ? props.onDate : undefined}
              />
            </Group>
            {props.entryType === "transfer" && (
              <>
                {props.transferReview && (
                  <SecondaryButton
                    label={t("posting.formSwap")}
                    disabled={
                      !props.editable || !props.transferReview.canConfirm
                    }
                    onPress={props.transferReview.onSwap}
                  />
                )}
                <Text variant="meta" tone="muted">
                  {t("posting.formTransferHint")}
                </Text>
              </>
            )}
            {props.categoryNeedsPrimary && (
              <Text variant="meta" tone="muted">
                {t("posting.formPrimaryHint")}
              </Text>
            )}
            {props.loading && <ActivityIndicator color={theme.primary} />}
            {props.secondaryActions}
          </>
        )}
      </Screen>
    </Presentation>
  );
}
