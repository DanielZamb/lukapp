import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CameraCutoutNativeModule } from "../../modules/camera-cutout";
import { loadCameraCutoutModule as loadWebModule } from "../../modules/camera-cutout/index.web";
import { classifyCameraCutoutFacts, type CameraCutoutFacts } from "../../modules/camera-cutout/src/facts";
import { classifyCutout, useCameraCutout, type CameraCutout, type CutoutRect } from "./cameraCutout";

const source = vi.hoisted(() => ({ load: vi.fn<() => CameraCutoutNativeModule | null>() }));
vi.mock("expo", () => ({ requireOptionalNativeModule: source.load }));

const none = { kind: "none", rect: null };
const hole: CutoutRect = { x: 190, y: 0, width: 20, height: 24 };

describe("Android classification", () => {
  test("a centred top hole returns its window coordinates", () => {
    expect(classifyCutout({ rects: [hole], windowWidth: 400 })).toEqual({ kind: "centredPunchHole", rect: hole });
  });

  test.each([
    { name: "corner", rects: [{ ...hole, x: 5 }] },
    { name: "double top cutout", rects: [hole, { ...hole, x: 210 }] },
    { name: "top hole and another cutout", rects: [hole, { ...hole, y: 700 }] },
    { name: "tall wide notch", rects: [{ x: 120, y: 0, width: 160, height: 90 }] },
    { name: "waterfall edges", rects: [{ x: 0, y: 0, width: 4, height: 800 }, { x: 396, y: 0, width: 4, height: 800 }] },
    { name: "empty", rects: [] },
    { name: "below the top edge", rects: [{ ...hole, y: 1 }] },
    { name: "above the window", rects: [{ ...hole, y: -24 }] },
    { name: "outside the left bound", rects: [{ ...hole, x: -1 }] },
    { name: "outside the right bound", rects: [{ ...hole, x: 390 }] },
  ])("$name returns none", ({ rects }) => {
    expect(classifyCutout({ rects, windowWidth: 400 })).toEqual(none);
  });

  test.each([158, 222])("the 8%% centre-distance boundary at x=%s is inclusive", x => {
    const rect = { ...hole, x };
    expect(classifyCutout({ rects: [rect], windowWidth: 400 })).toEqual({ kind: "centredPunchHole", rect });
  });
  test.each([157.999, 222.001])("beyond the 8%% boundary at x=%s returns none", x => {
    expect(classifyCutout({ rects: [{ ...hole, x }], windowWidth: 400 })).toEqual(none);
  });
  test("the 25% width boundary is exclusive", () => {
    expect(classifyCutout({ rects: [{ ...hole, x: 150, width: 100 }], windowWidth: 400 })).toEqual(none);
    const rect = { ...hole, x: 150.0005, width: 99.999 };
    expect(classifyCutout({ rects: [rect], windowWidth: 400 })).toEqual({ kind: "centredPunchHole", rect });
  });
  test("there is no height threshold and crossing the top edge is allowed", () => {
    const rect = { ...hole, y: -1, height: 700 };
    expect(classifyCutout({ rects: [rect], windowWidth: 400 })).toEqual({ kind: "centredPunchHole", rect });
  });
  test.each([0, -1, NaN, Infinity, -Infinity])("invalid width or height %s returns none", value => {
    expect(classifyCutout({ rects: [{ ...hole, width: value }], windowWidth: 400 })).toEqual(none);
    expect(classifyCutout({ rects: [{ ...hole, height: value }], windowWidth: 400 })).toEqual(none);
    expect(classifyCutout({ rects: [hole], windowWidth: value })).toEqual(none);
  });
  test.each([NaN, Infinity, -Infinity])("nonfinite coordinates %s return none", value => {
    expect(classifyCutout({ rects: [{ ...hole, x: value }], windowWidth: 400 })).toEqual(none);
    expect(classifyCutout({ rects: [{ ...hole, y: value }], windowWidth: 400 })).toEqual(none);
  });
});

function iosFacts(modelIdentifier: string, safeAreaTop = 59, portrait = true): CameraCutoutFacts {
  return { platform: "ios", portrait, windowWidth: 390, modelIdentifier, safeAreaTop };
}

