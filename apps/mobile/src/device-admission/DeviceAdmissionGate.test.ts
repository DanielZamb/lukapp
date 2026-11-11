import * as React from "react";
import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../features/api";
import { DeviceAdmissionGate } from "./DeviceAdmissionGate";
import { LanguageProvider } from "../i18n";

type Status = Pick<FunctionReturnType<typeof api.deviceAccess.status>, "status" | "wipeLocalInput"> & {
  existingLabel?: string;
  occupier?: { deviceId: string; sessionId: string; label: string; lastSeenAt: number };
  movedTo?: string;
};
type QueryState =
  | { status: "pending" }
  | { status: "success"; data: Status }
  | { status: "error"; error: Error };
const sdk = vi.hoisted(() => ({
  status: ((): QueryState => ({ status: "pending" }))(),
  register: vi.fn(async (_args: unknown) => "device-id"),
  signOut: vi.fn(async () => {}),
  replace: vi.fn(async (_args: unknown) => "replacement-id"),
  recordActivity: vi.fn(async (_args: unknown) => null),
  ensure: vi.fn(async () => true),
  ready: true,
  interaction: vi.fn(),
  report: vi.fn((_error: unknown) => false),
  queryNames: new Array<string>(),
  queryArgs: new Array<unknown>(),
  actionNames: new Array<string>(),
}));
vi.mock("convex/react", () => ({
  useQuery_experimental: ({ query, args }: { query: typeof api.deviceAccess.status; args: unknown }) => {
    sdk.queryNames.push(getFunctionName(query));
    sdk.queryArgs.push(args);
    return sdk.status;
  },
  useAction: (action: typeof api.deviceAccess.register) => {
    sdk.actionNames.push(getFunctionName(action));
    const name = getFunctionName(action);
    return name === "deviceAccess:recordActivity" ? sdk.recordActivity : name === "deviceAccess:replace" ? sdk.replace : sdk.register;
  },
}));
vi.mock("../local-auth/enrollment", () => ({ useLocalEnrollment: () => ({ ready: sdk.ready, ensure: sdk.ensure }) }));
vi.mock("@clerk/expo", () => ({ useClerk: () => ({ signOut: sdk.signOut }) }));
vi.mock("expo-constants", () => ({ default: { nativeAppVersion: "0.1.0" } }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  ActivityIndicator: "spinner", Text: "text", TextInput: "input", View: "view",
}));
vi.mock("../ui/core", () => ({
  Header: "header", Screen: "screen", PrimaryButton: "button", SecondaryButton: "button",
  useUi: () => ({ body: {}, error: {}, muted: {}, label: {}, screen: {}, input: {} }),
  useTheme: () => ({ background: "#fff", foreground: "#000", mutedForeground: "#666", border: "#eee", primary: "#000" }),
}));
vi.mock("../local-auth/installation", () => ({ useLocalInstallId: () => "existing-install-marker" }));
vi.mock("../local-auth/interaction", async importOriginal => ({
  ...await importOriginal<typeof import("../local-auth/interaction")>(),
  useLocalEntryInteraction: () => sdk.interaction,
}));
vi.mock("../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => sdk.report }));

let root: ReactTestRenderer | undefined;
let mounts = 0;
let unmounts = 0;
function FinancialScreen() {
  useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
  return createElement("financial-screen");
}
function tree() {
  return createElement(DeviceAdmissionGate, { children: createElement(FinancialScreen) });
}
async function open(status: typeof sdk.status = { status: "pending" }) {
  sdk.status = status;
  await act(async () => { root = create(tree()); });
}
async function update(data: Status) {
  sdk.status = { status: "success", data };
  await act(async () => root?.update(tree()));
}
function button(label: string) {
  if (!root) throw new Error("Not mounted");
  return root.root.findByProps({ label });
}
async function nameDevice() {
  if (!root) throw new Error("Not mounted");
  await act(async () => root?.root.findByType("input").props.onChangeText("  My phone  "));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  sdk.register.mockResolvedValue("device-id");
  sdk.replace.mockResolvedValue("replacement-id");
  sdk.ready = true;
  sdk.ensure.mockResolvedValue(true);
  sdk.signOut.mockResolvedValue(undefined);
  sdk.report.mockReturnValue(false);
  sdk.queryNames.length = 0;
  sdk.queryArgs.length = 0;
  sdk.actionNames.length = 0;
  mounts = unmounts = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("financial screens mount only on reactive registration and unmount immediately on revocation", async () => {
  await open();
  expect(mounts).toBe(0);
  await update({ status: "unregistered", wipeLocalInput: false });
  expect(mounts).toBe(0);
  await update({ status: "registered", wipeLocalInput: false });
  expect(mounts).toBe(1);
  await update({ status: "revoked", wipeLocalInput: true });
  expect(unmounts).toBe(1);
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(JSON.stringify(root?.toJSON())).toContain("access was revoked");
  expect(sdk.report).toHaveBeenCalledWith(new ConvexError({ code: "device_revoked", wipeLocalInput: true }));
  expect(sdk.register).not.toHaveBeenCalled();
  expect(new Set(sdk.queryNames)).toEqual(new Set(["deviceAccess:status"]));
  expect(new Set(sdk.actionNames)).toEqual(new Set(["deviceAccess:register", "deviceAccess:replace", "deviceAccess:recordActivity"]));
});

test("registration sends only allowed metadata and waits for the query acknowledgement", async () => {
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  expect(button("Register device").props.disabled).toBe(true);
  await nameDevice();
  expect(sdk.interaction).toHaveBeenCalledOnce();
  await act(async () => button("Register device").props.onPress());
  expect(sdk.register).toHaveBeenCalledExactlyOnceWith({
    installId: "existing-install-marker", label: "My phone", platform: "android", appVersion: "0.1.0",
  });
  expect(mounts).toBe(0);
  expect(JSON.stringify(root?.toJSON())).toContain("Confirming device access");
  await update({ status: "registered", wipeLocalInput: false });
  expect(mounts).toBe(1);
});

test("occupied slots deny access without invoking any revocation and allow an explicit retry", async () => {
  sdk.register.mockRejectedValueOnce(new ConvexError({
    code: "device_slot_occupied", occupiedLabel: "U01 Android",
  }));
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  await nameDevice();
  await act(async () => button("Register device").props.onPress());
  expect(mounts).toBe(0);
  expect(JSON.stringify(root?.toJSON())).toContain("U01 Android");
  expect(JSON.stringify(root?.toJSON())).toContain("Check the active device");
  expect(sdk.report).toHaveBeenCalledExactlyOnceWith(new ConvexError({
    code: "device_slot_occupied", occupiedLabel: "U01 Android",
  }));
  expect(root?.root.findByType("input").props.value).toBe("  My phone  ");
  await act(async () => button("Register device").props.onPress());
  expect(sdk.register).toHaveBeenCalledTimes(2);
  expect(sdk.register.mock.calls[1]).toEqual(sdk.register.mock.calls[0]);
  expect(mounts).toBe(0);
});

test("a known install reclaims without showing the naming form", async () => {
  await open({
    status: "success",
    data: { status: "unregistered", wipeLocalInput: false, existingLabel: "U01 Android" },
  });
  expect(sdk.queryArgs[0]).toEqual({ installId: "existing-install-marker", platform: "android" });
  expect(JSON.stringify(root?.toJSON())).not.toContain("Name this device");
  expect(JSON.stringify(root?.toJSON())).toContain("Confirming device access");
  expect(sdk.register).toHaveBeenCalledExactlyOnceWith({
    installId: "existing-install-marker", label: "U01 Android", platform: "android", appVersion: "0.1.0",
  });
  expect(mounts).toBe(0);
  await update({ status: "registered", wipeLocalInput: false });
  expect(mounts).toBe(1);
});

test("provider failures preserve name, hide server messages and support retry", async () => {
  sdk.register.mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable", secret: "PRIVATE" }));
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  await nameDevice();
  await act(async () => button("Register device").props.onPress());
  expect(JSON.stringify(root?.toJSON())).toContain("Check your connection");
  expect(JSON.stringify(root?.toJSON())).not.toContain("PRIVATE");
  await act(async () => button("Register device").props.onPress());
  expect(sdk.register).toHaveBeenCalledTimes(2);
});

test("double taps submit once and late completion after local lock cannot mount children", async () => {
  let complete: ((value: string) => void) | undefined;
  sdk.register.mockImplementationOnce(() => new Promise<string>((resolve) => { complete = resolve; }));
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  await nameDevice();
  const submit = button("Register device").props.onPress;
  await act(async () => { submit(); submit(); });
  expect(sdk.register).toHaveBeenCalledOnce();
  await act(async () => root?.unmount());
  root = undefined;
  await act(async () => complete?.("device-id"));
  expect(mounts).toBe(0);
});

test("query errors and membership loss close the financial tree; sign-out uses the official SDK", async () => {
  await open({ status: "success", data: { status: "registered", wipeLocalInput: false } });
  sdk.status = { status: "error", error: new ConvexError({ code: "membership_required", wipeLocalInput: true }) };
  await act(async () => root?.update(tree()));
  expect(unmounts).toBe(1);
  expect(JSON.stringify(root?.toJSON())).toContain("no longer has access");
  await act(async () => button("Sign out").props.onPress());
  expect(sdk.signOut).toHaveBeenCalledOnce();
});

test("unknown query errors remain closed and retry the status subscription", async () => {
  await open({ status: "error", error: new Error("PRIVATE") });
  expect(mounts).toBe(0);
  expect(JSON.stringify(root?.toJSON())).not.toContain("PRIVATE");
  sdk.status = { status: "success", data: { status: "unregistered", wipeLocalInput: false } };
  await act(async () => button("Try again").props.onPress());
  expect(button("Register device").props.disabled).toBe(true);
  expect(mounts).toBe(0);
});

test("confirmed protected-call wipe errors are forwarded to the shared cleanup owner", async () => {
  const error = new ConvexError({ code: "session_inactive", wipeLocalInput: true });
  sdk.register.mockRejectedValueOnce(error);
  sdk.report.mockReturnValue(true);
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  await nameDevice();
  await act(async () => button("Register device").props.onPress());
  expect(sdk.report).toHaveBeenCalledExactlyOnceWith(error);
  expect(mounts).toBe(0);
});

test("a protected read throwing inside the financial tree reaches the cleanup hook inside its provider", async () => {
  const error = new ConvexError({ code: "membership_required", wipeLocalInput: true });
  function FailedRead(): never { throw error; }
  sdk.status = { status: "success", data: { status: "registered", wipeLocalInput: false } };
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(async () => { root = create(createElement(DeviceAdmissionGate, { children: createElement(FailedRead) })); });
    expect(sdk.report).toHaveBeenCalledWith(error);
    expect(JSON.stringify(root?.toJSON())).toContain("Access could not be confirmed");
    expect(mounts).toBe(0);
  } finally { consoleError.mockRestore(); }
});

const occupied = {
  status: "unregistered", wipeLocalInput: false,
  occupier: { deviceId: "old-device", sessionId: "old-session", label: "Old Android", lastSeenAt: 1_792_238_400_000 },
} satisfies Status;

test("the occupied screen names the phone and Keep signs out without enrollment or registration", async () => {
  sdk.ready = false;
  await open({ status: "success", data: occupied });
  expect(JSON.stringify(root?.toJSON())).toContain("one Android phone and one iPhone");
  expect(JSON.stringify(root?.toJSON())).toContain("Last seen");
  expect(root?.root.findByType("header").props.title).toBe("You already use Lukapp on another Android phone");
  expect(sdk.ensure).not.toHaveBeenCalled();
  await act(async () => button("Keep using Old Android").props.onPress());
  expect(sdk.signOut).toHaveBeenCalledOnce();
  expect(sdk.ensure).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(mounts).toBe(0);
});

test("Use waits for enrollment and sends the displayed occupier to one replacement, then waits for acknowledgement", async () => {
  sdk.ready = false;
  let finish: ((value: boolean) => void) | undefined;
  sdk.ensure.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
  await open({ status: "success", data: occupied });
  const submit = button("Use this phone instead").props.onPress;
  await act(async () => { submit(); submit(); });
  expect(sdk.ensure).toHaveBeenCalledOnce();
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  expect(mounts).toBe(0);
  await act(async () => { sdk.ready = true; finish?.(true); });
  expect(sdk.replace).toHaveBeenCalledExactlyOnceWith({
    installId: "existing-install-marker", label: "My Android phone", platform: "android", appVersion: "0.1.0",
    expectedOccupierId: "old-device", expectedSessionId: "old-session",
  });
  expect(mounts).toBe(0);
  await update({ status: "registered", wipeLocalInput: false });
  expect(mounts).toBe(1);
  expect(sdk.ensure).toHaveBeenCalledOnce();
});

test("cancelled enrollment and late success after unmount cannot replace a device", async () => {
  sdk.ready = false;
  sdk.ensure.mockResolvedValueOnce(false);
  await open({ status: "success", data: occupied });
  await act(async () => button("Use this phone instead").props.onPress());
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(mounts).toBe(0);
  let finish: ((value: boolean) => void) | undefined;
  sdk.ensure.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
  await act(async () => button("Use this phone instead").props.onPress());
  await act(async () => root?.unmount());
  root = undefined;
  await act(async () => finish?.(true));
  expect(sdk.replace).not.toHaveBeenCalled();
});

test("a raced occupier is shown for an explicit retry and never admits early", async () => {
  sdk.replace.mockRejectedValueOnce(new ConvexError({ code: "device_occupier_changed" }));
  await open({ status: "success", data: occupied });
  await act(async () => button("Use this phone instead").props.onPress());
  expect(JSON.stringify(root?.toJSON())).toContain("The active phone changed");
  expect(mounts).toBe(0);
  await update({ ...occupied, occupier: { ...occupied.occupier, deviceId: "newer-device", sessionId: "newer-session", label: "Newer Android" } });
  expect(button("Keep using Newer Android")).toBeDefined();
  expect(sdk.replace).toHaveBeenCalledOnce();
  await act(async () => button("Use this phone instead").props.onPress());
  expect(sdk.replace.mock.calls[1]?.[0]).toMatchObject({ expectedOccupierId: "newer-device", expectedSessionId: "newer-session" });
  expect(mounts).toBe(0);
});

test("moved access forwards the replacement label to the local cleanup owner", async () => {
  await open({ status: "success", data: { status: "revoked", wipeLocalInput: true, movedTo: "New Android" } });
  expect(JSON.stringify(root?.toJSON())).toContain("Access moved to New Android");
  expect(sdk.report).toHaveBeenCalledWith(new ConvexError({ code: "device_revoked", wipeLocalInput: true, movedTo: "New Android" }));
  expect(mounts).toBe(0);
});

test("a same-install candidate attempts verified reclaim and offers replacement only after occupied refusal", async () => {
  let refuse = (_error: Error) => {};
  sdk.register.mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { refuse = reject; }));
  await open({ status: "success", data: { ...occupied, existingLabel: "Old Android" } });
  expect(sdk.register).toHaveBeenCalledExactlyOnceWith({
    installId: "existing-install-marker", label: "Old Android", platform: "android", appVersion: "0.1.0",
  });
  expect(root?.root.findAllByProps({ label: "Use this phone instead" })).toHaveLength(0);
  expect(JSON.stringify(root?.toJSON())).toContain("Confirming device access");
  await act(async () => refuse(new ConvexError({ code: "device_slot_occupied", occupiedLabel: "Old Android" })));
  expect(root?.root.findAllByProps({ label: "Use this phone instead" })).toHaveLength(1);
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(mounts).toBe(0);
});

