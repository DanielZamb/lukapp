import Constants from "expo-constants";
import { Platform } from "react-native";
import { useLocalInstallId } from "../local-auth/installation";

export type CurrentInstall = { installId: string; platform: "ios" | "android"; appVersion: string };

/** The identity admission registers; a later rename must send the same values or the server refuses it. */
export function useCurrentInstall(): CurrentInstall | null {
  const installId = useLocalInstallId();
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
  const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version;
  return platform && appVersion && appVersion.length <= 40 ? { installId, platform, appVersion } : null;
}
