import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
          <Text style={[styles.label, value === mode && styles.activeLabel]}>{value === "one" ? "One" : "Batch"}</Text>
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
function createStyles(theme: Theme) {
  return StyleSheet.create({
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
      fontFamily: font.medium,
      fontSize: 13,
      color: theme.mutedForeground,
    },
    activeLabel: { color: theme.foreground, fontFamily: font.bold },
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
}
