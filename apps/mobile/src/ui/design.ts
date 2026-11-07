import type { TextTone } from "./typography";
import type { ThemeMode } from "./tokens";

export type DesignColor = string | { light: string; dark: string };
export function resolveColor(color: DesignColor, mode: ThemeMode) {
  return typeof color === "string" ? color : color[mode];
}
export function alpha(color: string, opacity: number) {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
}
export function moneyTone(minorUnits: number, over = false): TextTone {
  return over ? "danger" : minorUnits > 0 ? "positive" : "default";
}
export function heroFit({ available, measured, target, floor }: {
  available: number; measured: number; target: number; floor: number;
}) {
  const fit = measured > available ? Math.floor(target * available / measured * 4) / 4 : target;
  const size = Math.max(floor, fit);
  return { size, wrap: measured * size / target > available + 0.25 };
}
export function amountGroups(amount: string, separator: string) {
  if (!separator) return [amount];
  const parts = amount.split(separator);
  return parts.map((part, index) => `${part}${index < parts.length - 1 ? separator : ""}`);
}

export function composeHandlers<E>(first?: (event: E) => void, second?: (event: E) => void) {
  return first && second && first !== second ? (event: E) => { first(event); second(event); } : first ?? second;
}
export function mix(color: string, background: string, fraction: number) {
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * fraction + parseInt(background.slice(offset, offset + 2), 16) * (1 - fraction)).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}
