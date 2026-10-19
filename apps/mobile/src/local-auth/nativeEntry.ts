import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as ScreenCapture from "expo-screen-capture";
import { parseInstallMarker, type InstallMarker } from "./installMarker";

// Cache is not backed up. OS eviction conservatively requires sign-in again.
const markerFile = () => new File(Paths.cache, "lukapp-entry-install-v1.json");
export async function writeInstallMarker(marker: InstallMarker) {
  const file = markerFile();
  file.create({ overwrite: true });
  file.write(JSON.stringify(marker));
}
export async function readInstallMarker(): Promise<InstallMarker> {
  const file = markerFile();
  const existing = parseInstallMarker(file.exists ? file.textSync() : null);
  if (existing) return existing;
  const marker: InstallMarker = {
    version: 1,
    installId: Crypto.randomUUID(),
    kind: "sign-in-required",
  };
  await writeInstallMarker(marker);
  return marker;
}
const sentinelOptions: SecureStore.SecureStoreOptions = {
  keychainService: "lukapp.local-entry.v1",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: "Unlock Lukapp",
  cancellableAuthentication: true,
};
const sentinelKey = (marker: InstallMarker) => `enrollment.${marker.installId}`;
const sentinelValue = (marker: InstallMarker, subject: string) =>
  `${marker.installId}:${subject}`;
let biometricGeneration = 0;
async function checkStrongBiometry() {
  const [hardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  if (
    !hardware ||
    !enrolled ||
    !SecureStore.canUseBiometricAuthentication() ||
    !SecureStore.isCancellableAuthenticationAvailable() ||
    (Platform.OS === "android" &&
      level !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG)
  )
    throw new Error("Strong biometry required");
}
export async function enrollBiometry(marker: InstallMarker, subject: string) {
  const generation = biometricGeneration;
  await checkStrongBiometry();
  if (generation !== biometricGeneration) throw new Error("Biometrics cancelled");
  await SecureStore.deleteItemAsync(sentinelKey(marker), sentinelOptions);
  if (generation !== biometricGeneration) throw new Error("Biometrics cancelled");
  await SecureStore.setItemAsync(
    sentinelKey(marker),
    sentinelValue(marker, subject),
    sentinelOptions,
  );
}
export async function unlockBiometry(marker: InstallMarker, subject: string) {
  const generation = biometricGeneration;
  if (marker.kind !== "enrolled" || marker.subject !== subject)
    throw new Error("Sign in required");
  await checkStrongBiometry();
  if (generation !== biometricGeneration) throw new Error("Biometrics cancelled");
  const sentinel = await SecureStore.getItemAsync(
    sentinelKey(marker),
    sentinelOptions,
  );
  if (sentinel !== sentinelValue(marker, subject))
    throw new Error("Biometric enrollment changed");
}
export async function clearBiometricEnrollment(marker: InstallMarker) {
  await SecureStore.deleteItemAsync(sentinelKey(marker), sentinelOptions);
}
export async function cancelBiometricPrompt() {
  biometricGeneration++;
  await SecureStore.cancelAuthentication();
}
const privacyKey = "lukapp-local-entry";
export async function hideFinancialScreen() {
  if (Platform.OS === "android")
    await ScreenCapture.preventScreenCaptureAsync(privacyKey);
}
export async function revealFinancialScreen() {
  if (Platform.OS === "android")
    await ScreenCapture.allowScreenCaptureAsync(privacyKey);
}
export async function initializeScreenPrivacy() {
  if (Platform.OS === "ios")
    await ScreenCapture.enableAppSwitcherProtectionAsync(1);
  else if (Platform.OS === "android") await hideFinancialScreen();
  else throw new Error("Native mobile entry required");
}
