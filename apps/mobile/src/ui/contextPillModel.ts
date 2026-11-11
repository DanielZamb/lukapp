import { activeTranslator, type Translator } from "../i18n";
import type { CameraCutout, CutoutRect } from "../device/cameraCutout";
import type { LayoutTier } from "./layout";
import { formatMoney } from "../features/money";
import { themes } from "./tokens";

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
  kind: "island"; top: number; height: number; centerX: number; centerY: number; cutout: CutoutRect;
};

export function pillPlacement(cutout: CameraCutout, windowWidth: number): PillPlacement {
  if (cutout.kind === "none" || cutout.rect.height + 3 > 44) return { kind: "peekDock" };
  const rect = cutout.rect;
  const centerX = rect.x + rect.width / 2;
  if (cutout.kind === "island") return { kind: "island", top: Math.max(0, rect.y - 3), height: 44, centerX, centerY: rect.y + rect.height / 2, cutout: rect };
  const halfWidth = (windowWidth - 16) / 2;
  if (centerX - halfWidth < 0 || centerX + halfWidth > windowWidth) return { kind: "peekDock" };
  const diameter = Math.min(rect.width, rect.height);
  const centerY = rect.y + rect.height - diameter / 2;
  const height = diameter + 4;
  const top = centerY - height / 2;
  if (height < 24 || height > 44 || top < 0) return { kind: "peekDock" };
  return { kind: "island", top, height, centerX, centerY, cutout: rect };
}

type PillAppearanceInput = { appTheme: "light" | "dark"; reduceTransparency: boolean } & (
  | { form: "island"; platform: "android" | "ios"; expanded: boolean }
  | { form: "peekDock" }
);
export function pillAppearance(input: PillAppearanceInput) {
  const dark = input.appTheme === "light";
  const brand = themes[dark ? "dark" : "light"];
  const accent = dark ? brand.primaryText : brand.primary;
  return {
    material: input.reduceTransparency || (input.form === "island" && input.platform === "android") ? "solid" : "regular",
    dark, background: dark ? "#000000" : "#ffffff",
    ink: dark ? "#ffffff" : "#141118", muted: dark ? "#d4d4d8" : "#3f3748",
    positive: dark ? "#4ade80" : "#064e3b", danger: dark ? "#fca5a5" : "#7f1d1d",
    accents: { ink: accent, tint: `${accent}24`, buttonFill: brand.primary, buttonInk: brand.primaryForeground,
      chevronBacking: dark ? "transparent" : brand.primaryForeground },
    tintOpacity: dark && input.form === "island" && input.expanded ? 0.9 : 0.74,
  } satisfies { material: "solid" | "regular"; dark: boolean; background: string; ink: string; muted: string;
    positive: string; danger: string; accents: { ink: string; tint: string; buttonFill: string; buttonInk: string; chevronBacking: string }; tintOpacity: 0.74 | 0.9 };
}

export function compactTypography(input: { height: number; fontScale: number; android: boolean }): { kind: "fallback" } | { kind: "fits"; multiplierCap: number; minimumScale: number; tileSize: number } {
  const multiplierCap = Math.min(1.5, input.android ? (input.height - 4) / 18.33 : 1.5);
  const minimumSize = input.android ? 16 : 18;
  const actualSize = 14.67 * Math.min(input.fontScale, multiplierCap);
  if (multiplierCap < 1 || actualSize < minimumSize) return { kind: "fallback" };
  return { kind: "fits", multiplierCap, minimumScale: minimumSize / actualSize,
    tileSize: input.android ? input.height - 4 : 32 };
}

export function pillHideReason(state: PillVisibility): "scroll" | "back" | "swipe" {
  return state === "returning" ? "back" : state === "dismissed" ? "swipe" : "scroll";
}
export function pillPresenceTransition(input: { current: number; visible: boolean; reason: ReturnType<typeof pillHideReason>; reduceMotion: boolean }) {
  "worklet";
  const target = input.visible ? 1 : 0;
  return { target, duration: !input.visible && input.reason === "back" ? 0
    : (input.reduceMotion ? 120 : 180) * Math.abs(target - input.current) };
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

export function islandAmountFits(input: { measuredWidth: number; fontScale: number; windowWidth: number; cutout: CutoutRect; height: number; android: boolean }) {
  const typography = compactTypography(input);
  const available = (input.windowWidth - 32 - input.cutout.width - 12) / 2;
  return typography.kind === "fits" && input.measuredWidth * typography.minimumScale <= available;
}

export function pillCopy(content: ContextPillContent, t: Translator["t"] = activeTranslator().t) {
  const money = (minor: number) => formatMoney({ currency: content.currency, minorUnits: minor }, { hideZeroDecimals: true });
  if (content.kind === "entry") {
    const amount = money(content.amountMinor);
    return { amount, line: amount, label: t("common.pillBackLabel", { name: content.name, detail: amount }),
      tone: "default", figures: [{ label: t("common.pillAmount"), value: amount }], progress: null, limit: null };
  }
  const left = content.limitMinor - content.spentMinor;
  const amount = money(Math.abs(left));
  const line = t(left < 0 ? "budget.jarOver" : "budget.jarLeft", { amount });
  return { amount, line, label: t("common.pillBackLabel", { name: content.name, detail: line }),
    tone: left < 0 ? "warning" : "positive",
    figures: [{ label: left < 0 ? t("common.pillOverLimit") : t("common.pillLeftToSpend"), value: amount },
      { label: t("common.pillSpentOf", { limit: money(content.limitMinor) }), value: money(content.spentMinor) }],
    progress: content.limitMinor > 0 ? Math.min(1, Math.max(0, content.spentMinor / content.limitMinor)) : 0,
    limit: t("common.pillOfLimit", { limit: money(content.limitMinor) }) };
}
