// PROTOTYPE: native route chooser for the original workflow and four
// Notification Intake review models.

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font, fontSize, radius, spacing, themes, touchTarget } from "../theme/tokens";

const intakeRoutes = [
  {
    key: "A",
    name: "Review queue",
    detail: "One calm inbox ordered around the next decision.",
    icon: "list-outline" as const,
  },
  {
    key: "B",
    name: "Urgency lanes",
    detail: "Expiry and readiness shape the page.",
    icon: "hourglass-outline" as const,
  },
  {
    key: "C",
    name: "Batch preview",
    detail: "Selection and total come before confirmation.",
    icon: "checkbox-outline" as const,
  },
  {
    key: "D",
    name: "Priority, simplified",
    detail: "B's intent with C's quieter list rows.",
    icon: "options-outline" as const,
  },
] as const;

export default function PrototypeRoutes() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <View style={styles.prototypeTag}>
            <Text style={styles.prototypeTagText}>PROTOTYPE ROUTES</Text>
          </View>
          <Text style={styles.title}>Choose what to test</Text>
          <Text style={styles.intro}>
            Open the original transaction workflow or compare the Notification Intake structures.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>ORIGINAL WORKFLOW</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open original workflow prototype"
          onPress={() => router.push({ pathname: "/workflow", params: { variant: "E" } })}
          style={({ pressed }) => [styles.workflowCard, pressed && styles.pressed]}
        >
          <View style={styles.workflowIcon}>
            <Ionicons name="git-branch-outline" size={25} color={theme.primaryForeground} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.workflowTitle}>Mobile workflow</Text>
            <Text style={styles.workflowDetail}>The essential-first prototype and its A to E switcher.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.primaryForeground} />
        </Pressable>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionLabel}>NOTIFICATION INTAKE</Text>
          <Text style={styles.sectionHint}>Four native routes</Text>
        </View>
        <View style={styles.intakeList}>
          {intakeRoutes.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.name} Notification Intake prototype`}
              onPress={() => router.push({
                pathname: "/notification-intake/[variant]",
                params: { variant: item.key },
              })}
              style={({ pressed }) => [styles.intakeRow, pressed && styles.pressed]}
            >
              <View style={styles.variantKey}>
                <Text style={styles.variantKeyText}>{item.key}</Text>
              </View>
              <View style={styles.cardCopy}>
                <View style={styles.rowTitleLine}>
                  <Ionicons name={item.icon} size={18} color={theme.primary} />
                  <Text style={styles.rowTitle}>{item.name}</Text>
                </View>
                <Text style={styles.rowDetail}>{item.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color={theme.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.footnote}>
          Nothing here writes to the backend. Each route resets when the app reloads.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const theme = themes.light;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.section,
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  prototypeTag: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
  },
  prototypeTagText: {
    color: theme.primary,
    fontFamily: font.bold,
    fontSize: fontSize.label,
    letterSpacing: 0.8,
  },
  title: {
    color: theme.foreground,
    fontFamily: font.extrabold,
    fontSize: 34,
    lineHeight: 39,
  },
  intro: {
    color: theme.mutedForeground,
    fontFamily: font.regular,
    fontSize: fontSize.body,
    lineHeight: 23,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  sectionLabel: {
    color: theme.mutedForeground,
    fontFamily: font.bold,
    fontSize: fontSize.label,
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: theme.mutedForeground,
    fontFamily: font.regular,
    fontSize: fontSize.label,
  },
  workflowCard: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: theme.primary,
  },
  workflowIcon: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  cardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  workflowTitle: {
    color: theme.primaryForeground,
    fontFamily: font.bold,
    fontSize: fontSize.title,
  },
  workflowDetail: {
    color: "#ddd6fe",
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  intakeList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    backgroundColor: theme.background,
  },
  intakeRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  variantKey: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: "#ede9fe",
  },
  variantKeyText: {
    color: theme.primary,
    fontFamily: font.extrabold,
    fontSize: fontSize.body,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTitle: {
    color: theme.foreground,
    fontFamily: font.bold,
    fontSize: fontSize.action,
  },
  rowDetail: {
    color: theme.mutedForeground,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 19,
  },
  footnote: {
    marginTop: "auto",
    paddingTop: spacing.lg,
    color: theme.mutedForeground,
    fontFamily: font.regular,
    fontSize: fontSize.label,
    lineHeight: 18,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
