import { spacing } from "./tokens";

export function readableLayout({ width, fontScale }: { width: number; fontScale: number }) {
  return {
    reflow: width / fontScale < 300,
    pagePadding: width < 360 ? spacing.lg : spacing.xxl,
  };
}

export type ReadableLayout = ReturnType<typeof readableLayout>;
export const defaultLayout: ReadableLayout = { reflow: false, pagePadding: spacing.xxl };
