import { afterEach, describe, expect, it, vi } from "vitest";
const { native, platform } = vi.hoisted(() => {
  const native: { current: Record<string, unknown> | null } = { current: null };
  return { native, platform: { OS: "android" } };
});
vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.current }));
vi.mock("react-native", () => ({ Platform: platform }));
afterEach(() => { native.current = null; platform.OS = "android"; vi.resetModules(); });
describe("notification intake native boundary", () => {
  it("reports missing custom binary and rejects mutations without a fallback", async () => {
    const { notificationIntake } = await import("./index");
    expect(await notificationIntake.getStatus()).toEqual({ supported: false, reason: "native_module_missing" });
    await expect(notificationIntake.listPending({ expectedEpoch: "a".repeat(22), limit: 1 })).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
  it("reports unsupported platforms", async () => {
    platform.OS = "web";
    const { notificationIntake } = await import("./index");
    expect(await notificationIntake.getStatus()).toEqual({ supported: false, reason: "platform" });
  });
  it("validates outgoing input before invoking the native method", async () => {
    const listPending = vi.fn(); native.current = { apiVersion: 2, listPending };
    const { notificationIntake } = await import("./index");
    await expect(notificationIntake.listPending({ expectedEpoch: "a".repeat(22), limit: 51 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(listPending).not.toHaveBeenCalled();
  });
  it("omits an undefined first-page cursor at the native boundary and preserves pagination", async () => {
    const expectedEpoch = "a".repeat(22);
    const listPending = vi.fn().mockResolvedValue({ epoch: expectedEpoch, captures: [], nextCursor: null });
    native.current = { apiVersion: 3, listPending };
    const { notificationIntake } = await import("./index");

    await expect(notificationIntake.listPending({ expectedEpoch, cursor: undefined, limit: 50 }))
      .resolves.toEqual({ epoch: expectedEpoch, captures: [], nextCursor: null });
    expect(listPending.mock.calls[0]).toStrictEqual([{ expectedEpoch, limit: 50 }]);

    await notificationIntake.listPending({ expectedEpoch, cursor: "next-page", limit: 50 });
    expect(listPending.mock.calls[1]).toStrictEqual([{ expectedEpoch, cursor: "next-page", limit: 50 }]);
  });
  it("rejects a native capture with renewed expiry or unsafe money", async () => {
    const { nativeCaptureSchema } = await import("./index");
    const capture = { captureId: "id", sourceSelectionId: "source", capturedAt: 1, expiresAt: 1_296_000_001, notificationAt: 1,
      direction: "out", amountMinorUnits: 12345, currency: "COP", description: "", parserVersion: "generic-v1", consentVersion: "v1" };
    expect(nativeCaptureSchema.parse(capture)).toEqual({ ...capture, text: "" });
    expect(nativeCaptureSchema.safeParse({ ...capture, description: "é".repeat(128) }).success).toBe(true);
    expect(nativeCaptureSchema.safeParse({ ...capture, description: "é".repeat(129) }).success).toBe(false);
    expect(nativeCaptureSchema.safeParse({ ...capture, description: "😀".repeat(64) }).success).toBe(true);
    expect(nativeCaptureSchema.safeParse({ ...capture, description: "😀".repeat(65) }).success).toBe(false);
    expect(nativeCaptureSchema.safeParse({ ...capture, expiresAt: 2 }).success).toBe(false);
    expect(nativeCaptureSchema.safeParse({ ...capture, amountMinorUnits: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(nativeCaptureSchema.safeParse({ ...capture, workspaceId: "identity" }).success).toBe(false);
  });
});

it("blocks an old APK before reading or mutating it and reports the required upgrade", async () => {
  const configure = vi.fn(); const getStatus = vi.fn();
  native.current = { configure, getStatus };
  const { notificationIntake } = await import("./index");
  expect(await notificationIntake.getStatus()).toEqual({ supported: false, reason: "native_api_incompatible" });
  await expect(notificationIntake.configure({ expectedEpoch: "a".repeat(22), mutationId: "00000000-0000-4000-8000-000000000001", consentVersion: "v1", sources: [] })).rejects.toMatchObject({ code: "UNSUPPORTED" });
  expect(configure).not.toHaveBeenCalled(); expect(getStatus).not.toHaveBeenCalled();
});

it("validates partial native captures while rejecting zero and unsupported currencies", async () => {
  const { nativeCaptureSchema } = await import("./index");
  const partial = { captureId: "id", sourceSelectionId: "source", capturedAt: 1, expiresAt: 1_296_000_001, notificationAt: 1,
    direction: null, amountMinorUnits: null, currency: null, description: "", parserVersion: "generic-v2", consentVersion: "v1" };
  expect(nativeCaptureSchema.parse(partial)).toEqual({ ...partial, text: "" });
  expect(nativeCaptureSchema.safeParse({ ...partial, amountMinorUnits: 0 }).success).toBe(false);
  expect(nativeCaptureSchema.safeParse({ ...partial, currency: "MXN" }).success).toBe(false);
});

it("production native capability blocks raw diagnostics even when JavaScript asks for them", async () => {
  const listDiagnostics = vi.fn(); native.current = { apiVersion: 2, diagnosticsEnabled: false, listDiagnostics };
  const { notificationIntake } = await import("./index");
  await expect(notificationIntake.listDiagnostics({ expectedEpoch: "a".repeat(22), ownerScope: "o".repeat(43) })).rejects.toMatchObject({ code: "UNSUPPORTED" });
  expect(listDiagnostics).not.toHaveBeenCalled();
});
