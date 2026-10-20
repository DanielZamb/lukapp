import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../src/ui/tokens";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { monthLabel, recoveryPlansRowDetail } from "../src/features/budget/model";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { Header, ListGroup, Screen, useUi, useTheme } from "../src/ui/core";
import { font, fontSize, radius, spacing } from "../src/ui/tokens";

export default function PlansRoute() {
  const defaults = usePersonalDefaults();
  return defaults ? <Plans workspaceId={defaults.workspace.id} timeZone={defaults.workspace.timeZone} />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator accessibilityLabel="Loading Plans" /></Screen>;
}

function planStyles(theme: Theme) {
  return StyleSheet.create({
    page: { gap: spacing.xl, paddingTop: spacing.md },
    row: {
      minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    lastRow: { borderBottomWidth: 0 },
    icon: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.background },
    copy: { flex: 1, gap: spacing.xs },
    title: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: 22, color: theme.foreground },
    note: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: theme.mutedForeground, textAlign: "center" },
  });
}

function Plans({ workspaceId, timeZone }: { workspaceId: string; timeZone: string }) {
  const calendar = useWorkspaceCalendar(timeZone);
  const theme = useTheme();
  const styles = useMemo(() => planStyles(theme), [theme]);
  const month = monthLabel(calendar.month, "month");
  const recovery = useQuery(api.savingsRecovery.evaluate, { workspaceId, month: calendar.month });
  const recoveryDetail = recovery === undefined ? "" : recoveryPlansRowDetail(recovery.plans);
  return (
    <Screen contentStyle={styles.page}>
      <Header title="Plans" eyebrow="LOOKING AHEAD" onBack={() => router.back()} />
      <ListGroup>
        <PlanRow title={`${month} budget`} detail="This month's limits" icon="flag-outline" onPress={() => router.push("/budget")} />
        <PlanRow title="Savings recovery" detail={recoveryDetail} icon="trending-up-outline" onPress={() => router.push("/recovery")} />
      </ListGroup>
      <Text style={styles.note}>Budget is the {month} plan. Recovery is a sibling destination. It is not a budget row.</Text>
    </Screen>
  );
}

function PlanRow({ title, detail, icon, onPress, isLast }: {
  title: string; detail: string; icon: ComponentProps<typeof Ionicons>["name"]; onPress: () => void; isLast?: boolean;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => planStyles(theme), [theme]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} onPress={onPress}
      style={[styles.row, isLast && styles.lastRow]}>
      <View style={styles.icon}><Ionicons name={icon} size={20} color={theme.foreground} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={ui.muted}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
    </Pressable>
  );
}
