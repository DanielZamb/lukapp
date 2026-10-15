import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { CleanupRetry } from "./CleanupRetry";
import { begin, harness } from "./controller.test-support";
vi.mock("../ui", () => ({ PrimaryButton: "button" }));
afterEach(() => vi.unstubAllGlobals());

it("offers explicit cleanup retry and completes cleanup when pressed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const h = harness(); await begin(h); await h.controller.admit();
  vi.mocked(h.native.beginWipe).mockRejectedValueOnce(new Error("marker unavailable")); await h.controller.wipe();
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(CleanupRetry, { controller: h.controller, pending: false })); });
    const button = renderer!.root.findByType("button");
    expect(button.props.label).toBe("Retry local cleanup"); expect(button.props.loading).toBe(false);
    expect(h.controller.getCleanupRequired()).toBe(true);
    await act(async () => { button.props.onPress(); });
    expect(h.controller.getCleanupRequired()).toBe(false);
    expect(h.controller.getSnapshot()).toEqual({ kind: "signed-out" });
    expect(h.native.state()).toMatchObject({ keyPresent: false, workspaceId: null, wipePending: false });
    expect(h.signOut).toHaveBeenCalledOnce();
    await act(async () => { renderer!.update(createElement(CleanupRetry, { controller: h.controller, pending: true })); });
    expect(renderer!.root.findByType("button").props.loading).toBe(true);
  } finally { await act(async () => { renderer?.unmount(); }); }
});
