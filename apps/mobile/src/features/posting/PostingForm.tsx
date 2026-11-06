import { formatMoneyInput } from "../money";
import { defaultAccountingDate } from "../timeZones";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ComposeModeToggle } from "./ComposeModeToggle";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { Theme } from "../../ui/tokens";
import {
  ActionBar,
  AmountField,
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
  useUi,
  useTheme,
} from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

export type EntryType = "normal" | "initial" | "transfer";

export function postingDateOptions(timeZone: string, now = new Date()) {
  const today = defaultAccountingDate(timeZone, now);
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  const format = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return [
    {
      value: today,
      label: `Today · ${format.format(new Date(`${today}T12:00:00Z`))}`,
    },
    { value: yesterday, label: `Yesterday · ${format.format(previous)}` },
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
  blockedReason?: string;
  transferReview?: {
    required: boolean;
    canConfirm: boolean;
    onSwap: () => void;
    onConfirm: () => void;
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
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => postingFormStyles(theme), [theme]);
  const [focusedField, setFocusedField] = useState<
    "amount" | "description" | null
  >(null);
  const amountField = (
    <AmountField
      currency={props.currency}
      legacyCurrency={props.currency === "COP" ? "$" : props.currency}
      direction={
        props.entryType === "transfer"
          ? undefined
          : props.amount.startsWith("-") || props.amount.startsWith("−")
            ? "out"
            : "in"
      }
      directionLabel={
        props.entryType === "transfer" ? "Moves between places" : undefined
      }
      accessibilityLabel="Signed amount"
      autoFocus={focusedField === "amount" || undefined}
      onFocus={() => setFocusedField("amount")}
      value={props.amount === "-" ? "-0" : props.amount}
      onChangeText={(value) =>
        props.onAmountChange(formatMoneyInput(value, props.currency))
      }
      editable={props.editable}
      keyboardType="numbers-and-punctuation"
      placeholder="-0"
      placeholderTextColor={theme.mutedForeground}
      style={{
        color: props.amount === "-" ? theme.mutedForeground : theme.foreground,
      }}
    />
  );
  const descriptionField = (
    <Field
      presentation="description"
      label="Description"
      accessibilityLabel="Description"
      autoFocus={focusedField === "description" || undefined}
      onFocus={() => setFocusedField("description")}
      value={props.description}
      onChangeText={props.onDescriptionChange}
      editable={props.editable}
      placeholder="What was it"
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
                Posted
              </Text>
              <Text preset="caption" style={styles.detail} numberOfLines={1}>
                {props.posted}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={props.onDone}
              style={styles.done}
            >
              <Text preset="bodyStrong" style={styles.segmentText}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      <Header title="Post money" eyebrow="NEW ENTRY" onBack={props.onBack} />
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
            <Text preset="rowMoney" style={styles.chipText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {descriptionField}
      <ListGroup>
        <ListRow
          title={props.entryType === "transfer" ? "From" : "Place"}
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
        {(props.entryType ?? "normal") === "normal" && (
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
      {props.entryType === "transfer" && (
        <View style={ui.section}>
          <Text preset="caption" style={styles.detail}>
            Move money between places. To repay a loan, choose your existing
            loan in To. Transfers do not need a category.
          </Text>
          {props.transferReview && (
            <>
              <SecondaryButton
                label="Swap From and To"
                disabled={!props.editable || !props.transferReview.canConfirm}
                onPress={props.transferReview.onSwap}
              />
              {props.transferReview.required && (
                <PrimaryButton
                  label="Confirm From and To"
                  disabled={!props.editable || !props.transferReview.canConfirm}
                  onPress={props.transferReview.onConfirm}
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
          Open Category to choose which category is primary.
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
  const postLabel = props.saveToBatch
    ? "Add to batch"
    : props.busy
      ? "Posting…"
      : props.pending
        ? "Retry posting"
        : "Post";
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
                label: "Done",
                onPress: props.onDone,
                icon: "checkmark",
              }}
              secondary={
                props.onAnother
                  ? {
                      label: "Post another",
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
                      label: "Confirm From and To",
                      onPress: transferConfirmation.onConfirm,
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
            title="Posted"
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
              title={props.saveToBatch ? "Add to batch" : "Post money"}
              eyebrow={
                props.saveToBatch
                  ? `BATCH · ${props.batchCount ?? 0} DRAFTS`
                  : "NEW ENTRY"
              }
              onBack={props.onBack}
            />
            {props.sourceNote ? (
              <Text variant="meta" tone="muted">
                {props.sourceNote}
              </Text>
            ) : null}
            {props.pending ? (
              <InlineNotice
                tone="danger"
                title="Couldn't post yet"
                detail="It's saved for retry. These answers stay fixed until it posts."
              />
            ) : props.error ? (
              <InlineNotice
                tone="danger"
                title="Couldn't post yet"
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
              label="Entry type"
              options={[
                {
                  value: "normal",
                  label: "Normal",
                  disabled:
                    !props.editable ||
                    !props.onEntryType ||
                    props.lockEntryType,
                },
                {
                  value: "transfer",
                  label: "Transfer",
                  disabled:
                    !props.editable ||
                    !props.onEntryType ||
                    props.lockEntryType,
                },
                {
                  value: "initial",
                  label: "Initial balance",
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
                props.entryType === "transfer" ? "Between" : "Entry details"
              }
              pairGap={12}
            >
              <ListRow
                presentation="field"
                title={props.entryType === "transfer" ? "From" : "Place"}
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
                  title="To"
                  value={
                    props.destinationLook?.name ??
                    props.destination ??
                    "Choose a place"
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
                  title="Category"
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
                title="Date occurred"
                value={props.date}
                leading={<IconTile icon="calendar-outline" tone="neutral" />}
                onPress={props.editable ? props.onDate : undefined}
              />
            </Group>
            {props.entryType === "transfer" && (
              <>
                {props.transferReview && (
                  <SecondaryButton
                    label="Swap From and To"
                    disabled={
                      !props.editable || !props.transferReview.canConfirm
                    }
                    onPress={props.transferReview.onSwap}
                  />
                )}
                <Text variant="meta" tone="muted">
                  Paying a card or loan? Choose it in To. Transfers don't need a
                  category.
                </Text>
              </>
            )}
            {props.categoryNeedsPrimary && (
              <Text variant="meta" tone="muted">
                Open Category to choose which category is primary.
              </Text>
            )}
            {props.loading && <ActivityIndicator color={theme.primary} />}
          </>
        )}
      </Screen>
    </Presentation>
  );
}
