import * as React from "react";
import { createElement } from "react";
import { ConvexError } from "convex/values";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DevicesRoute from "../../../app/devices";
import SettingsRoute from "../../../app/settings";
import type { api } from "../api";

type Device = FunctionReturnType<typeof api.deviceAccess.list>[number];
const env = vi.hoisted(() => ({
  push: vi.fn(), back: vi.fn(), report: vi.fn((_: unknown) => false),
  list: vi.fn(), register: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn(),
  backListeners: [] as (() => boolean)[],
}));
vi.mock("expo-router", () => ({ router: { push: env.push, back: env.back }, Redirect: "redirect" }));
vi.mock("convex/react", () => ({
  useQuery: () => [],
  useAction: (reference: FunctionReference<"action">) => ({
    "deviceAccess:list": env.list, "deviceAccess:register": env.register,
    "deviceAccess:revoke": env.revoke, "deviceAccess:revokeOtherSessions": env.revokeOthers,
  })[getFunctionName(reference)],
}));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { id: "workspace", kind: "Personal", functionalCurrency: "COP" } }) }));
vi.mock("@clerk/expo", () => ({ useClerk: () => ({ signOut: vi.fn() }), useUser: () => ({ user: { firstName: "Owner" } }) }));
vi.mock("../../ui/Brand", () => ({ BrandLogo: "logo" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("expo-constants", () => ({ default: { nativeAppVersion: "0.4.2" } }));
vi.mock("../../local-auth/installation", () => ({ useLocalInstallId: () => "install-0123456789abcdef" }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => env.report }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  BackHandler: { addEventListener: (_: string, listener: () => boolean) => {
    env.backListeners.push(listener);
    return { remove: () => { env.backListeners.splice(env.backListeners.indexOf(listener), 1); } };
  } },
}));

const pixel: Device = { deviceId: "pixel" as Device["deviceId"], label: "Work Pixel", platform: "android", current: true, revoked: false, clerkActive: true };
const iphone: Device = { deviceId: "iphone" as Device["deviceId"], label: "Old iPhone", platform: "ios", current: false, revoked: false, clerkActive: false };
const stolen: Device = { deviceId: "stolen" as Device["deviceId"], label: "Stolen phone", platform: "ios", current: false, revoked: true, clerkActive: false };
let devices: Device[];
let root: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const mock of [env.push, env.back, env.list, env.register, env.revoke, env.revokeOthers]) mock.mockReset();
  env.report.mockReset();
  env.report.mockImplementation(() => false);
  env.backListeners.length = 0;
  devices = [iphone, stolen, pixel];
  env.list.mockImplementation(async () => devices);
  env.register.mockImplementation(async () => "pixel");
  env.revoke.mockImplementation(async () => ({ status: "revoked", clerkRevocation: "queued" }));
  env.revokeOthers.mockImplementation(async () => ({ status: "revoked", clerkRevocation: "queued" }));
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function open(element = DevicesRoute) {
  await act(async () => { root = create(createElement(element)); });
  if (!root) throw new Error("not mounted");
  return root.root;
}
const texts = (screen: ReactTestInstance) => screen.findAllByType("text").map((node) => node.children.join(""));
const button = (screen: ReactTestInstance, label: string) => screen.findByProps({ accessibilityLabel: label });
const press = (screen: ReactTestInstance, label: string) => act(async () => button(screen, label).props.onPress());
const buttonsLabelled = (screen: ReactTestInstance, label: string) =>
  screen.findAll((node) => node.type === "button" && node.props.accessibilityLabel === label);
const alerts = (screen: ReactTestInstance) =>
  screen.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert").map((node) => node.children.join(""));

test("Settings opens Devices after Notification intake, and Devices returns to Settings without pushing it, twice", async () => {
  for (const round of [1, 2]) {
    const settings = await open(SettingsRoute);
    const rows = settings.findAllByType("button").map((node) => node.findAllByType("text")[0]?.children.join(""));
    expect(rows.slice(rows.indexOf("Notification intake"), rows.indexOf("Notification intake") + 2)).toEqual(["Notification intake", "Devices"]);
    await act(async () => settings.findAllByType("button").find((node) => node.findAllByType("text")[0]?.children.join("") === "Devices")?.props.onPress());
    await act(async () => root?.unmount());
    const screen = await open();
    expect(env.backListeners.at(-1)?.()).toBe(false);
    await press(screen, "Back");
    await act(async () => root?.unmount());
    expect(env.push.mock.calls).toEqual(Array.from({ length: round }, () => ["/devices"]));
    expect(env.back).toHaveBeenCalledTimes(round);
    expect(env.backListeners).toHaveLength(0);
  }
});

