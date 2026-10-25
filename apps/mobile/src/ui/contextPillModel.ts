import type { CameraCutout, CutoutRect } from "../device/cameraCutout";
import type { LayoutTier } from "./layout";
import { formatMoney } from "../features/money";

type PillIdentity = { name: string; emoji: string; currency: string };
export type ContextPillContent = PillIdentity & (
  | { kind: "budget"; limitMinor: number; spentMinor: number }
  | { kind: "entry"; amountMinor: number }
);

export type PillVisibility = "summary" | "visible" | "dismissed" | "returning";
export type PillEvent = "summarySeen" | "summaryGone" | "swipeUp" | "back";

export function pillVisibility(state: PillVisibility, event: PillEvent): PillVisibility {
  if (event === "summarySeen") return "summary";
  if (event === "summaryGone") return state === "summary" ? "visible" : state;
  if (event === "back") return state === "visible" ? "returning" : state;
  return state === "visible" ? "dismissed" : state;
}

export function summaryIsVisible(summary: { y: number; height: number } | null, scrollY: number) {
  return summary === null || scrollY < summary.y + summary.height + 8;
}

export function pillEnabled(tier: LayoutTier, active: boolean) {
  return tier === "xxxl" && active;
}

export type PillPlacement = { kind: "peekDock" } | {
  kind: "island"; top: number; height: number; cutout: CutoutRect;
};

export function pillPlacement(cutout: CameraCutout): PillPlacement {
  if (cutout.kind === "none" || cutout.rect.height + 3 > 44) return { kind: "peekDock" };
  return { kind: "island", top: Math.max(0, cutout.rect.y - 3),
    height: 44, cutout: cutout.rect };
}

export function dockDelay(reduceMotion: boolean) { return reduceMotion ? 1200 : 3000; }

export type GlassMaterial = "regular" | "clear" | "solid";
export function glassMaterial(input: { requested: GlassMaterial; reduceTransparency: boolean; darkContent: boolean }): GlassMaterial {
  if (input.reduceTransparency || input.requested === "solid") return "solid";
  return input.requested === "clear" && input.darkContent ? "clear" : "regular";
}

export function dockShowsSuffix(input: { textWidth: number; availableWidth: number }) {
  return input.textWidth <= input.availableWidth;
}

export function islandAmountFits(input: { measuredWidth: number; fontScale: number; windowWidth: number; cutout: CutoutRect }) {
  const minimumScale = Math.min(1, 18 / (14.67 * Math.min(input.fontScale, 1.5)));
  const available = input.windowWidth - 24 - input.cutout.x - input.cutout.width;
  return input.measuredWidth * minimumScale <= available;
}

export function pillCopy(content: ContextPillContent) {
  const money = (minor: number) => formatMoney({ currency: content.currency, minorUnits: minor }, { hideZeroDecimals: true });
  if (content.kind === "entry") {
    const amount = money(content.amountMinor);
    return { amount, line: amount, label: `Back to summary, ${content.name}, ${amount}`,
      tone: "default", figures: [{ label: "Amount", value: amount }], progress: null, limit: null };
  }
  const left = content.limitMinor - content.spentMinor;
  const suffix = left < 0 ? "over" : "left";
  const amount = money(Math.abs(left));
  return { amount, line: `${amount} ${suffix}`, label: `Back to summary, ${content.name}, ${amount} ${suffix}`,
    tone: left < 0 ? "warning" : "positive",
    figures: [{ label: left < 0 ? "Over the limit" : "Left to spend", value: amount },
      { label: `Spent of ${money(content.limitMinor)}`, value: money(content.spentMinor) }],
    progress: content.limitMinor > 0 ? Math.min(1, Math.max(0, content.spentMinor / content.limitMinor)) : 0,
    limit: `of ${money(content.limitMinor)}` };
}
