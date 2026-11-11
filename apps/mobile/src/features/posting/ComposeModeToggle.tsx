import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { Segmented, Text, useTheme } from "../../ui/core";
import { useT } from "../../i18n";
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
  const { t } = useT();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Segmented
      options={[
        { value: "one", label: t("posting.modeOne"), disabled },
        {
          value: "batch",
          label: t("posting.modeBatch"),
          badge: count > 0 ? count : undefined,
          disabled,
        },
      ]}
      value={mode}
      onChange={onMode}
      legacy={
        <View accessibilityRole="tablist" style={styles.track}>
          {(["one", "batch"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={
                value === "one"
                  ? t("posting.modeOne")
                  : count > 0
                    ? t("posting.modeBatchWaitingA11y", { count })
                    : t("posting.modeBatch")
              }
              accessibilityState={{ selected: value === mode, disabled }}
              disabled={disabled}
              onPress={() => onMode(value)}
              style={[styles.segment, value === mode && styles.active]}
            >
              <Text
                preset={value === mode ? "composeSelected" : "composeLabel"}
                style={[styles.label, value === mode && styles.activeLabel]}
              >
                {value === "one" ? t("posting.modeOne") : t("posting.modeBatch")}
              </Text>
              {value === "batch" && count > 0 && (
                <View style={styles.badge}>
                  <Text preset="badge" style={styles.count}>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      }
    />
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
      padding: spacing.sm,
    },
    active: { backgroundColor: theme.background },
    label: {
      flexShrink: 1,
      fontFamily: font.medium,
      color: theme.mutedForeground,
    },
    activeLabel: { color: theme.foreground, fontFamily: font.bold },
    badge: {
      minWidth: 20,
      minHeight: 20,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    count: {
      fontFamily: font.bold,
      color: theme.primaryForeground,
    },
  });
}
