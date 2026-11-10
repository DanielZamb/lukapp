import { createHash } from "node:crypto";
import * as React from "react";
import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import * as SecureStore from "expo-secure-store";

const device = vi.hoisted(() => {
  const appListeners = new Map<string, Set<(value?: string) => void>>();
  const backListeners: (() => boolean)[] = [];
  const sensor = new Set<(reading: { x: number; y: number; z: number }) => void>();
  return {
    appState: {
      currentState: "active",
      addEventListener(type: string, listener: (value?: string) => void) {
        const set = appListeners.get(type) ?? new Set();
        set.add(listener);
        appListeners.set(type, set);
        return { remove: () => set.delete(listener) };
      },
    },
    emitApp(type: string, value?: string) {
      if (type === "change" && value) this.appState.currentState = value;
      for (const listener of appListeners.get(type) ?? []) listener(value);
    },
    backHandler: {
      addEventListener(_type: string, listener: () => boolean) {
        backListeners.push(listener);
        return { remove: () => backListeners.splice(backListeners.indexOf(listener), 1) };
      },
    },
    systemBack() {
      for (const listener of [...backListeners].reverse()) if (listener()) return true;
      return false;
    },
    backListeners,
    sensor,
    accelerometer: {
      setUpdateInterval: () => {},
      addListener(listener: (reading: { x: number; y: number; z: number }) => void) {
        sensor.add(listener);
        return { remove: () => sensor.delete(listener) };
      },
    },
    clock: { now: 1_000_000 },
    uuid: 0,
  };
});
const backend = vi.hoisted(() => ({
  audience: "public" as "public" | "private",
  calls: [] as [string, unknown][],
  /** Answers one action call in place of the default when it returns a promise. */
  respond: null as null | ((name: string, args: unknown) => Promise<unknown> | undefined),
}));
const view = vi.hoisted(() => ({ captureRef: vi.fn(), onCapture: [] as (() => void)[] }));
const gate = vi.hoisted(() => ({ unlocked: true }));
const fs = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./fileSystem.testSupport").memoryFileSystem> }));

vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Platform: { OS: "android", Version: 35 },
  Text: "text",
  View: "view",
  Pressable: "pressable",
  ScrollView: "scroll",
  TextInput: "input",
  Switch: "switch",
  Image: "image",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  AppState: device.appState,
  BackHandler: device.backHandler,
  PixelRatio: { get: () => 3 },
  PanResponder: {
    create: (config: Record<string, unknown>) => ({
      panHandlers: {
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
    }),
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", async () => {
  const { createHash: hash } = await import("node:crypto");
  return {
    randomUUID: () => `uuid-${++device.uuid}`,
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digest: async (_algorithm: string, data: ArrayBuffer) => {
      const value = hash("sha256").update(new Uint8Array(data)).digest();
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
  };
});
vi.mock("expo-router", () => ({ usePathname: () => "/settings" }));
vi.mock("expo-sensors", () => ({ Accelerometer: device.accelerometer }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "0.1.0" } } }));
vi.mock("react-native-view-shot", () => view);
vi.mock("../intake/cleanup", () => ({ clearNativeIntake: async () => {} }));
vi.mock("expo-file-system", async () => {
  const { memoryFileSystem } = await import("./fileSystem.testSupport");
  fs.current = memoryFileSystem();
  return fs.current.module;
});
vi.mock("convex/react", () => {
  const client = {
    query: async (ref: never, args: unknown) => {
      backend.calls.push([getFunctionName(ref), args]);
      return { configured: true, repository: "owner/lukapp", audience: backend.audience, screenshotRetentionDays: 30 };
    },
    mutation: async (ref: never, args: unknown) => {
      backend.calls.push([getFunctionName(ref), args]);
      return null;
    },
    action: async (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      backend.calls.push([name, args]);
      const answer = backend.respond?.(name, args);
      if (answer) return answer;
      if (name === "feedback:attachScreenshot") {
        const { createHash: hash } = await import("node:crypto");
        return { sha256: hash("sha256").update(new Uint8Array((args as { image: ArrayBuffer }).image)).digest("hex") };
      }
      return { reference: "LK-7Q2", issueNumber: 123, url: "https://github.com/owner/lukapp/issues/123" };
    },
  };
  return {
    useConvex: () => client,
    useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true }),
  };
});

