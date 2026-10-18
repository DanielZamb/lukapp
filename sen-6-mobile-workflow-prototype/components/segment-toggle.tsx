import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { font, radius, spacing, type Theme } from "../theme/tokens";

export type ComposeMode = "single" | "batch";

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// A track with a thumb, deliberately not the pill chips used for fields:
// this switches what the whole list or screen is.
export function SegmentToggle<T extends string>({
  value,
  segments,
  theme,
  onChange,
}: {
  value: T;
  segments: readonly SegmentOption<T>[];
  theme: Theme;
  onChange: (id: T) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.modeTrack} accessibilityRole="radiogroup">
      {segments.map((entry) => {
        const on = value === entry.id;
        const badge = entry.badge ?? 0;
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              badge > 0 ? `${entry.label}, ${badge} waiting` : entry.label
            }
            hitSlop={{ top: 6, bottom: 6 }}
            onPressIn={lightTap}
            onPress={() => onChange(entry.id)}
            style={[styles.modeSegment, on && styles.modeSegmentOn]}
          >
            <Text
              style={[styles.modeLabel, on && styles.modeLabelOn]}
              numberOfLines={1}
            >
              {entry.label}
            </Text>
            {badge > 0 && (
              <View style={styles.modeBadge}>
                <Text style={styles.modeBadgeText}>{badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// The count rides on the Batch segment so a waiting batch stays visible from
// One, which is the only place it would otherwise be invisible.
export function ComposeModeToggle({
  mode,
  theme,
  count = 0,
  onMode,
}: {
  mode: ComposeMode;
  theme: Theme;
  count?: number;
  onMode: (mode: ComposeMode) => void;
}) {
  return (
    <SegmentToggle
      value={mode}
      theme={theme}
      onChange={onMode}
      segments={[
        { id: "single", label: "One" },
        { id: "batch", label: "Batch", badge: count },
      ]}
    />
  );
}

function createStyles(theme: Theme) {
  return {
    modeTrack: {
      flexDirection: "row" as const,
      padding: 3,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modeSegment: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: spacing.sm,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
    },
    modeSegmentOn: {
      backgroundColor: theme.background,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    modeLabel: {
      color: theme.mutedForeground,
      fontSize: 13,
      fontFamily: font.medium,
      flexShrink: 1,
    },
    modeLabelOn: { color: theme.foreground, fontFamily: font.bold },
    modeBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    modeBadgeText: {
      color: theme.primaryForeground,
      fontSize: 11,
      fontFamily: font.bold,
    },
  };
}
