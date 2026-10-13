import { expect, test } from "vitest";
import { createPrivateKey, generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { canonicalJson, derSignatureToP1363, hexToBytes, lockRequired, requestHash } from "./protocol";

const ordinary = { coldLaunch: false, foregroundIdleMs: 0, backgroundMs: 0, screen: "ordinary" as const };
test("the lock contract has exact ordinary/background and Month Close deadlines", () => {
  expect(lockRequired({ ...ordinary, coldLaunch: true })).toBe(true);
  expect(lockRequired({ ...ordinary, screen: "security" })).toBe(true);
  expect(lockRequired({ ...ordinary, foregroundIdleMs: 119999 })).toBe(false);
  expect(lockRequired({ ...ordinary, foregroundIdleMs: 120000 })).toBe(true);
  expect(lockRequired({ ...ordinary, backgroundMs: 120000 })).toBe(true);
  expect(lockRequired({ ...ordinary, screen: "month-close", foregroundIdleMs: 599999 })).toBe(false);
  expect(lockRequired({ ...ordinary, screen: "month-close", foregroundIdleMs: 600000 })).toBe(true);
  expect(lockRequired({ ...ordinary, screen: "month-close", backgroundMs: 120000 })).toBe(true);
});
test("canonical request hashing matches reordered/transport-stripped args and distinguishes Convex numeric inputs", async () => {
  expect(await requestHash({ a: 1, b: { c: "ñ" }, d: undefined })).toBe(await requestHash({ b: { c: "ñ" }, a: 1 }));
  expect(new Set([NaN, Infinity, -Infinity, 0, -0, "NaN", { $number: "NaN" }].map(canonicalJson)).size).toBe(7);
  expect(() => canonicalJson(undefined)).toThrow();
});
test("native DER P-256 signatures convert to the WebCrypto wire format and verify the actual message", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "der" } });
  const message = "lukapp-native-bridge-fixture";
  const der = sign("sha256", Buffer.from(message), createPrivateKey(pair.privateKey));
  const converted = derSignatureToP1363(der.toString("hex"));
  const key = await webcrypto.subtle.importKey("spki", pair.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  expect(converted).toHaveLength(128);
  expect(await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, hexToBytes(converted), new TextEncoder().encode(message))).toBe(true);
  expect(() => derSignatureToP1363("3006020180020101")).toThrow();
  expect(() => derSignatureToP1363("300702020001020101")).toThrow();
  expect(() => derSignatureToP1363(der.toString("hex") + "00")).toThrow();
});
