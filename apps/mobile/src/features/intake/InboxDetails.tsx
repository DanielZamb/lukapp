import type { Theme } from "../../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";
import { ActionBar, FactRow, Group, Header, IconTile, Presentation, PrimaryButton, Screen, SecondaryButton, Text, useTheme } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { LeadIcon } from "./IntakeParts";

export function WarningIconButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return (
    <View style={styles.warningSlot}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.warningRing,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open reconciliation warning"
        accessibilityHint="Explains why notification activity must be reconciled"
        hitSlop={11}
        onPress={onPress}
        style={styles.warningButton}
      >
        <Ionicons name="warning" size={15} color={theme.warning} />
      </Pressable>
    </View>
  );
}

export function ReconciliationWarning({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fact = (icon: "notifications-off-outline" | "refresh-outline" | "receipt-outline", label: string, value: string) =>
    <FactRow label={label} value={value} leading={<IconTile icon={icon} tone="neutral" size={48} />} />;
  return (
    <Presentation legacy={<Screen>
      <Header title="Reconciliation warning" eyebrow="READ BEFORE USING INTAKE" onBack={onBack} />
      <View style={styles.detail}>
        <Ionicons name="alert-circle-outline" size={36} color={theme.foreground} />
        <Text preset="detailName" tone="default" style={styles.narrow}>Notifications are a shortcut, not a statement</Text>
        <Text preset="warningBody" tone="default">
          Notification Intake may miss, delay, or duplicate activity. Reconcile against your financial accounts.
        </Text>
      </View>
      <View style={styles.facts}>
        <Text preset="bodyCopy" tone="muted">A missing notification can leave activity out.</Text>
        <Text preset="bodyCopy" tone="muted">A delayed or repeated notification can create the wrong review queue.</Text>
        <Text preset="bodyCopy" tone="muted">Only your account history can settle the difference.</Text>
      </View>
      <PrimaryButton label="I understand" onPress={onBack} />
    </Screen>}>
      <Screen footer={<ActionBar primary={{ label: "I understand", icon: "checkmark", onPress: onBack }} />}>
        <Header title="Before you use intake" eyebrow="READ ONCE" onBack={onBack} />
        <View style={styles.hero}>
          <LeadIcon icon="warning-outline" tone="warning" />
          <Text variant="section" accessibilityRole="header">A shortcut, not a statement</Text>
          <Text variant="body" tone="muted">Notifications can miss, delay or repeat activity. Reconcile against your financial accounts.</Text>
        </View>
        <View style={styles.stack}>
          <Text variant="section" accessibilityRole="header">What can go wrong</Text>
          <Group pairGap={12}>
            {fact("notifications-off-outline", "A missing notification", "Leaves activity out")}
            {fact("refresh-outline", "A repeated one", "Shows up twice")}
            {fact("receipt-outline", "What settles it", "Your account history")}
          </Group>
        </View>
      </Screen>
    </Presentation>
  );
}

export function MonthCloseWarning({
  month,
  count,
  onBack,
  onContinue,
}: {
  month: string;
  count: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Presentation legacy={<Screen>
      <Header title={`Complete ${month}`} eyebrow="BEFORE YOU CONTINUE" onBack={onBack} />
      <View style={styles.monthMessage}>
        <Text preset="monthCount" style={styles.count}>{count}</Text>
        <Text preset="monthTitle" tone="default" style={styles.narrow}>local Candidates still need a decision</Text>
        <Text preset="bodyCopy" tone="muted">
          Review any {month} activity now. Notification Intake is incomplete evidence, so this does not block Month Close.
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Review Candidates" onPress={onBack} />
        <SecondaryButton label="Continue Month Close anyway" onPress={onContinue} />
      </View>
    </Screen>}>
      <Screen footer={<ActionBar primary={{ label: "Review candidates", icon: "arrow-forward", onPress: onBack }}
        secondary={{ label: "Continue anyway", onPress: onContinue }} />}>
        <Header title={`Complete ${month}`} eyebrow="BEFORE YOU CONTINUE" onBack={onBack} />
        <View style={styles.hero}>
          <Text variant="label" tone="muted">Still on this phone</Text>
          <Text variant="screen">{count === 1 ? "1 candidate" : `${count} candidates`}</Text>
          <Text variant="body" tone="muted">They don't block Month Close.</Text>
        </View>
      </Screen>
    </Presentation>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  warningSlot: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  warningRing: {
    position: "absolute", width: 26, height: 26, borderRadius: radius.full,
    backgroundColor: theme.warning,
  },
  warningButton: {
    width: 26, height: 26, alignItems: "center", justifyContent: "center",
    borderRadius: radius.full, borderWidth: 1, borderColor: theme.warning,
    backgroundColor: "#fff7ed",
  },
  detail: { gap: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.section },
  narrow: { maxWidth: 330 },
  facts: {
    gap: spacing.lg, paddingVertical: spacing.xl,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border,
  },
  monthMessage: { gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.section },
  count: { color: theme.primary },
  actions: { gap: spacing.lg, paddingTop: spacing.xl },
  // XXXL (D4): hero block and a titled stack.
  hero: { gap: 8, paddingTop: 4 },
  stack: { gap: 12 },
  });
}
