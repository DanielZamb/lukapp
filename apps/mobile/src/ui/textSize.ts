import * as SecureStore from "expo-secure-store";

/** The app's own text size. `phone` follows the phone's setting; the others never go below it. */
export type TextSizePreference = "phone" | "large" | "largest";
export const textSizePreferences = ["phone", "large", "largest"] as const satisfies readonly TextSizePreference[];
export const textSizeScales: Record<TextSizePreference, number> = { phone: 1, large: 1.5, largest: 2 };

const preferenceKey = "lukapp.textSize.preference";
const answeredKey = "lukapp.textSize.asked";

export function parseTextSizePreference(value: unknown): TextSizePreference {
  return value === "large" || value === "largest" ? value : "phone";
}

/** The text size the app lays out and draws for: the larger of the phone's and the app's own. */
export function effectiveFontScale(systemScale: number, preference: TextSizePreference) {
  return Math.max(systemScale, textSizeScales[preference]);
}

export type StoredTextSize = { preference: TextSizePreference; asked: boolean };

export async function readTextSize(): Promise<StoredTextSize> {
  const [preference, asked] = await Promise.all([SecureStore.getItemAsync(preferenceKey), SecureStore.getItemAsync(answeredKey)]);
  return { preference: parseTextSizePreference(preference), asked: asked === "yes" };
}

/** Stores the choice and that the first-run question has been answered. */
export async function writeTextSize(preference: TextSizePreference): Promise<void> {
  if (preference === "phone") await SecureStore.deleteItemAsync(preferenceKey);
  else await SecureStore.setItemAsync(preferenceKey, preference);
  await SecureStore.setItemAsync(answeredKey, "yes");
}
