import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Header, PrimaryButton, Screen, SecondaryButton, theme, ui } from "../../ui/core";
import { font, radius, spacing } from "../../ui/tokens";

export function WarningIconButton({ onPress }: { onPress: () => void }) {
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
  return (
    <Screen>
      <Header title="Reconciliation warning" eyebrow="READ BEFORE USING INTAKE" onBack={onBack} />
      <View style={styles.detail}>
        <Ionicons name="alert-circle-outline" size={36} color={theme.foreground} />
        <Text style={styles.detailTitle}>Notifications are a shortcut, not a statement</Text>
        <Text style={styles.warningCopy}>
          Notification Intake may miss, delay, or duplicate activity. Reconcile against your financial accounts.
        </Text>
      </View>
      <View style={styles.facts}>
        <Text style={styles.body}>A missing notification can leave activity out.</Text>
        <Text style={styles.body}>A delayed or repeated notification can create the wrong review queue.</Text>
        <Text style={styles.body}>Only your account history can settle the difference.</Text>
      </View>
      <PrimaryButton label="I understand" onPress={onBack} />
    </Screen>
  );
}

export function IntakeSources({ onBack }: { onBack: () => void }) {
  return (
    <Screen>
      <Header title="Notification Intake" eyebrow="PRIVATE DEVICE SETUP" onBack={onBack} />
      <View style={styles.detail}>
        <View style={styles.disclosureIcon}>
          <Ionicons name="shield-checkmark-outline" size={30} color={theme.primary} />
        </View>
        <Text style={styles.detailTitle}>Your notifications stay on this device</Text>
        <Text style={styles.body}>
          Lukapp reads only sources you select. Candidates expire after 15 days. Raw notification text is never uploaded. Capture may still miss activity.
        </Text>
      </View>
      <View style={styles.health} accessibilityLiveRegion="polite">
        <Text style={ui.label}>{Platform.OS === "ios" ? "IOS AUTOMATION" : "ANDROID LISTENER"}</Text>
        <Text style={styles.healthState}>Waiting for a source</Text>
        <Text style={styles.healthCheck}>Last health check · just now</Text>
      </View>
    </Screen>
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
  return (
    <Screen>
      <Header title={`Complete ${month}`} eyebrow="BEFORE YOU CONTINUE" onBack={onBack} />
      <View style={styles.monthMessage}>
        <Text style={styles.monthCount}>{count}</Text>
        <Text style={styles.monthTitle}>local Candidates still need a decision</Text>
        <Text style={styles.body}>
          Review any {month} activity now. Notification Intake is incomplete evidence, so this does not block Month Close.
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Review Candidates" onPress={onBack} />
        <SecondaryButton label="Continue Month Close anyway" onPress={onContinue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  detailTitle: {
    maxWidth: 330, color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold,
  },
  warningCopy: { color: theme.foreground, fontSize: 18, lineHeight: 27, fontFamily: font.regular },
  body: { color: theme.mutedForeground, fontSize: 16, lineHeight: 24, fontFamily: font.regular },
  facts: {
    gap: spacing.lg, paddingVertical: spacing.xl,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border,
  },
  disclosureIcon: {
    width: 72, height: 72, borderRadius: radius.lg, backgroundColor: theme.secondary,
    alignItems: "center", justifyContent: "center",
  },
  health: {
    gap: spacing.xs, paddingVertical: spacing.xl, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  healthState: { color: theme.foreground, fontSize: 28, lineHeight: 33, fontFamily: font.extrabold },
  healthCheck: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  monthMessage: { gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.section },
  monthCount: { color: theme.primary, fontSize: 64, lineHeight: 68, fontFamily: font.extrabold, letterSpacing: -2 },
  monthTitle: { maxWidth: 330, color: theme.foreground, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold },
  actions: { gap: spacing.lg, paddingTop: spacing.xl },
});
