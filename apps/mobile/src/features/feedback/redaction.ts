/** A black box in canvas fractions, so it survives the preview being laid out at any size. */
export type RedactionBox = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** Boxes smaller than this, in points, are accidental taps rather than drags. */
export const minimumBoxPoints = 12;

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

export function boxFromDrag(start: Point, end: Point, canvas: Size): RedactionBox | null {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  const left = clamp(Math.min(start.x, end.x), canvas.width);
  const right = clamp(Math.max(start.x, end.x), canvas.width);
  const top = clamp(Math.min(start.y, end.y), canvas.height);
  const bottom = clamp(Math.max(start.y, end.y), canvas.height);
  if (right - left < minimumBoxPoints || bottom - top < minimumBoxPoints) return null;
  return {
    x: left / canvas.width,
    y: top / canvas.height,
    width: (right - left) / canvas.width,
    height: (bottom - top) / canvas.height,
  };
}

/** Layout rectangle for a box; rounded outward so anti-aliasing never leaves a readable edge. */
export function boxRect(box: RedactionBox, canvas: Size) {
  const left = Math.floor(box.x * canvas.width);
  const top = Math.floor(box.y * canvas.height);
  const right = Math.ceil((box.x + box.width) * canvas.width);
  const bottom = Math.ceil((box.y + box.height) * canvas.height);
  return { left, top, width: right - left, height: bottom - top };
}