test("lists active devices with this device first and marked, offering rename only for it", async () => {
  const screen = await open();
  expect(env.list.mock.calls).toEqual([[{}]]);
  const shown = texts(screen);
  expect(shown.filter((text) => ["Work Pixel", "Old iPhone", "Stolen phone"].includes(text))).toEqual(["Work Pixel", "Old iPhone"]);
  expect(shown).toEqual(expect.arrayContaining(["Android phone · Signed in", "iPhone · Signed out"]));
  expect(shown.filter((text) => text === "This device")).toHaveLength(1);
  expect(shown.indexOf("This device")).toBeLessThan(shown.indexOf("Old iPhone"));
  expect(buttonsLabelled(screen, "Rename Work Pixel")).toHaveLength(1);
  expect(buttonsLabelled(screen, "Remove access for Work Pixel")).toHaveLength(0);
  expect(buttonsLabelled(screen, "Rename Old iPhone")).toHaveLength(0);
  expect(buttonsLabelled(screen, "Remove access for Old iPhone")).toHaveLength(1);
});

test("renaming this device re-registers the same install with the new label and shows it", async () => {
  const screen = await open();
  await press(screen, "Rename Work Pixel");
  const field = () => screen.findByProps({ accessibilityLabel: "Device name" });
  expect(field().props.value).toBe("Work Pixel");
  expect(button(screen, "Save name").props.accessibilityState.disabled).toBe(true);
  await act(async () => field().props.onChangeText("   "));
  expect(alerts(screen)).toEqual(["Enter a name."]);
  await press(screen, "Save name");
  expect(env.register).not.toHaveBeenCalled();
  await act(async () => field().props.onChangeText("  Daily phone "));
  devices = [{ ...pixel, label: "Daily phone" }, iphone];
  await press(screen, "Save name");
  expect(env.register.mock.calls).toEqual([[{ installId: "install-0123456789abcdef", label: "Daily phone", platform: "android", appVersion: "0.4.2" }]]);
  expect(texts(screen)).toEqual(expect.arrayContaining(["Name saved.", "Daily phone"]));
  expect(texts(screen)).not.toContain("Work Pixel");
});

test("removing another device needs a confirmation that names it; Keep access and Android Back send nothing", async () => {
  const screen = await open();
  await press(screen, "Remove access for Old iPhone");
  expect(texts(screen)).toEqual(expect.arrayContaining(["Remove access for Old iPhone?",
    "Old iPhone will be signed out and can no longer open your money. Drafts and notifications saved only on that phone are deleted the next time it connects."]));
  await press(screen, "Keep access");
  expect(texts(screen)).toContain("Old iPhone");
  await press(screen, "Remove access for Old iPhone");
  await act(async () => { expect(env.backListeners.at(-1)?.()).toBe(true); });
  expect(texts(screen)).not.toContain("Remove access for Old iPhone?");
  expect(env.back).not.toHaveBeenCalled();
  expect(env.revoke).not.toHaveBeenCalled();
  await press(screen, "Remove access for Old iPhone");
  devices = [pixel, { ...iphone, revoked: true }];
  await act(async () => { button(screen, "Remove access").props.onPress(); button(screen, "Remove access").props.onPress(); });
  expect(env.revoke.mock.calls).toEqual([[{ deviceId: "iphone" }]]);
  expect(texts(screen)).toContain("Old iPhone no longer has access.");
  expect(texts(screen)).not.toContain("Old iPhone");
});

