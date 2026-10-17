import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Field,
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  theme,
  ui,
} from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";

export type EntryType = "normal" | "initial" | "transfer";
export type PostingFormProps = {
  entryType?: EntryType;
  onEntryType?: (value: EntryType) => void;
  destination?: string;
  onDestination?: () => void;
  categoryEnabled?: boolean;
  hint?: string;
  postedTitle?: string;
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
  canKeepDraft?: boolean;
  onKeepDraft?: () => void;
};

export function PostingForm(props: PostingFormProps) {
  return (
    <Screen contentStyle={{ gap: spacing.xl }}>
      <Header title="Post money" eyebrow="NEW ENTRY" onBack={props.onBack} />
      {props.posted !== null && (
        <View accessibilityRole="alert" style={styles.banner}>
          <Ionicons name="checkmark-circle" size={24} color={theme.positive} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={styles.bannerTitle}>
              {props.postedTitle ?? "Posted"}
            </Text>
            <Text style={styles.detail}>{props.posted}</Text>
          </View>
          <SecondaryButton label="Done" onPress={props.onDone} />
        </View>
      )}
      <View accessibilityRole="tablist" style={styles.track}>
        <View
          accessibilityRole="tab"
          accessibilityState={{ selected: true }}
          style={styles.activeSegment}
        >
          <Text style={styles.segmentText}>One</Text>
        </View>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: false, disabled: true }}
          disabled
          style={styles.segment}
        >
          <Text style={styles.disabledText}>Batch</Text>
        </Pressable>
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.currency}>
          {props.currency === "COP" ? "$" : props.currency}
        </Text>
        <TextInput
          accessibilityLabel="Signed amount"
          value={props.amount === "-" ? "" : props.amount}
          onChangeText={props.onAmountChange}
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
              disabled: !props.editable,
            }}
            disabled={!props.editable || !props.onEntryType}
            onPress={() => props.onEntryType?.(value)}
            style={[
              styles.chip,
              (props.entryType ?? "normal") === value && {
                borderColor: theme.primary,
              },
            ]}
          >
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Description"
        accessibilityLabel="Description"
        value={props.description}
        onChangeText={props.onDescriptionChange}
        editable={props.editable}
        placeholder="What was it"
        maxLength={500}
      />
      <ListGroup>
        <ListRow
          title="Place"
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={`💰 ${props.place}`}
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
        <ListRow
          title="Category"
          value={props.categoryEnabled === false ? "Not used" : props.category}
          onPress={
            props.editable && props.categoryEnabled !== false
              ? props.onCategory
              : undefined
          }
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
        />
        <ListRow
          title="Date occurred"
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={props.date}
          onPress={props.editable ? props.onDate : undefined}
        />
      </ListGroup>
      <Text style={styles.detail}>
        {props.categoryNeedsPrimary
          ? "Open Category to choose which category is primary."
          : (props.hint ??
            "Choose up to three categories. Each counts the full amount; your spending total counts it once.")}
      </Text>
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
      <PrimaryButton
        label={
          props.busy ? "Posting…" : props.pending ? "Retry posting" : "Post"
        }
        trailingIcon="checkmark"
        disabled={!props.canSubmit}
        onPress={props.onPost}
      />
      {props.onKeepDraft ? (
        <SecondaryButton
          label="Keep as Draft"
          onPress={props.onKeepDraft}
          disabled={!props.canKeepDraft}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTitle: { fontFamily: font.bold },
  rowValue: { fontFamily: font.semibold },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    paddingLeft: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.secondary,
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
  track: {
    flexDirection: "row",
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  activeSegment: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.full,
    backgroundColor: theme.background,
    alignItems: "center",
    justifyContent: "center",
  },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontFamily: font.bold,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
  disabledText: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    color: theme.mutedForeground,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.xxl,
    minHeight: 72,
  },
  currency: {
    fontFamily: font.extrabold,
    fontSize: spacing.section,
    color: theme.mutedForeground,
  },
  amount: {
    flex: 1,
    fontFamily: font.extrabold,
    fontSize: fontSize.hero,
    minHeight: 64,
    padding: 0,
  },
  types: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 2,
    borderColor: theme.border,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
  },
  chipText: {
    fontFamily: font.bold,
    fontSize: (fontSize.label + fontSize.body) / 2,
    color: theme.foreground,
  },
});
