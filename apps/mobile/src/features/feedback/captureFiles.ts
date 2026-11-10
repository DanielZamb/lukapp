import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import type { ScreenshotImage } from "./report";

export const captureMaxAgeMs = 24 * 60 * 60 * 1000;

export function captureDirectory() {
  return new Directory(Paths.cache, "lukapp-feedback");
}

function insideCaptureDirectory(uri: string) {
  const directory = captureDirectory().uri;
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return uri.startsWith(prefix) && !uri.slice(prefix.length).includes("/");
}

/** Deletes one capture. Anything outside the capture directory is never touched. */
export async function deleteCapture(uri: string) {
  if (!insideCaptureDirectory(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A capture that cannot be deleted now is removed by the next startup sweep.
  }
}

/** The capture's exact bytes and their SHA-256, or null when it is gone or outside the capture directory. */
export async function readCapture(uri: string): Promise<ScreenshotImage | null> {
  if (!insideCaptureDirectory(uri)) return null;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    const view = await file.bytes();
    const bytes = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return { bytes, sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") };
  } catch {
    return null;
  }
}

export async function sweepCaptures(keep: readonly string[], now: number) {
  try {
    const directory = captureDirectory();
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (!(entry instanceof File) || keep.includes(entry.uri)) continue;
      const modified = entry.modificationTime ?? 0;
      if (now - modified >= captureMaxAgeMs) entry.delete();
    }
  } catch {
    // Cleanup retries on the next start.
  }
}

/** Access ended on this phone: every capture goes with the rest of the local input. */
export async function deleteAllCaptures() {
  const directory = captureDirectory();
  if (directory.exists) directory.delete();
}