test("signing out all other sessions needs a confirmation; Cancel and header Back send nothing", async () => {
  const screen = await open();
  await press(screen, "Sign out all other sessions");
  expect(texts(screen)).toEqual(expect.arrayContaining(["Sign out all other sessions?",
    "Every other phone or session on your account is signed out. This device stays signed in."]));
  await press(screen, "Cancel");
  await press(screen, "Sign out all other sessions");
  await press(screen, "Back");
  expect(env.back).not.toHaveBeenCalled();
  expect(env.revokeOthers).not.toHaveBeenCalled();
  expect(texts(screen)).toContain("Sign out all other sessions");
  await press(screen, "Sign out all other sessions");
  await press(screen, "Sign out others");
  expect(env.revokeOthers.mock.calls).toEqual([[{}]]);
  expect(texts(screen)).toContain("Other sessions are being signed out.");
});

test("failures keep the screen usable: a failed list retries and a refused removal stays open for another try", async () => {
  env.list.mockRejectedValueOnce(new Error("offline"));
  const screen = await open();
  expect(alerts(screen)).toEqual(["Could not load your devices. Check your connection and try again."]);
  await press(screen, "Try again");
  expect(texts(screen)).toContain("Old iPhone");
  env.revoke.mockRejectedValueOnce(new ConvexError({ code: "session_owner_mismatch" }));
  await press(screen, "Remove access for Old iPhone");
  await press(screen, "Remove access");
  expect(alerts(screen)).toEqual(["Access was not removed. Try again."]);
  expect(button(screen, "Remove access").props.accessibilityState.disabled).toBe(false);
  await press(screen, "Remove access");
  expect(env.revoke.mock.calls).toEqual([[{ deviceId: "iphone" }], [{ deviceId: "iphone" }]]);
  expect(texts(screen)).toContain("Old iPhone no longer has access.");
});

test("when this device loses access mid-screen, the access-failure handler takes the error instead of the screen", async () => {
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  env.report.mockImplementation((error: unknown) => error === revoked);
  env.revokeOthers.mockRejectedValueOnce(revoked);
  const screen = await open();
  await press(screen, "Sign out all other sessions");
  await press(screen, "Sign out others");
  expect(env.report.mock.calls).toEqual([[revoked]]);
  expect(alerts(screen)).toEqual([]);
  env.list.mockRejectedValueOnce(revoked);
  await act(async () => root?.unmount());
  const reopened = await open();
  expect(env.report.mock.calls).toEqual([[revoked], [revoked]]);
  expect(alerts(reopened)).toEqual([]);
});

const nameField = (screen: ReactTestInstance) => screen.findByProps({ accessibilityLabel: "Device name" });
const lostReply = () => new Error("Response lost");

test("a lost rename reply keeps the sent name locked, and Send again repeats exactly that request", async () => {
  env.register.mockRejectedValueOnce(lostReply());
  const screen = await open();
  await press(screen, "Rename Work Pixel");
  await act(async () => nameField(screen).props.onChangeText("Daily phone"));
  await press(screen, "Save name");
  await act(async () => nameField(screen).props.onChangeText("Phone 2"));
  const afterLoss = {
    alerts: alerts(screen),
    value: nameField(screen).props.value,
    editable: nameField(screen).props.editable,
    cancel: buttonsLabelled(screen, "Cancel").length,
  };
  expect(afterLoss).toEqual({
    alerts: ["The new name is not confirmed yet. Send it again, or check your devices to see the name saved now."],
    value: "Daily phone",
    editable: false,
    cancel: 0,
  });
  devices = [{ ...pixel, label: "Daily phone" }, iphone];
  await press(screen, "Send again");
  expect(env.register.mock.calls.map(([request]) => request)).toEqual([
    { installId: "install-0123456789abcdef", label: "Daily phone", platform: "android", appVersion: "0.4.2" },
    { installId: "install-0123456789abcdef", label: "Daily phone", platform: "android", appVersion: "0.4.2" },
  ]);
  expect(texts(screen)).toEqual(expect.arrayContaining(["Name saved.", "Daily phone"]));
});

test("after a lost rename reply, a different name can only be sent from the name the list now shows", async () => {
  env.register.mockRejectedValueOnce(lostReply());
  const screen = await open();
  await press(screen, "Rename Work Pixel");
  await act(async () => nameField(screen).props.onChangeText("Daily phone"));
  await press(screen, "Save name");
  devices = [{ ...pixel, label: "Daily phone" }, iphone];
  await press(screen, "Check devices");
  expect(env.list).toHaveBeenCalledTimes(2);
  expect(texts(screen)).toEqual(expect.arrayContaining(["This list shows your devices as they are saved now.", "Daily phone"]));
  expect(texts(screen)).not.toContain("Name saved.");
  await press(screen, "Rename Daily phone");
  expect(nameField(screen).props.value).toBe("Daily phone");
  await act(async () => nameField(screen).props.onChangeText("Phone 2"));
  await press(screen, "Save name");
  expect(env.register.mock.calls.map(([request]) => request.label)).toEqual(["Daily phone", "Phone 2"]);
});

