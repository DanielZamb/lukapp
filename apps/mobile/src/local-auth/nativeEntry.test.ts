import { beforeEach, expect, test, vi } from "vitest";
const os = vi.hoisted(() => ({
  platform: { OS: "android" },
  files: new Map<string, string>(),
  authenticate: vi.fn(),
  cancelStore: vi.fn(),
  cancelLocal: vi.fn(),
  getSentinel: vi.fn(),
  setSentinel: vi.fn(),
  removeSentinel: vi.fn(),
  hardware: vi.fn(),
  enrolled: vi.fn(),
  level: vi.fn(),
  usable: vi.fn(),
  cancellable: vi.fn(),
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
  cancelAuthenticate: os.cancelLocal,
  SecurityLevel: { BIOMETRIC_STRONG: 3 },
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  cancelAuthentication: os.cancelStore,
  canUseBiometricAuthentication: os.usable,
  isCancellableAuthenticationAvailable: os.cancellable,
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
  cancelBiometricPrompt,
  clearBiometricEnrollment,
  hideFinancialScreen,
  initializeScreenPrivacy,
  readInstallMarker,
  revealFinancialScreen,
  unlockBiometry,
  writeInstallMarker,
} from "./nativeEntry";
import type { InstallMarker } from "./installMarker";
import { EntryController } from "./entryController";
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
  os.cancellable.mockReturnValue(true);
  os.authenticate.mockResolvedValue({ success: true });
  os.getSentinel.mockResolvedValue(`${marker.installId}:owner`);
});

test.each(["android", "ios"])("%s unlock prompts only through one SecureStore read and never calls authenticateAsync", async platform => {
  os.platform.OS = platform;
  await unlockBiometry(marker, "owner");
  expect(os.authenticate).not.toHaveBeenCalled();
  expect(os.getSentinel).toHaveBeenCalledExactlyOnceWith(
    `enrollment.${marker.installId}`,
    {
      keychainService: "lukapp.local-entry.v1",
      keychainAccessible: 6,
      requireAuthentication: true,
      authenticationPrompt: "Unlock Lukapp",
      cancellableAuthentication: true,
    },
  );
  expect(os.setSentinel).not.toHaveBeenCalled();
});
test.each(["weak", "no-hardware", "not-enrolled", "unusable", "old-native-client"])(
  "%s cannot enable local entry",
  async (failure) => {
    if (failure === "weak") os.level.mockResolvedValue(2);
    if (failure === "no-hardware") os.hardware.mockResolvedValue(false);
    if (failure === "not-enrolled") os.enrolled.mockResolvedValue(false);
    if (failure === "unusable") os.usable.mockReturnValue(false);
    if (failure === "old-native-client") os.cancellable.mockReturnValue(false);
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
test.each(["android", "ios"])("%s enrollment prompts only through one SecureStore write and never calls authenticateAsync", async platform => {
  os.platform.OS = platform;
  await enrollBiometry(marker, "owner");
  expect(os.removeSentinel).toHaveBeenCalledOnce();
  expect(os.authenticate).not.toHaveBeenCalled();
  expect(os.getSentinel).not.toHaveBeenCalled();
  expect(os.setSentinel).toHaveBeenCalledExactlyOnceWith(
    `enrollment.${marker.installId}`,
    `${marker.installId}:owner`,
    {
      keychainService: "lukapp.local-entry.v1",
      keychainAccessible: 6,
      requireAuthentication: true,
      authenticationPrompt: "Unlock Lukapp",
      cancellableAuthentication: true,
    },
  );
});
test.each(["unlock", "enroll"])("a cancelled SecureStore %s fails without a second prompt", async operation => {
  const error = new Error("user_cancel");
  if (operation === "unlock") os.getSentinel.mockRejectedValueOnce(error);
  else os.setSentinel.mockRejectedValueOnce(error);
  await expect(operation === "unlock" ? unlockBiometry(marker, "owner") : enrollBiometry(marker, "owner")).rejects.toThrow("user_cancel");
  expect(os.authenticate).not.toHaveBeenCalled();
  expect(os.getSentinel).toHaveBeenCalledTimes(operation === "unlock" ? 1 : 0);
  expect(os.setSentinel).toHaveBeenCalledTimes(operation === "enroll" ? 1 : 0);
});

test.each(["android", "ios"])("%s cancellation targets SecureStore instead of LocalAuthentication", async platform => {
  os.platform.OS = platform;
  await cancelBiometricPrompt();
  expect(os.cancelStore).toHaveBeenCalledOnce();
  expect(os.cancelLocal).not.toHaveBeenCalled();
});

test.each(["unlock", "enroll"])("cancelling during the silent %s checks prevents a later SecureStore prompt", async operation => {
  let finish = (_hardware: boolean) => {};
  os.hardware.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const attempt = operation === "unlock" ? unlockBiometry(marker, "owner") : enrollBiometry(marker, "owner");
  const rejected = expect(attempt).rejects.toThrow("Biometrics cancelled");
  await cancelBiometricPrompt();
  finish(true);
  await rejected;
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
    cancellableAuthentication: true,
  });
  expect(os.authenticate).not.toHaveBeenCalled();
});

test(
  "identity loss during the SecureStore enrollment prompt drains its write before deleting the sentinel",
  async () => {
    let sentinel: string | null = null;
    let release = () => {};
    let started = () => {};
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { started = resolve; });
    os.setSentinel.mockImplementation(async (_key: string, value: string) => {
      started();
      await blocked;
      sentinel = value;
    });
    os.removeSentinel.mockImplementation(async () => { sentinel = null; });
    await writeInstallMarker({ version: 1, installId: marker.installId, kind: "sign-in-required" });
    const signOut = vi.fn(async () => {});
    const gate = new EntryController({
      now: () => 0, readMarker: readInstallMarker, writeMarker: writeInstallMarker,
      unlock: unlockBiometry, enroll: enrollBiometry, clearEnrollment: clearBiometricEnrollment,
      signOut, initializePrivacy: initializeScreenPrivacy,
      hide: hideFinancialScreen, reveal: revealFinancialScreen,
      cancelPrompt: async () => {}, clearInput: async () => {},
    });
    await gate.setIdentity(null);
    gate.approveSignIn(marker.sessionId);
    await gate.setIdentity({ subject: marker.subject, sessionId: marker.sessionId });
    const enrollment = gate.unlock();
    await reached;
    const cleanup = gate.setIdentity(null);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(gate.getSnapshot()).toEqual({ state: { kind: "revocation", cleanup: "running" }, obscured: true });
    expect((await readInstallMarker()).kind).toBe("wipe-required");
    expect(signOut).not.toHaveBeenCalled();
    release();
    await Promise.all([enrollment, cleanup]);
    expect({ sentinel, marker: (await readInstallMarker()).kind, state: gate.getSnapshot().state.kind }).toEqual({
      sentinel: null, marker: "sign-in-required", state: "sign-in",
    });
    expect(os.setSentinel).toHaveBeenCalledExactlyOnceWith(
      `enrollment.${marker.installId}`, `${marker.installId}:owner`,
      expect.objectContaining({ requireAuthentication: true, keychainAccessible: 6 }),
    );
    expect(signOut).toHaveBeenCalledOnce();
    gate.dispose();
  },
);
