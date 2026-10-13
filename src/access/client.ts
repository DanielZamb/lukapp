import { api } from "../../convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { canonicalJson } from "./protocol";
import type { AccessOperation, NativeDeviceKey } from "./protocol";

export const deviceFunctions = api.devices;
export const financialFunctions = api.accounting;
export type PrepareRequest = FunctionArgs<typeof api.devices.prepare>;
export type PreparedRequest = FunctionReturnType<typeof api.devices.prepare>;
export type RegisterDevice = FunctionArgs<typeof api.devices.register>;
export type RegisteredDevice = FunctionReturnType<typeof api.devices.register>;
export type DeviceStatus = FunctionReturnType<typeof api.devices.status>;
export type FinancialArgs<Name extends keyof typeof api.accounting> = Omit<FunctionArgs<typeof api.accounting[Name]>, "access">;
export type FinancialResult<Name extends keyof typeof api.accounting> = FunctionReturnType<typeof api.accounting[Name]>;

export interface NativeRequestHash {
  sha256Utf8(message: string): Promise<string>;
}
export interface DeviceChallengeTransport {
  prepare(args: PrepareRequest): Promise<PreparedRequest>;
}
export async function proveDeviceRequest<Request extends object>(input: {
  transport: DeviceChallengeTransport;
  hash: NativeRequestHash;
  key: Pick<NativeDeviceKey, "publicKey" | "sign">;
  deviceId?: Id<"mobileDevices">;
  operation: AccessOperation;
  request: Request;
}) {
  const payloadHash = await input.hash.sha256Utf8(canonicalJson(input.request));
  const challenge = await input.transport.prepare({
    operation: input.operation, payloadHash,
    ...(input.deviceId ? { deviceId: input.deviceId } : { publicKey: await input.key.publicKey() }),
  });
  return { ...input.request, access: { challengeId: challenge.challengeId, signature: await input.key.sign(challenge.message) } };
}
