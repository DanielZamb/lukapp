import { beforeEach, expect, test, vi } from "vitest";
const os = vi.hoisted(() => ({
  platform: { OS: "android" },
  files: new Map<string, string>(),
  authenticate: vi.fn(),
  getSentinel: vi.fn(),
  setSentinel: vi.fn(),
  removeSentinel: vi.fn(),
  hardware: vi.fn(),
  enrolled: vi.fn(),
  level: vi.fn(),
  usable: vi.fn(),
  prevent: vi.fn(),
  allow: vi.fn(),
  switcher: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: os.platform }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "497af871-e049-4102-b496-4cd529cf60b6",
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    constructor(
      _path: string,
      private name: string,
    ) {}
    get exists() {
      return os.files.has(this.name);
    }
    textSync() {
      return os.files.get(this.name);
    }
    create() {
      os.files.set(this.name, "");
    }
    write(value: string) {
      os.files.set(this.name, value);
    }
  },
}));
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: os.hardware,
  isEnrolledAsync: os.enrolled,
  getEnrolledLevelAsync: os.level,
  authenticateAsync: os.authenticate,
  cancelAuthenticate: vi.fn(),
  SecurityLevel: { BIOMETRIC_STRONG: 3 },
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  canUseBiometricAuthentication: os.usable,
  getItemAsync: os.getSentinel,
  setItemAsync: os.setSentinel,
  deleteItemAsync: os.removeSentinel,
}));
vi.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: os.prevent,
  allowScreenCaptureAsync: os.allow,
  enableAppSwitcherProtectionAsync: os.switcher,
}));
import {
  enrollBiometry,
  clearBiometricEnrollment,
  hideFinancialScreen,
  initializeScreenPrivacy,
  readInstallMarker,
  revealFinancialScreen,
  unlockBiometry,
  writeInstallMarker,
} from "./nativeEntry";
import type { InstallMarker } from "./installMarker";
const marker: InstallMarker = {
  version: 1,
  installId: "497af871-e049-4102-b496-4cd529cf60b6",
  kind: "enrolled",
  subject: "owner",
  sessionId: "session",
};
beforeEach(() => {
  vi.resetAllMocks();
  os.files.clear();
  os.platform.OS = "android";
  os.hardware.mockResolvedValue(true);
  os.enrolled.mockResolvedValue(true);
  os.level.mockResolvedValue(3);
  os.usable.mockReturnValue(true);
  os.authenticate.mockResolvedValue({ success: true });
  os.getSentinel.mockResolvedValue(`${marker.installId}:owner`);
});

test("the OS challenge explicitly requires Class 3, no device PIN and no fallback button", async () => {
  await unlockBiometry(marker, "owner");
  expect(os.authenticate).toHaveBeenCalledExactlyOnceWith({
    promptMessage: "Unlock Lukapp",
    biometricsSecurityLevel: "strong",
    disableDeviceFallback: true,
    fallbackLabel: "",
    cancelLabel: "Sign in instead",
    requireConfirmation: true,
  });
  expect(os.getSentinel).toHaveBeenCalledWith(
    `enrollment.${marker.installId}`,
    {
      keychainService: "lukapp.local-entry.v1",
      keychainAccessible: 6,
      requireAuthentication: true,
      authenticationPrompt: "Unlock Lukapp",
    },
  );
});
test.each(["weak", "no-hardware", "not-enrolled", "unusable"])(
  "%s cannot enable local entry",
  async (failure) => {
    if (failure === "weak") os.level.mockResolvedValue(2);
    if (failure === "no-hardware") os.hardware.mockResolvedValue(false);
    if (failure === "not-enrolled") os.enrolled.mockResolvedValue(false);
    if (failure === "unusable") os.usable.mockReturnValue(false);
    await expect(enrollBiometry(marker, "owner")).rejects.toThrow();
    expect(os.authenticate).not.toHaveBeenCalled();
    expect(os.setSentinel).not.toHaveBeenCalled();
  },
);
test("a missing, invalidated or inaccessible sentinel cannot be replaced during ordinary unlock", async () => {
  os.getSentinel
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("Invalidated"));
  await expect(unlockBiometry(marker, "owner")).rejects.toThrow();
  await expect(unlockBiometry(marker, "owner")).rejects.toThrow();
  expect(os.setSentinel).not.toHaveBeenCalled();
});
test("only enrollment provisions the authentication-bound device-only sentinel after strong authentication", async () => {
  await enrollBiometry(marker, "owner");
  expect(os.removeSentinel).toHaveBeenCalledOnce();
  expect(os.setSentinel).toHaveBeenCalledWith(
    `enrollment.${marker.installId}`,
    `${marker.installId}:owner`,
    {
      keychainService: "lukapp.local-entry.v1",
      keychainAccessible: 6,
      requireAuthentication: true,
      authenticationPrompt: "Unlock Lukapp",
    },
  );
});
test("cancelled biometrics never read or provision the sentinel", async () => {
  os.authenticate.mockResolvedValue({ success: false, error: "user_cancel" });
  await expect(unlockBiometry(marker, "owner")).rejects.toThrow();
  expect(os.getSentinel).not.toHaveBeenCalled();
  expect(os.setSentinel).not.toHaveBeenCalled();
});
test("a missing install marker is untrusted; only an explicitly saved enrollment survives a normal restart", async () => {
  expect(await readInstallMarker()).toEqual({
    version: 1,
    installId: marker.installId,
    kind: "sign-in-required",
  });
  await writeInstallMarker(marker);
  expect(await readInstallMarker()).toEqual(marker);
  os.files.clear();
  expect((await readInstallMarker()).kind).toBe("sign-in-required");
});
test("Android prevents capture while hidden and permits deliberate screenshots after unlock", async () => {
  await initializeScreenPrivacy();
  await revealFinancialScreen();
  await hideFinancialScreen();
  expect(os.prevent.mock.calls).toEqual([
    ["lukapp-local-entry"],
    ["lukapp-local-entry"],
  ]);
  expect(os.allow).toHaveBeenCalledExactlyOnceWith("lukapp-local-entry");
});
test("iOS uses native app-switcher protection without forbidding unlocked screenshots", async () => {
  os.platform.OS = "ios";
  await initializeScreenPrivacy();
  await revealFinancialScreen();
  expect(os.switcher).toHaveBeenCalledExactlyOnceWith(1);
  expect(os.prevent).not.toHaveBeenCalled();
  expect(os.allow).not.toHaveBeenCalled();
});

test("revocation deletes only the app enrollment sentinel through its own service", async () => {
  await clearBiometricEnrollment(marker);
  expect(os.removeSentinel).toHaveBeenCalledExactlyOnceWith(`enrollment.${marker.installId}`, {
    keychainService: "lukapp.local-entry.v1",
    keychainAccessible: 6,
    requireAuthentication: true,
    authenticationPrompt: "Unlock Lukapp",
  });
  expect(os.authenticate).not.toHaveBeenCalled();
});
