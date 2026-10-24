import { spacing, touchTarget, xxxl, xxxlFontScale } from "./tokens";

export type LayoutTier = "default" | "reflow" | "xxxl";

export function readableLayout({ width, fontScale }: { width: number; fontScale: number }) {
  const isXxxl = fontScale >= xxxlFontScale;
  const reflow = isXxxl || width / fontScale < 300;
  const tier: LayoutTier = isXxxl ? "xxxl" : reflow ? "reflow" : "default";
  return {
    tier,
    reflow,
    pagePadding: isXxxl ? xxxl.spacing.pagePadding : width < 360 ? spacing.lg : spacing.xxl,
    touchTarget: isXxxl ? xxxl.controls.touchTarget : touchTarget,
  };
}

export type ReadableLayout = ReturnType<typeof readableLayout>;
export const defaultLayout: ReadableLayout = { tier: "default", reflow: false, pagePadding: spacing.xxl, touchTarget };
