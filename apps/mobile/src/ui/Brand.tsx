import { Image, StyleSheet, View } from "react-native";
import { useT } from "../i18n";
import { Text, useThemeMode, useTier } from "./core";
import { font } from "./tokens";

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

export function ConnectingMark() {
  const large = useTier() === "xxxl";
  return <Image source={require("../../assets/brand/symbol-inverse.png")} accessible={false}
    style={{ width: large ? 96 : 120, height: large ? 102 : 128 }} resizeMode="contain" />;
}

export function ConnectingSignature() {
  const large = useTier() === "xxxl";
  const { t } = useT();
  return <View style={styles.signature}>
    <Image source={require("../../assets/brand/wordmark-inverse.png")} accessibilityLabel="Lukapp"
      style={{ width: large ? 128 : 146, height: large ? 46 : 52 }} resizeMode="contain" />
    <Text variant="screen" style={styles.promise}>{t("access.splashPromise")}</Text>
  </View>;
}

const styles = StyleSheet.create({
  signature: { alignItems: "center", alignSelf: "stretch", gap: 36 },
  promise: { color: "#f5f3ff", fontFamily: font.regular, fontSize: 26, lineHeight: 32,
    letterSpacing: 0, textAlign: "center" },
});
