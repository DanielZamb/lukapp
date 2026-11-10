import { File } from "expo-file-system";
import type { RefObject } from "react";
import { PixelRatio, type View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { captureDirectory } from "./captureFiles";
import type { Screenshot } from "./report";

/** Bytes per pixel below which a PNG is a single flat color: a blank render, not a screen. */
const blankBytesPerPixel = 0.006;

export function looksBlank(base64: string, pixels: number) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  return pixels <= 0 || bytes < pixels * blankBytesPerPixel;
}

/**
 * Renders an app view into a PNG inside the app's private cache. The render
 * draws the React view tree in process (Android `View.draw` on a bitmap,
 * iOS `drawViewHierarchyInRect`), so it never asks the OS to screenshot the
 * window, and the base64 result keeps the image off external storage.
 * Returns null when the render fails, when `allowed` no longer holds once it
 * finishes, or, for a screen capture, when it comes back blank.
 */
export async function snapshotView(
  view: RefObject<View | null>,
  size: { width: number; height: number },
  name: string,
  { rejectBlank = true, allowed = () => true }: { rejectBlank?: boolean; allowed?: () => boolean } = {},
): Promise<Screenshot | null> {
  if (!view.current || size.width <= 0 || size.height <= 0) return null;
  try {
    const base64 = await captureRef(view, { format: "png", result: "base64" });
    if (!allowed()) return null;
    const scale = PixelRatio.get();
    if (rejectBlank && looksBlank(base64, size.width * scale * size.height * scale)) return null;
    const directory = captureDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, `${name}.png`);
    file.create({ overwrite: true });
    file.write(base64, { encoding: "base64" });
    return { uri: file.uri, width: size.width, height: size.height, redacted: false };
  } catch {
    return null;
  }
}
