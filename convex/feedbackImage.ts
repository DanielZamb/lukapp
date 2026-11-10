import { feedbackError } from "./feedbackErrors";

export function screenshotType(image: ArrayBuffer) {
  const bytes = new Uint8Array(image);
  if (bytes.length > 5 * 1024 * 1024 || bytes.length === 0)
    feedbackError({ code: "invalid_report", field: "screenshot" });
  if (validPng(bytes)) return "image/png";
  if (validJpeg(bytes)) return "image/jpeg";
  feedbackError({ code: "invalid_report", field: "screenshot" });
}

function validPng(bytes: Uint8Array) {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let imageData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset + length + 12 > bytes.length) return false;
    if (offset === 8 && (type !== "IHDR" || length !== 13 || view.getUint32(16) === 0 || view.getUint32(20) === 0)) return false;
    if (type === "IDAT" && length > 0) imageData = true;
    if (type === "IEND") return imageData && length === 0 && offset + 12 === bytes.length;
    offset += length + 12;
  }
  return false;
}

function validJpeg(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return false;
  let frame = false;
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 255) return false;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) return frame && offset + 2 < bytes.length - 2;
    if (marker === 217 || marker === 0 || marker === 216) return false;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8 || bytes[offset + 3] * 256 + bytes[offset + 4] === 0 || bytes[offset + 5] * 256 + bytes[offset + 6] === 0) return false;
      frame = true;
    }
    offset += length;
  }
  return false;
}
