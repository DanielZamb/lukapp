import { describe, expect, it } from "vitest";
import { createPostedActivitySource } from "./source";
import type { PostedUpdate } from "./source";

function transportFixture() {
  const subscriptions: {
    workspace: string;
    receive: (update: PostedUpdate) => void;
    stopped: boolean;
  }[] = [];
  const source = createPostedActivitySource({
    subscribe(workspace, receive) {
      const subscription = { workspace, receive, stopped: false };
      subscriptions.push(subscription);
      return () => {
        subscription.stopped = true;
      };
    },
  });
  return { source, subscriptions };
}
const rows = [
  {
    id: "fixture-1",
    title: "UI fixture",
    supporting: "Not a financial account",
    signedAmount: "-$4.00",
  },
];

describe("shared Posted activity read lifecycle", () => {
  it("opens one upstream read for multiple consumers and publishes the same snapshot", () => {
    const { source, subscriptions } = transportFixture();
    source.setScope({ kind: "connected", workspaceId: "a" });
    const first: unknown[] = [];
    const second: unknown[] = [];
    const offFirst = source.subscribe(() => first.push(source.getSnapshot()));
    const offSecond = source.subscribe(() => second.push(source.getSnapshot()));
    expect(subscriptions).toHaveLength(1);
    subscriptions[0]?.receive({ kind: "ready", rows });
    expect(first.at(-1)).toBe(second.at(-1));
    expect(source.getSnapshot()).toEqual({
      kind: "ready",
      workspaceId: "a",
      rows,
    });
    offFirst();
    expect(subscriptions[0]?.stopped).toBe(false);
    offSecond();
    expect(subscriptions[0]?.stopped).toBe(true);
    expect(source.getSnapshot()).toEqual({
      kind: "unavailable",
      reason: "inactive",
    });
  });
  it("clears old Workspace rows before the new read and rejects late callbacks", () => {
    const { source, subscriptions } = transportFixture();
    const observations: unknown[] = [];
    const off = source.subscribe(() => observations.push(source.getSnapshot()));
    source.setScope({ kind: "connected", workspaceId: "a" });
    subscriptions[0]?.receive({ kind: "ready", rows });
    source.setScope({ kind: "connected", workspaceId: "b" });
    expect(subscriptions[0]?.stopped).toBe(true);
    expect(source.getSnapshot()).toEqual({ kind: "loading", workspaceId: "b" });
    subscriptions[0]?.receive({ kind: "ready", rows });
    expect(source.getSnapshot()).toEqual({ kind: "loading", workspaceId: "b" });
    subscriptions[1]?.receive({ kind: "ready", rows: [] });
    expect(observations.at(-1)).toEqual({
      kind: "ready",
      workspaceId: "b",
      rows: [],
    });
    off();
  });
  it("disconnects, clears rows for all readers, rejects late updates and reconnects afresh", () => {
    const { source, subscriptions } = transportFixture();
    const off = source.subscribe(() => {});
    source.setScope({ kind: "connected", workspaceId: "a" });
    subscriptions[0]?.receive({ kind: "ready", rows });
    subscriptions[0]?.receive({ kind: "offline" });
    expect(subscriptions[0]?.stopped).toBe(true);
    expect(source.getSnapshot()).toEqual({
      kind: "unavailable",
      reason: "offline",
    });
    subscriptions[0]?.receive({ kind: "ready", rows });
    expect(source.getSnapshot()).toEqual({
      kind: "unavailable",
      reason: "offline",
    });
    source.setScope({ kind: "connected", workspaceId: "a" });
    expect(subscriptions).toHaveLength(2);
    expect(source.getSnapshot()).toEqual({ kind: "loading", workspaceId: "a" });
    off();
  });
  it("sign-out clears the current read and identical scope does not resubscribe", () => {
    const { source, subscriptions } = transportFixture();
    const off = source.subscribe(() => {});
    source.setScope({ kind: "connected", workspaceId: "a" });
    source.setScope({ kind: "connected", workspaceId: "a" });
    expect(subscriptions).toHaveLength(1);
    subscriptions[0]?.receive({ kind: "ready", rows });
    source.setScope({ kind: "unavailable", reason: "signed-out" });
    expect(source.getSnapshot()).toEqual({
      kind: "unavailable",
      reason: "signed-out",
    });
    expect(subscriptions[0]?.stopped).toBe(true);
    off();
  });
  it("handles a synchronous offline callback without leaking its subscription", () => {
    let stopped = false;
    const source = createPostedActivitySource({
      subscribe: (_workspace, receive) => {
        receive({ kind: "offline" });
        return () => {
          stopped = true;
        };
      },
    });
    const off = source.subscribe(() => {});
    source.setScope({ kind: "connected", workspaceId: "a" });
    expect(stopped).toBe(true);
    expect(source.getSnapshot()).toEqual({
      kind: "unavailable",
      reason: "offline",
    });
    off();
  });
  it("exposes read failures instead of retaining financial rows", () => {
    const { source, subscriptions } = transportFixture();
    const off = source.subscribe(() => {});
    source.setScope({ kind: "connected", workspaceId: "a" });
    subscriptions[0]?.receive({ kind: "ready", rows });
    subscriptions[0]?.receive({ kind: "failed", message: "Read unavailable" });
    expect(source.getSnapshot()).toEqual({
      kind: "failed",
      workspaceId: "a",
      message: "Read unavailable",
    });
    off();
  });
});
