import * as SecureStore from "expo-secure-store";

const shakeKey = "lukapp.feedback.shake";
const guideKey = "lukapp.feedback.guide";

export async function readShakeEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(shakeKey)) !== "off";
}

export async function writeShakeEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.deleteItemAsync(shakeKey);
  else await SecureStore.setItemAsync(shakeKey, "off");
}

export async function readGuideSeen(): Promise<boolean> {
  return (await SecureStore.getItemAsync(guideKey)) === "seen";
}

export async function writeGuideSeen(): Promise<void> {
  await SecureStore.setItemAsync(guideKey, "seen");
}
