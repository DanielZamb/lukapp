import React, { createElement, useContext } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { DeviceActivity } from "./DeviceActivity";
import { LocalEntryInteraction } from "../local-auth/interaction";

const sdk = vi.hoisted(() => ({
  record: vi.fn(async (_args: Record<string, never>) => null),
  interaction: vi.fn(),
  report: vi.fn((_error: unknown) => false),
}));
vi.mock("convex/react", () => ({ useAction: () => sdk.record }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => sdk.report }));
let root: ReactTestRenderer | undefined;
function KeyboardInput() {
  const onChange = useContext(LocalEntryInteraction);
  return createElement("input", { onChange });
}
async function open() {
  await act(async () => {
    root = create(createElement(LocalEntryInteraction.Provider, {
      value: sdk.interaction,
      children: createElement(DeviceActivity, { children: createElement(KeyboardInput) }),
    }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("admitted content records opening and real touch or keyboard activity, while idle time does not refresh", async () => {
  await open();
  expect(sdk.record).toHaveBeenCalledExactlyOnceWith({});
  await act(async () => root?.root.findByType("div").props.onTouchStart());
  expect(sdk.interaction).toHaveBeenCalledOnce();
  expect(sdk.record).toHaveBeenCalledOnce();
  vi.setSystemTime(1_060_000);
  expect(sdk.record).toHaveBeenCalledOnce();
  await act(async () => root?.root.findByType("div").props.onTouchMove());
  expect(sdk.record).toHaveBeenCalledTimes(2);
  vi.setSystemTime(1_120_000);
  await act(async () => root?.root.findByType("input").props.onChange());
  expect(sdk.record).toHaveBeenCalledTimes(3);
  expect(sdk.interaction).toHaveBeenCalledTimes(3);
});

test("activity denial reaches the shared local cleanup owner", async () => {
  const error = new ConvexError({ code: "session_inactive", wipeLocalInput: true });
  sdk.record.mockRejectedValueOnce(error);
  await open();
  expect(sdk.report).toHaveBeenCalledExactlyOnceWith(error);
});
