import { afterEach, expect, it, vi } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { requestScopedRpc } from "./request-scoped-rpc";

afterEach(() => vi.unstubAllGlobals());

it("reads fresh HTTP responses for identical query facts without retaining a query cache", async () => {
  const first = { kind: "denied", code: "device_registration_required", directive: "register-device" };
  const second = { kind: "denied", code: "device_revoked", directive: "wipe-local-input-and-sign-out" };
  const transport = vi.fn()
    .mockResolvedValueOnce(Response.json({ status: "success", value: first, logLines: [] }))
    .mockResolvedValueOnce(Response.json({ status: "success", value: second, logLines: [] }));
  vi.stubGlobal("fetch", transport);
  const rpc = requestScopedRpc(async () => new ConvexHttpClient("http://127.0.0.1:8094", { skipConvexDeploymentUrlCheck: true, logger: false }));
  expect(await rpc.query(api.devices.status, {})).toEqual(first);
  expect(await rpc.query(api.devices.status, {})).toEqual(second);
  expect(transport).toHaveBeenCalledTimes(2);
});

it("does not dispatch after delayed provider authorization races a custody invalidation", async () => {
  const transport = vi.fn(); vi.stubGlobal("fetch", transport);
  let release!: (client: ConvexHttpClient) => void;
  const authorization = new Promise<ConvexHttpClient>(resolve => { release = resolve; });
  const rpc = requestScopedRpc(() => authorization);
  let admitted = true;
  const operation = rpc.action(api.clerkProvider.checkSession, {}, () => { if (!admitted) throw new Error("custody invalidated"); });
  admitted = false;
  release(new ConvexHttpClient("http://127.0.0.1:8094", { skipConvexDeploymentUrlCheck: true, logger: false }));
  await expect(operation).rejects.toThrow("custody invalidated");
  expect(transport).not.toHaveBeenCalled();
});
