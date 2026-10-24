import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeMode } from "./core";
import { font, spacing } from "./tokens";

const artwork = {
  light: {
    lockup: require("../../assets/brand/lockup-color.png"),
    symbol: require("../../assets/brand/symbol-color.png"),
  },
  dark: {
    lockup: require("../../assets/brand/lockup-inverse.png"),
    symbol: require("../../assets/brand/symbol-inverse.png"),
  },
};

export function BrandLogo({ width = 200 }: { width?: number }) {
  const mode = useThemeMode();
  return <Image source={artwork[mode].lockup} accessibilityLabel="Lukapp"
    resizeMode="contain" style={{ width, height: width * 107 / 400 }} />;
}

export function BrandMark({ size = 56 }: { size?: number }) {
  const mode = useThemeMode();
  return <Image source={artwork[mode].symbol} accessible={false}
    resizeMode="contain" style={{ width: size, height: size * 107 / 100 }} />;
}

export function BrandSplash() {
  const mode = useThemeMode();
  return <SafeAreaView style={[styles.splash, { backgroundColor: mode === "dark" ? "#21132f" : "#6d28d9" }]}>
    <View style={styles.signature}>
      <Image source={require("../../assets/brand/symbol-inverse.png")} accessible={false}
        style={styles.symbol} resizeMode="contain" />
      <Image source={require("../../assets/brand/wordmark-inverse.png")} accessibilityLabel="Lukapp"
        style={styles.wordmark} resizeMode="contain" />
      <Text style={styles.promise}>Las lucas tienen{"\n"}un para qué.</Text>
      <ActivityIndicator color="#f5f3ff" accessibilityLabel="Checking local protection" />
    </View>
    <Text style={styles.footer}>Tus lucas. Tu manera de vivir.</Text>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, padding: spacing.xxl, alignItems: "center" },
  signature: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  symbol: { width: 144, height: 154 },
  wordmark: { width: 176, height: 62 },
  promise: { color: "#f5f3ff", fontFamily: font.regular, fontSize: 26, lineHeight: 32,
    textAlign: "center", marginTop: spacing.xl, marginBottom: spacing.md },
  footer: { color: "#e9ddff", fontFamily: font.regular, fontSize: 12, textAlign: "center", paddingBottom: spacing.xxl },
});