import { LanguageProvider } from "../../i18n";
import { LocalInput, LocalInputLease } from "../../local-auth/localInput";
import { clearLocalInput } from "../clearLocalInput";
import { IntakeAdmission } from "../intake/admission";
import { FeedbackAdmission } from "./controls";
import { FeedbackHost } from "./FeedbackHost";
import { FeedbackIntroCard } from "./FeedbackIntroCard";
import { FeedbackSettings } from "./FeedbackSettings";

const secure = new Map<string, string>();
let root: ReactTestRenderer | undefined;
const realScreen = "A".repeat(2_000_000);

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockImplementation(() => device.clock.now);
  secure.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => secure.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => void secure.set(key, value));
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => void secure.delete(key));
  backend.audience = "public";
  backend.calls = [];
  backend.respond = null;
  view.onCapture = [];
  view.captureRef.mockReset().mockImplementation(async () => {
    for (const inspect of view.onCapture) inspect();
    return realScreen;
  });
  fs.current?.files.clear();
  device.appState.currentState = "active";
  device.uuid = 0;
  gate.unlocked = true;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A caller screen with its own typed state, to prove the report returns to it intact. */
function Caller() {
  const [amount, setAmount] = useState("");
  return createElement("input", { accessibilityLabel: "Amount", value: amount, onChangeText: setAmount });
}

async function render(children: ReactNode, { admitted = true, unlocked = true, language = "en" as "en" | "es" } = {}) {
  gate.unlocked = unlocked;
  const lease = new LocalInputLease("owner", "session");
  await act(async () => {
    root = create(
      createElement(
        LanguageProvider,
        { initialPreference: language },
        createElement(
        LocalInput.Provider,
        { value: lease },
        createElement(
          IntakeAdmission.Provider,
          { value: () => gate.unlocked },
          createElement(FeedbackHost, null, admitted ? createElement(FeedbackAdmission) : null, children),
        ),
      ),
      ),
      { createNodeMock: () => ({}) },
    );
  });
  const content = root!.root.findAll(
    (node) => (node.type as unknown) === "view" && node.props.collapsable === false && typeof node.props.onLayout === "function",
  )[0];
  await act(async () => content.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }));
  return content;
}

const textOf = (node: ReactTestInstance) =>
  node
    .findAll((child) => (child.type as unknown) === "text")
    .map((child) => child.children.filter((part) => typeof part === "string").join(""))
    .join("\n");
const screenText = () => textOf(root!.root);
const layer = () => root!.root.findAll((node) => node.props.testID === "feedback-layer" && (node.type as unknown) === "view")[0];
const layerText = () => (layer() ? textOf(layer()) : "");
function control(label: string): ReactTestInstance {
  const scope = layer() ?? root!.root;
  const found = scope.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === label)[0];
  if (!found) throw new Error(`Missing control: ${label}`);
  return found;
}
async function press(label: string) {
  await act(async () => {
    const target = control(label);
    if (!target.props.disabled) target.props.onPress();
  });
}
async function pressRow(title: string) {
  const row = root!.root.findAll(
    (node) => (node.type as unknown) === "pressable" && textOf(node).split("\n").includes(title),
  )[0];
  if (!row) throw new Error(`Missing row: ${title}`);
  expect(row.props.accessibilityRole).toBe("button");
  await act(async () => row.props.onPress());
}
async function type(label: string, value: string) {
  await act(async () => control(label).props.onChangeText(value));
}
async function systemBack() {
  let handled = false;
  await act(async () => {
    handled = device.systemBack();
  });
  return handled;
}
async function shake() {
  await act(async () => {
    for (let index = 0; index < 20; index++) {
      device.clock.now += 40;
      for (const listener of [...device.sensor]) listener({ x: index % 2 ? -2 : 2, y: 0, z: 1 });
    }
  });
  await act(async () => {});
}

