import { createElement, useEffect, useMemo } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { AccessController } from "./controller";
import { useSessionRpc } from "./use-session-rpc";
import { harness } from "./controller.test-support";

afterEach(() => vi.unstubAllGlobals());

it("keeps the native owner across SDK callback churn and wipes on actual Session loss", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const h = harness();
  const owners: AccessController[] = [];
  const clients: (() => Promise<ConvexHttpClient>)[] = [];
  const signOuts = [vi.fn(async () => {}), vi.fn(async () => {}), vi.fn(async () => {})];
  let current: ReturnType<typeof useSessionRpc> | undefined;
  function Lifecycle({ revision, session }: { revision: number; session: string | null }) {
    const createClient = async () => new ConvexHttpClient("https://unit.convex.cloud", { logger: false });
    clients.push(createClient);
    const ports = useSessionRpc(createClient, signOuts[revision] ?? h.signOut);
    current = ports;
    const controller = useMemo(() => new AccessController({ ...h.ports, signOut: ports.signOut }), [ports.rpc, ports.signOut]);
    owners.push(controller);
    useEffect(() => {
      void controller.start().then(() => controller.context(session, true));
      return () => controller.dispose();
    }, [controller]);
    useEffect(() => { if (controller.getSnapshot().kind !== "starting") controller.context(session, true); }, [controller, session]);
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(Lifecycle, { revision: 0, session: "unit-session" })); });
    const owner = owners[0];
    if (!owner || !current) throw new Error("Lifecycle did not mount");
    const firstPorts = current;
    await act(async () => { await owner.admit(); });
    const generation = h.native.state().generation;
    expect(owner.getSnapshot().kind).toBe("ready");
    await act(async () => { renderer?.update(createElement(Lifecycle, { revision: 1, session: "unit-session" })); });
    expect(clients[0]).not.toBe(clients[1]);
    expect(current).toBe(firstPorts);
    expect(owners.at(-1)).toBe(owner);
    expect(h.native.state().generation).toBe(generation);
    expect(owner.getSnapshot().kind).toBe("ready");
    await act(async () => { renderer?.update(createElement(Lifecycle, { revision: 2, session: null })); });
    expect(owners.at(-1)).toBe(owner);
    expect(h.native.beginWipe).toHaveBeenCalledOnce();
    expect(h.native.erase).toHaveBeenCalledOnce();
    expect(h.native.state()).toMatchObject({ keyPresent: false, workspaceId: null });
    expect(signOuts[2]).toHaveBeenCalledOnce();
    expect(signOuts[0]).not.toHaveBeenCalled();
    expect(owner.getSnapshot().kind).toBe("signed-out");
  } finally { await act(async () => { renderer?.unmount(); }); }
});

it("uses the latest SDK authorization callback for the same stable RPC", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const transport = vi.fn(async () => Response.json({ status: "success", value: { kind: "registered" }, logLines: [] }));
  vi.stubGlobal("fetch", transport);
  const first = vi.fn(async () => new ConvexHttpClient("https://unit.convex.cloud", { logger: false }));
  const latest = vi.fn(async () => new ConvexHttpClient("https://unit.convex.cloud", { logger: false }));
  let ports: ReturnType<typeof useSessionRpc> | undefined;
  function Probe({ callback }: { callback: typeof first }) { ports = useSessionRpc(callback, async () => {}); return null; }
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(Probe, { callback: first })); });
    if (!ports) throw new Error("RPC did not mount");
    const rpc = ports.rpc;
    await rpc.query(api.devices.status, {});
    await act(async () => { renderer?.update(createElement(Probe, { callback: latest })); });
    expect(ports.rpc).toBe(rpc);
    await rpc.query(api.devices.status, {});
    expect(first).toHaveBeenCalledOnce();
    expect(latest).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledTimes(2);
  } finally { await act(async () => { renderer?.unmount(); }); }
});
