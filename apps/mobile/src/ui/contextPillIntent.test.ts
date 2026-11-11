import { afterEach, describe, expect, test, vi } from "vitest";
import { ContextIslandController, type IslandTransport } from "./ContextIslandController";
import { islandReturnScope } from "./contextIslandModel";
import { registerIslandReturn, routeIslandIntent } from "./contextPillIntent";

const scope = "00000000-0000-4000-8000-000000000001";
const otherScope = "00000000-0000-4000-8000-000000000002";
const path = `lukapp-u01:///context-pill?scope=${scope}`;
const removers: (() => void)[] = [];
afterEach(() => { removers.splice(0).reverse().forEach(remove => remove()); });

function register(handler: (value: string) => boolean) {
  const remove = registerIslandReturn(handler);
  removers.push(remove);
  return remove;
}

describe("strict island return URL", () => {
  test.each([path, `/context-pill?scope=${scope}`])("accepts the exact return route %s", value => {
    expect(islandReturnScope(value)).toBe(scope);
  });
  test.each([
    `https:///context-pill?scope=${scope}`,
    `lukapp-u01://context-pill?scope=${scope}`,
    `lukapp-u01://host/context-pill?scope=${scope}`,
    `//host/context-pill?scope=${scope}`,
    `/context-pill/?scope=${scope}`,
    `/other/context-pill?scope=${scope}`,
    `/context-pill?scope=${scope}&scope=${scope}`,
    `/context-pill?scope=${scope}&extra=1`,
    `/context-pill?scope=${scope}#summary`,
    "/context-pill?scope=not-a-uuid",
    "/context-pill?scope=",
    "/context-pill",
    `/context-pill?Scope=${scope}`,
  ])("rejects %s", value => {
    expect(islandReturnScope(value)).toBeNull();
  });
});

describe("island intent admission and ownership", () => {
  test("a cold launch opens the normal root without dispatching an existing handler", () => {
    const handler = vi.fn(() => true);
    register(handler);
    expect(routeIslandIntent({ path, initial: true })).toBe("/");
    expect(handler).not.toHaveBeenCalled();
    expect(routeIslandIntent({ path, initial: false })).toBeNull();
    expect(handler.mock.calls).toEqual([[scope]]);
  });
  test("without a registered admitted host a return opens the normal root", () => {
    expect(routeIslandIntent({ path, initial: false })).toBe("/");
    register(() => true);
    expect(routeIslandIntent({ path, initial: false })).toBeNull();
  });
  test("only the current registration receives a return, and stale cleanup cannot unregister it", () => {
    const old = vi.fn(() => true);
    const current = vi.fn((value: string) => value === scope);
    const removeOld = register(old);
    const removeCurrent = register(current);
    removeOld();
    expect(routeIslandIntent({ path, initial: false })).toBeNull();
    expect(current.mock.calls).toEqual([[scope]]);
    expect(old).not.toHaveBeenCalled();
    removeCurrent();
    expect(routeIslandIntent({ path, initial: false })).toBe("/");
  });
  test("malformed island URLs go to root and ordinary routes pass through", () => {
    const handler = vi.fn(() => true);
    register(handler);
    expect(routeIslandIntent({ path: `${path}&extra=1`, initial: false })).toBe("/");
    expect(handler).not.toHaveBeenCalled();
    expect(routeIslandIntent({ path: "/budgets/food?tab=entries", initial: false })).toBe("/budgets/food?tab=entries");
  });
  test("the real controller refuses unadmitted, stale, and duplicate returns", async () => {
    const native: IslandTransport = {
      setAdmission: async () => {}, request: async () => ({ scope, state: "active", revision: 0 }),
      update: async () => {}, end: async () => {}, endAll: async () => {},
    };
    const controller = new ContextIslandController(native, () => scope);
    const send = vi.fn();
    const owner = { key: "food", cycle: 0, content: { kind: "entry", name: "Food", emoji: "🧾", currency: "COP", amountMinor: 1200 }, visibility: "visible", send } satisfies Parameters<typeof controller.bind>[0];
    register(value => controller.back(value, true));
    controller.bind(owner, false);
    expect(routeIslandIntent({ path, initial: false })).toBe("/");
    controller.bind(owner, true);
    controller.activate();
    await controller.settled();
    expect(routeIslandIntent({ path: `/context-pill?scope=${otherScope}`, initial: false })).toBe("/");
    expect(routeIslandIntent({ path, initial: false })).toBeNull();
    expect(send.mock.calls).toEqual([["back", true]]);
    expect(routeIslandIntent({ path, initial: false })).toBe("/");
    controller.dispose();
  });

  test("a replaced request's late rejection preserves the current scope's Back action", async () => {
    let rejectOld!: (reason: unknown) => void;
    const oldRequest = new Promise<unknown>((_resolve, reject) => { rejectOld = reject; });
    const native: IslandTransport = {
      setAdmission: async () => {},
      request: vi.fn().mockReturnValueOnce(oldRequest).mockResolvedValue({ scope: otherScope, state: "active", revision: 0 }),
      update: async () => {}, end: async () => {}, endAll: async () => {},
    };
    const controller = new ContextIslandController(native, vi.fn().mockReturnValueOnce(scope).mockReturnValue(otherScope));
    const scroll = vi.fn();
    const owner = { key: "food", cycle: 0, content: { kind: "entry", name: "Food", emoji: "🧾", currency: "COP", amountMinor: 1200 },
      visibility: "visible", send: (event: string, animated?: boolean) => { if (event === "back") scroll({ y: 64, animated }); },
    } satisfies Parameters<typeof controller.bind>[0];
    register(value => controller.back(value, true));
    try {
      controller.bind(owner, true);
      controller.activate();
      await vi.waitFor(() => { expect(native.request).toHaveBeenCalledTimes(1); });
      controller.bind({ ...owner, cycle: 1, visibility: "summary" }, true);
      await Promise.resolve();
      controller.bind({ ...owner, cycle: 1 }, true);
      controller.activate();
      expect(controller.getSnapshot()).toBe("requesting");
      rejectOld(new Error("old request refused late"));
      await controller.settled();
      expect(controller.getSnapshot()).toBe("active");
      expect(routeIslandIntent({ path, initial: false })).toBe("/");
      expect(routeIslandIntent({ path: `/context-pill?scope=${otherScope}`, initial: false })).toBeNull();
      expect(scroll.mock.calls).toEqual([[{ y: 64, animated: true }]]);
      expect(routeIslandIntent({ path: `/context-pill?scope=${otherScope}`, initial: false })).toBe("/");
    } finally {
      controller.dispose();
    }
  });
});