test("a lost removal reply never says access was or was not removed; the list settles it", async () => {
  env.revoke.mockRejectedValueOnce(lostReply());
  const screen = await open();
  await press(screen, "Remove access for Old iPhone");
  await press(screen, "Remove access");
  const afterLoss = { alerts: alerts(screen), keep: buttonsLabelled(screen, "Keep access").length };
  devices = [pixel, { ...iphone, revoked: true }];
  await act(async () => { expect(env.backListeners.at(-1)?.()).toBe(true); });
  const shown = texts(screen);
  expect(afterLoss).toEqual({
    alerts: ["Removing Old iPhone is not confirmed yet. Send it again, or check your devices to see if it is still listed."],
    keep: 0,
  });
  expect(shown).toContain("This list shows your devices as they are saved now.");
  expect(shown).not.toContain("Old iPhone");
  expect(shown).not.toContain("Old iPhone no longer has access.");
  expect(shown).not.toContain("Access was not removed. Try again.");
  expect(env.revoke.mock.calls).toEqual([[{ deviceId: "iphone" }]]);
});

test("a lost removal reply retried with Send again removes the same device", async () => {
  env.revoke.mockRejectedValueOnce(lostReply());
  const screen = await open();
  await press(screen, "Remove access for Old iPhone");
  await press(screen, "Remove access");
  devices = [pixel, { ...iphone, revoked: true }];
  await press(screen, "Send again");
  expect(env.revoke.mock.calls).toEqual([[{ deviceId: "iphone" }], [{ deviceId: "iphone" }]]);
  expect(texts(screen)).toContain("Old iPhone no longer has access.");
});

test("a lost removal reply whose retry is refused before the server looked stays unconfirmed, and Send again removes the same device", async () => {
  env.revoke.mockRejectedValueOnce(lostReply()).mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" }));
  const screen = await open();
  await press(screen, "Remove access for Old iPhone");
  await press(screen, "Remove access");
  await press(screen, "Send again");
  expect(alerts(screen)).toEqual(["Removing Old iPhone is not confirmed yet. Send it again, or check your devices to see if it is still listed."]);
  devices = [pixel, { ...iphone, revoked: true }];
  await press(screen, "Send again");
  expect(env.revoke.mock.calls).toEqual([[{ deviceId: "iphone" }], [{ deviceId: "iphone" }], [{ deviceId: "iphone" }]]);
  expect(texts(screen)).toContain("Old iPhone no longer has access.");
});

test("a lost sign-out-others reply is not resent; a session added since then needs a new confirmation", async () => {
  const tablet: Device = { deviceId: "tablet" as Device["deviceId"], label: "New tablet", platform: "android", current: false, revoked: false, clerkActive: true };
  env.revokeOthers.mockRejectedValueOnce(lostReply());
  const screen = await open();
  await press(screen, "Sign out all other sessions");
  devices = [pixel, iphone, tablet];
  await press(screen, "Sign out others");
  const afterLoss = {
    sent: env.revokeOthers.mock.calls.length,
    listed: env.list.mock.calls.length,
    confirmButtons: buttonsLabelled(screen, "Sign out others").length,
    retryButtons: buttonsLabelled(screen, "Send again").length,
    shown: texts(screen),
  };
  expect(afterLoss).toMatchObject({ sent: 1, listed: 2, confirmButtons: 0, retryButtons: 0 });
  expect(afterLoss.shown).toEqual(expect.arrayContaining([
    "Signing out other sessions is not confirmed yet. The list below shows your devices now. Sign them out again if you still need to.",
    "New tablet",
  ]));
  await press(screen, "Sign out all other sessions");
  expect(texts(screen)).toContain("Sign out all other sessions?");
  await press(screen, "Sign out others");
  expect(env.revokeOthers.mock.calls).toEqual([[{}], [{}]]);
});