describe("iOS mapping", () => {
  test.each([
    "iPhone15,2", "iPhone15,3", "iPhone15,4", "iPhone15,5", "iPhone16,1", "iPhone16,2",
    "iPhone17,1", "iPhone17,2", "iPhone17,3", "iPhone17,4", "iPhone18,1", "iPhone18,2",
    "iPhone18,3", "iPhone18,4", "iPhone19,2", "iPhone19,3", "iPhone19,7",
  ])("known island %s uses the estimated centred resting rect", identifier => {
    expect(classifyCameraCutoutFacts(iosFacts(identifier, 54))).toEqual({
      kind: "island", rect: { x: 132, y: 11, width: 126, height: 37 },
    });
  });
  test.each([
    "iPhone8,4", "iPhone10,3", "iPhone12,1", "iPhone13,4", "iPhone14,6", "iPhone14,7", "iPhone14,8",
    "iPhone17,5", "iPhone18,5", "iPad16,3", "iPad99,1", "x86_64", "arm64", "", "iPhoneFuture",
  ])("%s stays excluded even with a 70pt safe area", identifier => {
    expect(classifyCameraCutoutFacts(iosFacts(identifier, 70))).toEqual(none);
  });
  test.each(["iPhone19,99", "iPhone20,1"])("unknown iPhone %s requires a portrait inset of at least 59pt", identifier => {
    expect(classifyCameraCutoutFacts(iosFacts(identifier, 58.999))).toEqual(none);
    expect(classifyCameraCutoutFacts(iosFacts(identifier, 59))).toEqual({
      kind: "island", rect: { x: 132, y: 11, width: 126, height: 37 },
    });
    expect(classifyCameraCutoutFacts(iosFacts(identifier, 70, false))).toEqual(none);
    expect(classifyCameraCutoutFacts(iosFacts("iPhone15,2", 59, false))).toEqual(none);
  });
  test("the resting island top follows the host safe area on 62pt and 59pt devices", () => {
    expect(classifyCameraCutoutFacts(iosFacts("iPhone18,1", 62))).toEqual({
      kind: "island", rect: { x: 132, y: 14, width: 126, height: 37 },
    });
    expect(classifyCameraCutoutFacts(iosFacts("iPhone16,1", 59))).toEqual({
      kind: "island", rect: { x: 132, y: 11, width: 126, height: 37 },
    });
  });
  test("unavailable, null and landscape Android facts return none", () => {
    expect(classifyCameraCutoutFacts(null)).toEqual(none);
    expect(classifyCameraCutoutFacts({ platform: "unavailable" })).toEqual(none);
    expect(classifyCameraCutoutFacts({ platform: "android", portrait: false, windowWidth: 400, rects: [hole] })).toEqual(none);
  });
});

function packet(revision: number, facts: CameraCutoutFacts = {
  platform: "android", portrait: true, windowWidth: 400, rects: [hole],
}) {
  return { revision, facts };
}

