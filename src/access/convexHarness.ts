import { api } from "../../convex/_generated/api";
import type { TestConvexForDataModel } from "convex-test";
import type { DataModel, Id } from "../../convex/_generated/dataModel";
import { bytesToHex, requestHash } from "./protocol";
import type { AccessOperation, DevicePlatform } from "./protocol";

export type DeviceTest = TestConvexForDataModel<DataModel>;
export async function fixtureKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const publicKey = bytesToHex(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  return {
    publicKey,
    sign: async (message: string) => bytesToHex(new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(message)))),
  };
}
export type FixtureKey = Awaited<ReturnType<typeof fixtureKey>>;
export async function fixtureProof(t: DeviceTest, key: FixtureKey, operation: AccessOperation, args: unknown, deviceId?: Id<"mobileDevices">) {
  const challenge = await t.mutation(api.devices.prepare, {
    operation, payloadHash: await requestHash(args), ...(deviceId ? { deviceId } : { publicKey: key.publicKey }),
  });
  return { challengeId: challenge.challengeId, signature: await key.sign(challenge.message) };
}
export async function registerFixture(t: DeviceTest, key: FixtureKey, platform: DevicePlatform = "ios", name = "Fixture phone") {
  const args = { publicKey: key.publicKey, platform, name };
  return t.mutation(api.devices.register, { ...args, access: await fixtureProof(t, key, "devices.register", args) });
}
