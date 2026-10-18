// Floating evaluation bar for throwaway UI variants. Not part of the design.

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export function PrototypeSwitcher<T extends string>({
  variants,
  names,
  current,
  param = "variant",
}: {
  variants: readonly T[];
  names: Record<T, string>;
  current: T;
  param?: string;
}) {
  const router = useRouter();
  const index = Math.max(0, variants.indexOf(current));

  function go(next: T) {
    router.setParams({ [param]: next });
  }

  function step(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    if (next) {
      go(next);
    }
  }

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        step(-1);
      }
      if (event.key === "ArrowRight") {
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous variant"
          onPress={() => step(-1)}
          style={styles.arrow}
        >
          <Ionicons name="chevron-back" size={18} color="#f5f3ff" />
        </Pressable>
        <Text style={styles.label}>
          {current} — {names[current]}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next variant"
          onPress={() => step(1)}
          style={styles.arrow}
        >
          <Ionicons name="chevron-forward" size={18} color="#f5f3ff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#111113",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    minWidth: 168,
    color: "#f5f3ff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});