describe("native subscription hook", () => {
  let root: ReactTestRenderer | undefined;
  let observed: CameraCutout | undefined;
  let listener: (raw: unknown) => void;
  let getSnapshot: ReturnType<typeof vi.fn<CameraCutoutNativeModule["getSnapshot"]>>;
  let subscribe: ReturnType<typeof vi.fn<CameraCutoutNativeModule["addListener"]>>;
  let remove: ReturnType<typeof vi.fn<() => void>>;

  function Harness() {
    observed = useCameraCutout();
    return null;
  }
  async function mount() {
    await act(async () => { root = create(createElement(Harness)); });
  }
  async function unmount() {
    await act(async () => { root?.unmount(); root = undefined; });
  }
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await import("expo");
    observed = undefined;
    listener = () => {};
    getSnapshot = vi.fn(async () => packet(1));
    remove = vi.fn();
    subscribe = vi.fn((_event, callback) => { listener = callback; return { remove }; });
    source.load.mockReset();
    source.load.mockReturnValue({ getSnapshot, addListener: subscribe });
  });
  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
  });

  test("a missing optional native module returns none in a mounted hook", async () => {
    source.load.mockReturnValue(null);
    await mount();
    expect(source.load).toHaveBeenCalledWith("CameraCutout");
    expect(observed).toEqual(none);
    expect(subscribe).not.toHaveBeenCalled();
  });
  test("the web entry returns no module", async () => {
    expect(await loadWebModule()).toBeNull();
    expect(source.load).not.toHaveBeenCalled();
  });
  test("loading exceptions return none and a later mount retries", async () => {
    source.load.mockImplementationOnce(() => { throw new Error("Runtime unavailable"); });
    await mount();
    expect(observed).toEqual(none);
    await unmount();
    await mount();
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
    expect(source.load).toHaveBeenCalledTimes(2);
  });
  test("the listener is registered before reading the snapshot", async () => {
    getSnapshot.mockImplementation(async () => {
      expect(subscribe).toHaveBeenCalledOnce();
      return packet(1);
    });
    await mount();
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
    expect(subscribe).toHaveBeenCalledWith("onCutoutChange", expect.any(Function));
  });
  test("new events update portrait, insets and window geometry", async () => {
    await mount();
    await act(async () => { listener(packet(2, iosFacts("iPhone15,2"))); });
    expect(observed).toEqual({ kind: "island", rect: { x: 132, y: 11, width: 126, height: 37 } });
    await act(async () => { listener(packet(3, iosFacts("iPhone15,2", 59, false))); });
    expect(observed).toEqual(none);
    await act(async () => { listener(packet(4, { platform: "android", portrait: true, windowWidth: 400, rects: [] })); });
    expect(observed).toEqual(none);
    await act(async () => { listener(packet(5)); });
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
  });
  test("late snapshots and stale or duplicate events cannot replace newer facts", async () => {
    let finish: (value: unknown) => void = () => {};
    getSnapshot.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount();
    await act(async () => { listener(packet(3, iosFacts("iPhone15,2"))); });
    await act(async () => { finish(packet(1)); listener(packet(2)); listener(packet(3)); });
    expect(observed).toEqual({ kind: "island", rect: { x: 132, y: 11, width: 126, height: 37 } });
  });
  test.each([
    undefined,
    { revision: -1, facts: null },
    { revision: 1.5, facts: null },
    { revision: Infinity, facts: null },
    { revision: 2, facts: { platform: "android", portrait: true, windowWidth: 400, rects: [{ ...hole, width: NaN }] } },
    { revision: 2, facts: { platform: "ios", portrait: true, windowWidth: 390, modelIdentifier: "iPhone15,2" } },
    { revision: 2, facts: { platform: "ios", portrait: true, windowWidth: 390, modelIdentifier: "iPhone15,2", safeAreaTop: -1 } },
    { revision: 2, facts: { platform: "android", portrait: "yes", windowWidth: 400, rects: [hole] } },
  ])("invalid native packets fail closed and valid later events recover: %j", async raw => {
    await mount();
    await act(async () => { listener(raw); });
    expect(observed).toEqual(none);
    await act(async () => { listener(packet(3)); });
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
  });
  test("read failures return none but a later native event recovers", async () => {
    getSnapshot.mockRejectedValueOnce(new Error("No window"));
    await mount();
    expect(observed).toEqual(none);
    await act(async () => { listener(packet(2)); });
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
  });
  test("a rejected stale read does not erase an event delivered while reading", async () => {
    let rejectRead: (reason: Error) => void = () => {};
    getSnapshot.mockImplementation(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
    await mount();
    await act(async () => { listener(packet(2)); rejectRead(new Error("Old read failed")); });
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
  });
  test("subscription failure returns none and a later mount retries", async () => {
    subscribe.mockImplementationOnce(() => { throw new Error("Subscription unavailable"); });
    await mount();
    expect(observed).toEqual(none);
    expect(getSnapshot).not.toHaveBeenCalled();
    await unmount();
    await mount();
    expect(observed).toEqual({ kind: "centredPunchHole", rect: hole });
  });
  test("unmount removes the listener and ignores queued events and a late snapshot", async () => {
    let finish: (value: unknown) => void = () => {};
    getSnapshot.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount();
    await unmount();
    expect(remove).toHaveBeenCalledOnce();
    await act(async () => { listener(packet(4)); finish(packet(5)); });
    expect(observed).toEqual(none);
  });
  test("cleanup tolerates native listener removal failure", async () => {
    remove.mockImplementation(() => { throw new Error("Native runtime destroyed"); });
    await mount();
    await unmount();
    expect(remove).toHaveBeenCalledOnce();
  });
});
