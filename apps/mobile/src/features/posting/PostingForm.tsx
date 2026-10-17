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

export type PostingFormProps = {
  currency: string;
  amount: string;
  description: string;
  date: string;
  place: string;
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
  onDate: () => void;
  onPost: () => void;
  onDone: () => void;
};

export function PostingForm(props: PostingFormProps) {
  return (
    <Screen contentStyle={{ gap: spacing.xl }}>
      <Header
        title="Post money"
        eyebrow="NEW ENTRY"
        onBack={props.onBack}
        titleStyle={styles.heading}
      />
      {props.posted !== null && (
        <View accessibilityRole="alert" style={styles.banner}>
          <Ionicons name="checkmark-circle" size={24} color={theme.positive} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={styles.bannerTitle}>Posted</Text>
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
      <View style={styles.types}>
        <View
          accessibilityRole="radio"
          accessibilityState={{ checked: true }}
          style={[styles.chip, { borderColor: theme.primary }]}
        >
          <Text style={styles.chipText}>Normal</Text>
        </View>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: false, disabled: true }}
          disabled
          style={styles.chip}
        >
          <Text style={styles.chipText}>Initial balance</Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: false, disabled: true }}
          disabled
          style={styles.chip}
        >
          <Text style={styles.chipText}>Transfer</Text>
        </Pressable>
      </View>
      <View style={styles.description}>
        <Text style={styles.descriptionLabel}>Description</Text>
        <TextInput
          accessibilityLabel="Description"
          value={props.description}
          onChangeText={props.onDescriptionChange}
          editable={props.editable}
          placeholder="What was it"
          placeholderTextColor={theme.mutedForeground}
          maxLength={500}
          style={styles.descriptionInput}
        />
      </View>
      <ListGroup>
        <ListRow
          title="Place"
          titleStyle={styles.rowTitle}
          valueStyle={styles.rowValue}
          value={`💰 ${props.place}`}
          onPress={props.editable ? props.onPlace : undefined}
        />
        <ListRow
          title="Category"
          value="No category"
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
      {props.loading && <ActivityIndicator color={theme.primary} />}
      {!!props.error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {props.error}
        </Text>
      )}
      {props.pending && (
        <Text style={styles.detail}>
          This expense is saved for retry. Its answers stay fixed until posting
          is confirmed.
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: font.extrabold,
    fontSize: fontSize.hero - spacing.md,
    lineHeight: spacing.section,
  },
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
  description: { marginBottom: spacing.xxl },
  descriptionLabel: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    color: theme.mutedForeground,
  },
  descriptionInput: {
    minHeight: touchTarget,
    fontFamily: font.regular,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
});
