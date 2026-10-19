import { expect, test } from "vitest";
import config from "../../app.json";
import clerkTheme from "../../clerk-theme.json";
import { radius, themes } from "../ui/tokens";

test("native Clerk uses the approved palette and radius without changing the Android install identity", () => {
  for (const [mode, colors] of [["light", clerkTheme.colors], ["dark", clerkTheme.darkColors]] as const) {
    const theme = themes[mode];
    expect(colors).toEqual({
      primary: theme.primary,
      background: theme.background,
      input: theme.secondary,
      danger: theme.danger,
      success: theme.positive,
      warning: theme.warning,
      foreground: theme.foreground,
      mutedForeground: theme.mutedForeground,
      primaryForeground: theme.primaryForeground,
      inputForeground: theme.foreground,
      border: mode === "dark" ? "#ffffff1a" : theme.border,
      ring: theme.ring,
      muted: theme.secondary,
    });
  }
  expect(clerkTheme.design).toEqual({ borderRadius: radius.md, fontFamily: "Geist" });
  expect(config.expo.plugins).toContainEqual([
    "@clerk/expo-native-components", { theme: "./clerk-theme.json" },
  ]);
  expect(config.expo.plugins).toContainEqual([
    "expo-font", { fonts: ["./node_modules/@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf"] },
  ]);
  expect(config.expo.android).toEqual({ package: "com.lukapp.u01.dev", versionCode: 2 });
  expect(config.expo.version).toBe("0.1.0");
});
