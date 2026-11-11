import * as SecureStore from "expo-secure-store";
import { parseLanguagePreference, type LanguagePreference } from "../../../../src/i18n";

const storageKey = "lukapp.language.preference";

export async function readLanguagePreference(): Promise<LanguagePreference> {
  return parseLanguagePreference(await SecureStore.getItemAsync(storageKey));
}

export async function writeLanguagePreference(preference: LanguagePreference): Promise<void> {
  if (preference === "system") await SecureStore.deleteItemAsync(storageKey);
  else await SecureStore.setItemAsync(storageKey, preference);
}
