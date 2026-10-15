import { expect, test } from "vitest";
import { createPrivateKey, generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { bindingExpiry, bytesToHex, canonicalJson, derSignatureToP1363, hexToBytes, lockRequired, requestHash } from "./protocol";

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

test("device lifetime deadlines are inclusive and maximum lifetime takes precedence", () => {
  const day = 86400_000;
  expect(bindingExpiry({ createdAt: 0, lastSeenAt: 0 }, 30 * day - 1)).toBe(null);
  expect(bindingExpiry({ createdAt: 0, lastSeenAt: 0 }, 30 * day)).toBe("session_inactive");
  expect(bindingExpiry({ createdAt: 0, lastSeenAt: 89 * day }, 90 * day - 1)).toBe(null);
  expect(bindingExpiry({ createdAt: 0, lastSeenAt: 89 * day }, 90 * day)).toBe("session_maximum_lifetime");
  expect(bindingExpiry({ createdAt: 0, lastSeenAt: 0 }, 90 * day)).toBe("session_maximum_lifetime");
});
test("request byte encoding is strict and canonical SHA-256 has a literal wire value", async () => {
  expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  expect([...hexToBytes("00010f10ff")]).toEqual([0, 1, 15, 16, 255]);
  for (const invalid of ["", "a", "FF", "0g", " 00", "00\n", "0x00"]) expect(() => hexToBytes(invalid)).toThrow("Invalid lowercase hex");
  expect(canonicalJson({ z: [1, null, true], a: "ñ", omitted: undefined })).toBe('["object",[["a",["string","ñ"]],["z",["array",[["number","1"],["null"],["boolean",true]]]]]]');
  expect(await requestHash({})).toBe("51d865c4d0211f7540b0b6bbd76c09de62cf66b70ec13707b1c783257bc4d927");
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
