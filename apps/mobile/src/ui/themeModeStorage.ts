import * as SecureStore from "expo-secure-store";
import type { ThemeMode } from "./tokens";

const storageKey = "lukapp.appearance.themeMode";

export async function readThemeMode(): Promise<ThemeMode> {
  const raw = await SecureStore.getItemAsync(storageKey);
  return raw === "dark" ? "dark" : "light";
}

export async function writeThemeMode(mode: ThemeMode): Promise<void> {
  await SecureStore.setItemAsync(storageKey, mode);
}
