import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Header, PrimaryButton, Screen, theme, ui } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney } from "../money";
import { jarPresentation, monthLabel, type BudgetJar } from "./model";

export type BudgetBoardProps = {
  month: string;
  currency: string;
  jars: BudgetJar[] | undefined;
  saved: boolean;
  canEdit: boolean;
  onBack: () => void;
  onMonth: (offset: number) => void;
  onAdd: () => void;
  onEdit: (jar: BudgetJar) => void;
  onCurrentMonth: () => void;
};

export function BudgetBoard(props: BudgetBoardProps) {
  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Header title="Budget" onBack={props.onBack} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add Budget"
          accessibilityState={{ disabled: props.jars === undefined || !props.canEdit }}
          disabled={props.jars === undefined || !props.canEdit} onPress={props.onAdd} style={styles.control}>
          <Ionicons name="add" size={24} color={theme.foreground} />
        </Pressable>
      </View>
      <View style={styles.month}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month"
          onPress={() => props.onMonth(-1)} style={styles.control}>
          <Ionicons name="chevron-back" size={20} color={theme.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={ui.label}>{monthLabel(props.month).toUpperCase()}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month"
          onPress={() => props.onMonth(1)} style={styles.control}>
          <Ionicons name="chevron-forward" size={20} color={theme.foreground} />
        </Pressable>
      </View>
      <Text style={ui.muted}>What is left in each category this month.</Text>
      {!props.canEdit && <View style={ui.section}>
        <Text style={ui.muted}>Edit limits in the current month. Past months keep their prior limits.</Text>
        <PrimaryButton label="Current month" onPress={props.onCurrentMonth} />
      </View>}
      {props.saved && <Text accessibilityRole="alert" style={ui.body}>Budget saved</Text>}
      {props.jars === undefined ? <ActivityIndicator accessibilityLabel="Loading Budget" /> :
        props.jars.length ? (
          <View style={styles.grid}>
            {props.jars.map((jar) => (
              <Jar key={jar.category.id} jar={jar} currency={props.currency} editable={props.canEdit} onPress={() => props.onEdit(jar)} />
            ))}
          </View>
        ) : (
          <View style={ui.section}>
            <Text style={ui.title}>Give a category a limit</Text>
            <Text style={ui.muted}>Add a Budget to see what is left as you spend.</Text>
            {props.canEdit && <PrimaryButton label="Add Budget" onPress={props.onAdd} />}
          </View>
        )}
      <Text style={ui.muted}>
        Categories can overlap. An expense counts in full in each selected category.
      </Text>
    </Screen>
  );
}

function Jar({ jar, currency, editable, onPress }: { jar: BudgetJar; currency: string; editable: boolean; onPress: () => void }) {
  const { over, amount, fill } = jarPresentation(jar);
  const value = formatMoney({ currency, minorUnits: amount });
  const limit = formatMoney({ currency, minorUnits: jar.limitMinorUnits });
  const spent = formatMoney({ currency, minorUnits: jar.consumptionMinorUnits });
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${jar.category.name}: ${value} ${over ? "over a limit of" : "left of"} ${limit}. ${spent} spent.${editable ? " Edit Budget." : ""}`}
      accessibilityState={{ disabled: !editable }} disabled={!editable}
      onPress={onPress} style={[styles.jar, over && styles.over]}>
      {over ? <View pointerEvents="none" style={styles.dangerWash} /> : fill > 0 && (
        <View pointerEvents="none" style={[styles.fill, { height: `${fill * 100}%` }]} />
      )}
      <Text style={styles.name}>{jar.category.emoji} {jar.category.name}</Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.amount}>{value}{over ? " over" : ""}</Text>
        <Text style={styles.of}>{over ? "of" : "left of"} {limit}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  control: { minWidth: touchTarget, minHeight: touchTarget, alignItems: "center", justifyContent: "center" },
  month: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  jar: {
    width: "47%", minHeight: 176, padding: spacing.lg, borderRadius: radius.xl,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary,
    overflow: "hidden", justifyContent: "space-between", gap: spacing.xxl,
  },
  over: { borderWidth: 2, borderColor: theme.danger, padding: spacing.lg - 1 },
  fill: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: `${theme.primary}24`,
    borderTopWidth: 2, borderTopColor: theme.primary,
  },
  dangerWash: { ...StyleSheet.absoluteFillObject, backgroundColor: `${theme.danger}24` },
  name: { fontSize: 15, fontFamily: font.semibold, color: theme.foreground },
  amount: { fontSize: fontSize.action, fontFamily: font.bold, color: theme.foreground },
  of: { fontSize: fontSize.label, fontFamily: font.regular, color: theme.foreground, lineHeight: 17 },
});