async function openInSpanish(status: typeof sdk.status) {
  sdk.status = status;
  vi.stubGlobal("React", React);
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "es" }, tree()));
  });
}
function spoken() {
  return JSON.stringify(root?.toJSON());
}

test("naming this device reads in Spanish and registers the typed name unchanged", async () => {
  sdk.ready = false;
  await openInSpanish({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  const header = root?.root.findByType("header");
  expect(header?.props).toMatchObject({ title: "Ponle nombre a este celular", eyebrow: "TUS DISPOSITIVOS" });
  expect(spoken()).toContain("Elige un nombre para reconocer este celular.");
  expect(spoken()).toContain("NOMBRE DEL CELULAR");
  expect(root?.root.findByType("input").props).toMatchObject({ accessibilityLabel: "Nombre del celular", placeholder: "Mi celular" });
  expect(button("Registrar este celular")).toBeDefined();
  expect(button("Cerrar sesión")).toBeDefined();
  await act(async () => root?.root.findByType("input").props.onChangeText("Celular de Ana"));
  await act(async () => button("Registrar este celular").props.onPress());
  expect(sdk.register.mock.calls[0]?.[0]).toMatchObject({ label: "Celular de Ana" });
});

test("the occupied screen reads in Spanish, offers a Spanish default name and a Spanish date", async () => {
  sdk.ready = false;
  await openInSpanish({ status: "success", data: occupied });
  expect(root?.root.findByType("header").props.title).toBe("Ya usas Lukapp en otro celular Android");
  expect(spoken()).toContain("Tu cuenta puede usar un celular Android y un iPhone a la vez.");
  expect(spoken()).toMatch(/Última actividad: 17 de oct de 2026, \d{1,2}:00/);
  expect(root?.root.findByType("input").props.value).toBe("Mi celular Android");
  expect(button("Usar este celular")).toBeDefined();
  expect(button("Seguir usando Old Android")).toBeDefined();
});

test("closed access and revocation read in Spanish and stay distinguishable", async () => {
  await openInSpanish({ status: "success", data: { status: "revoked", wipeLocalInput: true } });
  expect(root?.root.findByType("header").props.title).toBe("Acceso no disponible en este celular");
  expect(spoken()).toContain("Este celular ya no tiene acceso.");
  expect(button("Cerrar sesión")).toBeDefined();
  expect(root?.root.findAllByProps({ label: "Reintentar" })).toHaveLength(0);
  await act(async () => root?.unmount());
  await openInSpanish({ status: "success", data: { status: "revoked", wipeLocalInput: true, movedTo: "iPhone de Ana" } });
  expect(spoken()).toContain("El acceso pasó a iPhone de Ana");
  await act(async () => root?.unmount());
  await openInSpanish({ status: "pending" });
  expect(spoken()).toContain("Confirmando el acceso de este celular…");
  expect(button("Revisar de nuevo")).toBeDefined();
});

test("a Register handler kept from before the last keystrokes registers the name the screen shows", async () => {
  await open({ status: "success", data: { status: "unregistered", wipeLocalInput: false } });
  await act(async () => root?.root.findByType("input").props.onChangeText("My ph"));
  const kept = button("Register device").props.onPress as () => void;
  await act(async () => root?.root.findByType("input").props.onChangeText("My phone"));
  await act(async () => kept());
  expect(sdk.register.mock.calls.map(([args]) => (args as { label: string }).label)).toEqual(["My phone"]);
});
