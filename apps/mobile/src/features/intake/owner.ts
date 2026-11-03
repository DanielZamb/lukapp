import * as Crypto from "expo-crypto";

export function hashIntakeEnvelope(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}
export async function intakeOwnerScope(subject: string) {
  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `lukapp.notification-intake.owner.v1\u0000${subject.length}:${subject}`,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