test("Settings opens a text report without a screenshot, sends it, and Done returns to Settings", async () => {
  await render(createElement(FeedbackSettings));
  await pressRow("Report a problem");
  expect(view.captureRef).not.toHaveBeenCalled();
  expect(layerText()).toContain("This report is text only.");
  expect(layerText()).toContain(
    "This report becomes a public issue in owner/lukapp on GitHub. Anyone on the internet can read it. If you include the screenshot, Lukapp keeps it on its server for 30 days, links it from the issue and then deletes it.",
  );
  expect(layerText()).toContain(
    "The report also includes the app version, platform, system version, language and screen name. Nothing else from your account goes with it.",
  );
  expect(layerText()).toContain("Don't include account numbers, passwords or codes.");
  await press("Send feedback");
  await type("Title", "Weekly view");
  await type("What happened", "I'd like to see spending by week.");
  expect(backend.calls.map(([name]) => name)).toEqual(["feedback:destination"]);
  await press("Send report");
  expect(backend.calls.slice(1)).toEqual([
    [
      "feedback:submit",
      {
        reportKey: "uuid-1",
        kind: "feedback",
        title: "Weekly view",
        whatHappened: "I'd like to see spending by week.",
        context: { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en", screen: "/settings" },
      },
    ],
  ]);
  expect(layerText()).toContain("Report #123 sent");
  expect(layerText()).toContain("Your reference is LK-7Q2.");
  await press("Done");
  expect(layer()).toBeUndefined();
  expect(secure.has("lukapp.feedback.report.owner")).toBe(false);
});

test("in Spanish the Settings path reads from the Colombian catalog and sends the language as context", async () => {
  backend.audience = "private";
  await render(createElement(FeedbackSettings), { language: "es" });
  expect(screenText()).toContain("Agitar para reportar");
  await pressRow("Reportar un problema");
  expect(layerText()).toContain("Este reporte va solo con texto.");
  expect(layerText()).toContain("Este reporte llega a owner/lukapp en GitHub, un repositorio privado.");
  await type("Título", "Saldo raro");
  await type("Qué pasó", "El total no cuadra.");
  await press("Enviar reporte");
  expect((backend.calls.at(-1)?.[1] as { context: { language: string } }).context.language).toBe("es");
  expect(layerText()).toContain("Reporte #123 enviado");
});

test("form messages follow the backend limits before anything is sent", async () => {
  await render(createElement(FeedbackSettings));
  await pressRow("Report a problem");
  await type("Title", "ab");
  await press("Send report");
  expect(layerText()).toContain("Write a title of at least 3 characters.");
  expect(layerText()).toContain("Tell us what happened.");
  expect(backend.calls.map(([name]) => name)).toEqual(["feedback:destination"]);
});

test("the guide replays from Settings, practice never submits, and its Back returns to the guide", async () => {
  await render(createElement(FeedbackSettings));
  await pressRow("How to report a problem");
  expect(secure.get("lukapp.feedback.guide")).toBe("seen");
  expect(layerText()).toContain("Step 1 of 5");
  expect(layerText()).toContain("Shake the phone");
  await press("Next");
  await press("Previous");
  expect(layerText()).toContain("Step 1 of 5");
  for (const step of [2, 3, 4, 5]) {
    await press("Next");
    expect(layerText()).toContain(`Step ${step} of 5`);
  }
  expect(layerText()).toContain("Settings has Report a problem too");
  await press("Try it");
  expect(layerText()).toContain("PRACTICE");
  expect(layerText()).toContain("This is practice. Nothing here is sent.");
  expect(() => control("Send report")).toThrow("Missing control");
  await type("Title", "Practice title");
  await type("What happened", "Practice text");
  await press("Back to the guide");
  expect(layerText()).toContain("Step 5 of 5");
  await press("Try it");
  expect(await systemBack()).toBe(true);
  expect(layerText()).toContain("Step 5 of 5");
  await press("Done");
  expect(layer()).toBeUndefined();
  expect(backend.calls.map(([name]) => name).filter((name) => name !== "feedback:destination")).toEqual([]);
  expect(view.captureRef).not.toHaveBeenCalled();
  expect(secure.has("lukapp.feedback.report.owner")).toBe(false);
});

test("the guide shows where reports go for the configured audience", async () => {
  backend.audience = "private";
  await render(createElement(FeedbackSettings));
  await pressRow("How to report a problem");
  for (let step = 0; step < 3; step++) await press("Next");
  expect(layerText()).toContain("Reports go to owner/lukapp on GitHub, a private repository only the Lukapp team can read.");
});

test("Android Back closes the report over the same caller twice without stacking, asking first when text is typed", async () => {
  const content = await render([createElement(Caller, { key: "caller" }), createElement(FeedbackSettings, { key: "settings" })]);
  await act(async () => control("Amount").props.onChangeText("45.000"));
  for (const round of [1, 2]) {
    await pressRow("Report a problem");
    expect(content.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(device.backListeners).toHaveLength(1);
    await type("What happened", `Round ${round}`);
    expect(await systemBack()).toBe(true);
    expect(layerText()).toContain("Discard this report?");
    expect(await systemBack()).toBe(true);
    expect(control("What happened").props.value).toBe(`Round ${round}`);
    await press("Cancel");
    expect(layerText()).toContain("Discard this report?");
    await press("Discard");
    expect(layer()).toBeUndefined();
    expect(device.backListeners).toHaveLength(0);
    expect(content.props.importantForAccessibility).toBe("auto");
    expect(control("Amount").props.value).toBe("45.000");
  }
  await pressRow("Report a problem");
  expect(await systemBack()).toBe(true);
  expect(layer()).toBeUndefined();
  expect(await systemBack()).toBe(false);
  expect(backend.calls.map(([name]) => name).filter((name) => name !== "feedback:destination")).toEqual([]);
});

test("a shake captures the caller screen before the report appears; public reports leave it out unless switched on", async () => {
  const layerAtCapture: boolean[] = [];
  view.onCapture.push(() => layerAtCapture.push(layer() !== undefined));
  await render(createElement(Caller));
  expect(device.sensor.size).toBe(1);
  await shake();
  expect(layerAtCapture).toEqual([false]);
  expect(device.sensor.size).toBe(0);
  const preview = control("Screenshot of the screen you were on");
  expect(preview.props.source).toEqual({ uri: "file:///cache/lukapp-feedback/uuid-1.png" });
  expect(control("Include the screenshot").props.value).toBe(false);
  expect(layerText()).toContain("Off because anyone can read this report.");
  await shake();
  expect(view.captureRef).toHaveBeenCalledTimes(1);
  await type("Title", "Total is off");
  await type("What happened", "Home and Overview differ.");
  await press("Send report");
  expect(backend.calls.map(([name]) => name)).toEqual(["feedback:destination", "feedback:submit"]);
  expect((backend.calls[1][1] as { screenshotSha256?: string }).screenshotSha256).toBeUndefined();
  expect([...fs.current!.files.keys()]).toEqual([]);
  await press("Done");
  expect(device.sensor.size).toBe(1);
});

test("a shake while the entry gate is not open never captures and continues as text only", async () => {
  await render(createElement(Caller), { unlocked: false });
  await shake();
  expect(view.captureRef).not.toHaveBeenCalled();
  expect(layerText()).toContain("A screenshot wasn't possible here, so this report is text only.");
});

test("cancelling a shake report deletes its capture and sends nothing", async () => {
  await render(createElement(Caller));
  await shake();
  expect([...fs.current!.files.keys()]).toEqual(["file:///cache/lukapp-feedback/uuid-1.png"]);
  await press("Cancel");
  expect(layer()).toBeUndefined();
  expect([...fs.current!.files.keys()]).toEqual([]);
  expect(backend.calls.map(([name]) => name)).toEqual(["feedback:destination"]);
});

test("blacking out flattens boxes into a new file, deletes the original and sends only the flattened image's digest", async () => {
  backend.audience = "private";
  await render(createElement(Caller));
  await shake();
  await press("Black out parts");
  await act(async () =>
    control("Screenshot. Drag to draw a black box.").parent!.props.onLayout({
      nativeEvent: { layout: { width: 300, height: 700 } },
    }),
  );
  const canvas = control("Screenshot. Drag to draw a black box.");
  expect(canvas.props.style).toMatchObject({ width: 300 });
  await act(async () => {
    canvas.props.onResponderGrant({ nativeEvent: { locationX: 10, locationY: 20 } });
    canvas.props.onResponderMove({}, { dx: 100, dy: 50 });
    canvas.props.onResponderRelease({}, { dx: 100, dy: 50 });
  });
  expect(layerText()).toContain("1 box");
  const boxesAtFlatten: { color: string; left: number; top: number; right: number; bottom: number }[] = [];
  view.onCapture.push(() => {
    for (const box of root!.root.findAll((node) => (node.type as unknown) === "view" && node.props.testID === "redaction-box")) {
      const style = box.props.style;
      boxesAtFlatten.push({
        color: style.backgroundColor, left: style.left, top: style.top,
        right: style.left + style.width, bottom: style.top + style.height,
      });
    }
  });
  await press("Apply");
  expect(view.captureRef).toHaveBeenCalledTimes(2);
  expect(boxesAtFlatten).toHaveLength(1);
  expect(boxesAtFlatten[0].color).toBe("#000000");
  expect(boxesAtFlatten[0].left).toBeLessThanOrEqual(10);
  expect(boxesAtFlatten[0].top).toBeLessThanOrEqual(20);
  expect(boxesAtFlatten[0].right).toBeGreaterThanOrEqual(110);
  expect(boxesAtFlatten[0].bottom).toBeGreaterThanOrEqual(70);
  expect([...fs.current!.files.keys()]).toEqual(["file:///cache/lukapp-feedback/uuid-3.png"]);
  expect(control("Screenshot of the screen you were on").props.source).toEqual({
    uri: "file:///cache/lukapp-feedback/uuid-3.png",
  });
  expect(layerText()).toContain("Parts of this image are blacked out.");
  const previewed = previewedFileDigest();
  await type("Title", "Hidden numbers");
  await type("What happened", "Testing the black boxes.");
  await press("Send report");
  expect(backend.calls.map(([name]) => name)).toEqual([
    "feedback:destination",
    "feedback:attachScreenshot",
    "feedback:submit",
  ]);
  const attached = backend.calls[1][1] as { reportKey: string; image: ArrayBuffer };
  expect(attached.reportKey).toBe("uuid-2");
  expect(new TextDecoder().decode(attached.image)).toBe(realScreen);
  expect((backend.calls[2][1] as { screenshotSha256?: string }).screenshotSha256).toBe(previewed);
});

/** Hashes, independently of the app, the bytes of the file the preview is showing. */
function previewedFileDigest() {
  const { uri } = control("Screenshot of the screen you were on").props.source as { uri: string };
  const file = fs.current!.files.get(uri);
  if (!file) throw new Error(`Preview file missing: ${uri}`);
  return createHash("sha256").update(file.content).digest("hex");
}

test("from the press of Send until the attempt resolves, the screenshot controls are disabled and change nothing", async () => {
  backend.audience = "private";
  let release = () => {};
  backend.respond = (name) =>
    name === "feedback:attachScreenshot"
      ? new Promise((resolve) => {
          release = () => resolve({ sha256: previewed });
        })
      : undefined;
  await render(createElement(Caller));
  await shake();
  const previewed = previewedFileDigest();
  await type("Title", "Total is off");
  await type("What happened", "Home and Overview differ.");
  await press("Send report");
  expect(layerText()).toContain("Uploading screenshot…");
  for (const label of ["Include the screenshot", "Black out parts", "Remove screenshot", "Title"])
    expect([label, control(label).props.disabled ?? !control(label).props.editable]).toEqual([label, true]);
  await act(async () => control("Include the screenshot").props.onValueChange(false));
  await act(async () => control("Remove screenshot").props.onPress());
  await act(async () => release());
  expect(backend.calls.map(([name]) => name)).toEqual([
    "feedback:destination",
    "feedback:attachScreenshot",
    "feedback:submit",
  ]);
  expect(backend.calls[2][1]).toMatchObject({ title: "Total is off", screenshotSha256: previewed });
  expect(layerText()).toContain("Report #123 sent");
});

test("an expired report says so, keeps the text and screenshot, and Send goes again under a new key", async () => {
  backend.audience = "private";
  const { ConvexError } = await import("convex/values");
  let expired = true;
  backend.respond = (name) => {
    if (name !== "feedback:submit" || !expired) return undefined;
    expired = false;
    return Promise.reject(new ConvexError({ code: "report_expired" }));
  };
  await render(createElement(Caller));
  await shake();
  await type("Title", "Total is off");
  await type("What happened", "Home and Overview differ.");
  await press("Send report");
  expect(layerText()).toContain(
    "The earlier attempt expired before it reached the team. Your report is still here, so you can send it again.",
  );
  expect(control("Title").props.value).toBe("Total is off");
  expect(control("Screenshot of the screen you were on").props.source).toEqual({ uri: "file:///cache/lukapp-feedback/uuid-1.png" });
  await press("Send report");
  expect(backend.calls.map(([name, args]) => [name, (args as { reportKey?: string }).reportKey])).toEqual([
    ["feedback:destination", undefined],
    ["feedback:attachScreenshot", "uuid-2"],
    ["feedback:submit", "uuid-2"],
    ["feedback:removeScreenshot", "uuid-2"],
    ["feedback:attachScreenshot", "uuid-3"],
    ["feedback:submit", "uuid-3"],
  ]);
  expect(layerText()).toContain("Report #123 sent");
});

test("no motion is read before admission, in the background, or with shake turned off", async () => {
  await render(createElement(FeedbackSettings), { admitted: false });
  expect(device.sensor.size).toBe(0);
  await act(async () => root?.unmount());
  await render(createElement(FeedbackSettings));
  expect(device.sensor.size).toBe(1);
  await act(async () => device.emitApp("change", "background"));
  expect(device.sensor.size).toBe(0);
  await act(async () => device.emitApp("change", "active"));
  expect(device.sensor.size).toBe(1);
  await act(async () => device.emitApp("blur"));
  expect(device.sensor.size).toBe(0);
  await act(async () => device.emitApp("focus"));
  await act(async () => control("Shake to report").props.onValueChange(false));
  expect(device.sensor.size).toBe(0);
  expect(secure.get("lukapp.feedback.shake")).toBe("off");
  await pressRow("Report a problem");
  expect(layerText()).toContain("This report is text only.");
  expect(layerText()).not.toContain("shake the phone");
});

test("existing users see the intro card once on Home; the setup completion step counts as seen", async () => {
  await render(createElement(FeedbackIntroCard, { placement: "home" }));
  expect(screenText()).toContain("Something not working?");
  await press("Not now");
  expect(screenText()).not.toContain("Something not working?");
  expect(secure.get("lukapp.feedback.guide")).toBe("seen");
  await act(async () => root?.unmount());
  await render(createElement(FeedbackIntroCard, { placement: "home" }));
  expect(screenText()).not.toContain("Something not working?");

  secure.clear();
  await act(async () => root?.unmount());
  await render(createElement(FeedbackIntroCard, { placement: "completion" }));
  expect(screenText()).toContain("Something not working?");
  expect(secure.get("lukapp.feedback.guide")).toBe("seen");
  await press("Show me how");
  expect(layerText()).toContain("Step 1 of 5");
});

test("a report left open is saved with its key and offered again from Settings", async () => {
  await render(createElement(FeedbackSettings));
  await pressRow("Report a problem");
  await type("Title", "Saved for later");
  await type("What happened", "The app closed.");
  await act(async () => device.emitApp("change", "background"));
  const saved = JSON.parse(secure.get("lukapp.feedback.report.owner") ?? "null");
  expect(saved.report).toMatchObject({ reportKey: "uuid-1", fields: { title: "Saved for later" } });
  await act(async () => root?.unmount());
  await render(createElement(FeedbackSettings));
  expect(screenText()).toContain("An unsent report is saved on this phone");
  await pressRow("Report a problem");
  expect(layerText()).toContain("You have an unsent report");
  await press("Resume report");
  expect(control("Title").props.value).toBe("Saved for later");
  await press("Send report");
  expect((backend.calls.at(-1)?.[1] as { reportKey: string }).reportKey).toBe("uuid-1");
});

test("the local input wipe deletes report captures along with the saved report", async () => {
  await render(createElement(Caller));
  await shake();
  await type("What happened", "Typed before access ended");
  await act(async () => device.emitApp("change", "background"));
  expect(fs.current!.files.size).toBe(1);
  expect(secure.has("lukapp.feedback.report.owner")).toBe(true);
  await clearLocalInput("owner");
  expect(fs.current!.files.size).toBe(0);
  expect(secure.has("lukapp.feedback.report.owner")).toBe(false);
});

function heldCapture() {
  let release = () => {};
  view.captureRef.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        release = () => resolve(realScreen);
      }),
  );
  return () => release();
}

test("a capture that finishes after the app went to the background is deleted and opens nothing", async () => {
  await render(createElement(Caller));
  const release = heldCapture();
  await shake();
  expect(view.captureRef).toHaveBeenCalledTimes(1);
  await act(async () => device.emitApp("change", "background"));
  await act(async () => release());
  await act(async () => device.emitApp("change", "active"));
  expect(layer()).toBeUndefined();
  expect([...fs.current!.files.keys()]).toEqual([]);
  expect(device.sensor.size).toBe(1);
});

test("a capture that finishes after sign-out is deleted and opens nothing", async () => {
  await render(createElement(Caller));
  const release = heldCapture();
  await shake();
  gate.unlocked = false;
  await act(async () => release());
  expect(layer()).toBeUndefined();
  expect([...fs.current!.files.keys()]).toEqual([]);
});
