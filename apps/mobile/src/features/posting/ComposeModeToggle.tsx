import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";

export function ComposeModeToggle({
  mode,
  count = 0,
  disabled = false,
  onMode,
}: {
  mode: "one" | "batch";
  count?: number;
  disabled?: boolean;
  onMode: (mode: "one" | "batch") => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {(["one", "batch"] as const).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="tab"
          accessibilityLabel={
            value === "one"
              ? "One"
              : count > 0
                ? `Batch, ${count} waiting`
                : "Batch"
          }
          accessibilityState={{ selected: value === mode, disabled }}
          disabled={disabled}
          onPress={() => onMode(value)}
          style={[styles.segment, value === mode && styles.active]}
        >
          <Text style={styles.label}>{value === "one" ? "One" : "Batch"}</Text>
          {value === "batch" && count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.count}>{count}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  active: { backgroundColor: theme.background },
  label: {
    fontFamily: font.bold,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontFamily: font.bold,
    fontSize: 11,
    color: theme.primaryForeground,
  },
});
