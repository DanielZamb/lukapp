import { useRouter } from "expo-router"
import { Platform, Pressable, StyleSheet, Text, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"

const variants = ["A", "B", "C", "D", "E"] as const;

export type PrototypeVariant = (typeof variants)[number];
const names: Record<PrototypeVariant, string> = {
  A: "Action-first",
  B: "Balance-first",
  C: "Plan-first",
  D: "Attention-first",
  E: "Essential-first",
}

export function normalizePrototypeVariant(
  value?: string,
): PrototypeVariant {
  return variants.find((candidate) => candidate === value) ?? "E";
}

export function PrototypeSwitcher({ current }: { current: PrototypeVariant; }) {
  const router = useRouter();
  const currentIndex = variants.indexOf(current);

  function move(direction: number) {
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    router.setParams({ variant: variants[nextIndex] });
  }

  return (
    <View style={styles.switcher}>
      <Pressable
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowButtonPressed]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Previous Prototype variant"
        onPress={() => move(-1)}
      >
        <Ionicons name="chevron-back" size={30} color="#ffffff" />
      </Pressable>
      <Text style={styles.switcherText}>
        PROTOTYPE: {current} - { names[current] }
      </Text>
      <Pressable
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowButtonPressed]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Next Prototype variant"
        onPress={() => move(1)}
      >
        <Ionicons name="chevron-forward" size={30} color="#ffffff" />

      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  switcher: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 16 : 56,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#1c1c1e",
    borderRadius: 999,
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    zIndex: 100,
  },
  switcherText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
  },
  arrowButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#343438",
  },
  arrowButtonPressed: {
    backgroundColor: "#52525b",
    transform: [{ scale: 0.96 }],
  },



});
