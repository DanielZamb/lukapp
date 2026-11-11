import type { Theme } from "../../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";
import { ActionBar, FactRow, Group, Header, IconTile, Presentation, PrimaryButton, Screen, SecondaryButton, Text, useTheme } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { useT } from "../../i18n";
import { LeadIcon } from "./IntakeParts";

export function WarningIconButton({ onPress }: { onPress: () => void }) {
  const { t } = useT();
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
        accessibilityLabel={t("inbox.warningA11y")}
        accessibilityHint={t("inbox.warningHint")}
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
  const { t } = useT();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fact = (icon: "notifications-off-outline" | "refresh-outline" | "receipt-outline", label: string, value: string) =>
    <FactRow label={label} value={value} leading={<IconTile icon={icon} tone="neutral" size={48} />} />;
  return (
    <Presentation legacy={<Screen>
      <Header title={t("inbox.reconcileTitle")} eyebrow={t("inbox.reconcileEyebrow")} onBack={onBack} />
      <View style={styles.detail}>
        <Ionicons name="alert-circle-outline" size={36} color={theme.foreground} />
        <Text preset="detailName" tone="default" style={styles.narrow}>{t("inbox.reconcileHeadline")}</Text>
        <Text preset="warningBody" tone="default">{t("inbox.reconcileBody")}</Text>
      </View>
      <View style={styles.facts}>
        <Text preset="bodyCopy" tone="muted">{t("inbox.reconcileMissing")}</Text>
        <Text preset="bodyCopy" tone="muted">{t("inbox.reconcileDelayed")}</Text>
        <Text preset="bodyCopy" tone="muted">{t("inbox.reconcileHistory")}</Text>
      </View>
      <PrimaryButton label={t("inbox.reconcileOk")} onPress={onBack} />
    </Screen>}>
      <Screen footer={<ActionBar primary={{ label: t("inbox.reconcileOk"), icon: "checkmark", onPress: onBack }} />}>
        <Header title={t("inbox.reconcileTitleLarge")} eyebrow={t("inbox.reconcileEyebrowLarge")} onBack={onBack} />
        <View style={styles.hero}>
          <LeadIcon icon="warning-outline" tone="warning" />
          <Text variant="section" accessibilityRole="header">{t("inbox.shortcutTitle")}</Text>
          <Text variant="body" tone="muted">{t("inbox.reconcileBody")}</Text>
        </View>
        <View style={styles.stack}>
          <Text variant="section" accessibilityRole="header">{t("inbox.reconcileWrong")}</Text>
          <Group pairGap={12}>
            {fact("notifications-off-outline", t("inbox.factMissing"), t("inbox.factMissingValue"))}
            {fact("refresh-outline", t("inbox.factRepeated"), t("inbox.factRepeatedValue"))}
            {fact("receipt-outline", t("inbox.factSettles"), t("inbox.factSettlesValue"))}
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
  const { t, tn } = useT();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Presentation legacy={<Screen>
      <Header title={t("inbox.monthCloseTitle", { month })} eyebrow={t("inbox.monthCloseEyebrow")} onBack={onBack} />
      <View style={styles.monthMessage}>
        <Text preset="monthCount" style={styles.count}>{count}</Text>
        <Text preset="monthTitle" tone="default" style={styles.narrow}>{tn("inbox.monthCloseCount", count)}</Text>
        <Text preset="bodyCopy" tone="muted">{t("inbox.monthCloseBody", { month })}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t("inbox.monthCloseReview")} onPress={onBack} />
        <SecondaryButton label={t("inbox.monthCloseAnyway")} onPress={onContinue} />
      </View>
    </Screen>}>
      <Screen footer={<ActionBar primary={{ label: t("inbox.monthCloseReview"), icon: "arrow-forward", onPress: onBack }}
        secondary={{ label: t("inbox.monthCloseAnywayShort"), onPress: onContinue }} />}>
        <Header title={t("inbox.monthCloseTitle", { month })} eyebrow={t("inbox.monthCloseEyebrow")} onBack={onBack} />
        <View style={styles.hero}>
          <Text variant="label" tone="muted">{t("inbox.stillOnPhone")}</Text>
          <Text variant="screen">{tn("inbox.candidateCount", count)}</Text>
          <Text variant="body" tone="muted">{t("inbox.noBlockMonthClose")}</Text>
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
