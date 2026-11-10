import { beforeEach, expect, test, vi } from "vitest";

const fs = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./fileSystem.testSupport").memoryFileSystem> }));
const view = vi.hoisted(() => ({ captureRef: vi.fn() }));
vi.mock("expo-file-system", async () => {
  const { memoryFileSystem } = await import("./fileSystem.testSupport");
  fs.current = memoryFileSystem();
  return fs.current.module;
});
vi.mock("react-native-view-shot", () => view);
vi.mock("react-native", () => ({ PixelRatio: { get: () => 3 } }));

import { captureMaxAgeMs, deleteAllCaptures, deleteCapture, sweepCaptures } from "./captureFiles";
import { looksBlank, snapshotView } from "./snapshot";

const memory = () => {
  if (!fs.current) throw new Error("file system not mocked");
  return fs.current;
};
const screenSize = { width: 390, height: 844 };
const screenPixels = 390 * 3 * 844 * 3;
const realScreen = "A".repeat(Math.ceil((screenPixels * 0.05 * 4) / 3));
const blankScreen = "A".repeat(Math.ceil((screenPixels * 0.003 * 4) / 3));
const mounted = { current: {} as never };

beforeEach(() => {
  memory().files.clear();
  memory().directories.clear();
  memory().clock.now = 0;
  view.captureRef.mockReset();
});

test("a capture is rendered in process as PNG base64 and written only to the app cache", async () => {
  view.captureRef.mockResolvedValue(realScreen);
  const shot = await snapshotView(mounted, screenSize, "shot-1");
  expect(view.captureRef).toHaveBeenCalledWith(mounted, { format: "png", result: "base64" });
  expect(shot).toEqual({ uri: "file:///cache/lukapp-feedback/shot-1.png", width: 390, height: 844, redacted: false });
  expect([...memory().files.keys()]).toEqual(["file:///cache/lukapp-feedback/shot-1.png"]);
  expect(memory().files.get("file:///cache/lukapp-feedback/shot-1.png")?.encoding).toBe("base64");
});

test("a failed, blank or unmounted capture yields no file and a text-only report", async () => {
  view.captureRef.mockRejectedValueOnce(new Error("The view cannot be captured"));
  expect(await snapshotView(mounted, screenSize, "failed")).toBeNull();
  view.captureRef.mockResolvedValueOnce(blankScreen);
  expect(await snapshotView(mounted, screenSize, "blank")).toBeNull();
  expect(await snapshotView({ current: null }, screenSize, "unmounted")).toBeNull();
  expect(await snapshotView(mounted, { width: 0, height: 0 }, "unlaid")).toBeNull();
  expect(memory().files.size).toBe(0);
});

test("the blank check separates a flat render from a real screen", () => {
  expect(looksBlank(blankScreen, screenPixels)).toBe(true);
  expect(looksBlank(realScreen, screenPixels)).toBe(false);
  expect(looksBlank("", 0)).toBe(true);
});

test("deleting a capture never touches a file outside the capture directory", async () => {
  view.captureRef.mockResolvedValue(realScreen);
  const shot = await snapshotView(mounted, screenSize, "shot-1");
  new (memory().module.File)("file:///cache/lukapp-entry-install-v1.json").write("{}");
  await deleteCapture("file:///cache/lukapp-entry-install-v1.json");
  await deleteCapture("file:///cache/lukapp-feedback/../lukapp-entry-install-v1.json");
  await deleteCapture(shot?.uri ?? "");
  await deleteCapture(shot?.uri ?? "");
  expect([...memory().files.keys()]).toEqual(["file:///cache/lukapp-entry-install-v1.json"]);
});

test("the startup sweep removes leftovers older than a day but keeps a saved report's capture", async () => {
  view.captureRef.mockResolvedValue(realScreen);
  await snapshotView(mounted, screenSize, "old-leftover");
  await snapshotView(mounted, screenSize, "old-saved");
  memory().clock.now = captureMaxAgeMs;
  await snapshotView(mounted, screenSize, "fresh");
  await sweepCaptures(["file:///cache/lukapp-feedback/old-saved.png"], captureMaxAgeMs + 1);
  expect([...memory().files.keys()].sort()).toEqual([
    "file:///cache/lukapp-feedback/fresh.png",
    "file:///cache/lukapp-feedback/old-saved.png",
  ]);
});

test("the local input wipe removes every capture", async () => {
  view.captureRef.mockResolvedValue(realScreen);
  await snapshotView(mounted, screenSize, "a");
  await snapshotView(mounted, screenSize, "b");
  await deleteAllCaptures();
  await deleteAllCaptures();
  expect(memory().files.size).toBe(0);
});
