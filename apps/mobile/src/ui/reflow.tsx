import type { ComponentProps, ReactNode } from "react";
import { View, type ViewStyle, type TextStyle } from "react-native";
import { useTier } from "./themeContext";

export function Presentation({ legacy, reflow = legacy, children }: { legacy: ReactNode; reflow?: ReactNode; children?: ReactNode }) {
  const tier = useTier();
  return tier === "xxxl" ? children : tier === "reflow" ? reflow : legacy;
}

export function useReflowStyles() {
  const reflow = useTier() !== "default";
  return {
    row: (align?: ViewStyle["alignItems"], reflowAlign?: ViewStyle["alignItems"]): ViewStyle => ({
      flexDirection: reflow ? "column" : "row",
      ...((reflow ? reflowAlign : align) !== undefined && { alignItems: reflow ? reflowAlign : align }),
    }),
    flex: (normal: number, stacked: number): ViewStyle => ({ flex: reflow ? stacked : normal }),
    trail: (normal: ViewStyle["maxWidth"] = "45%", stacked: ViewStyle["maxWidth"] = "100%"): ViewStyle => ({
      maxWidth: reflow ? stacked : normal, alignItems: reflow ? "flex-start" : "flex-end",
    }),
    text: { numberOfLines: reflow ? undefined : 1, textAlign: reflow ? "left" : "right" } satisfies { numberOfLines: number | undefined; textAlign: TextStyle["textAlign"] },
    bar: { maxWidth: reflow ? "45%" : 80 } satisfies TextStyle,
  };
}

export function ReflowRow({ align, reflowAlign, gap, style, ...props }: ComponentProps<typeof View> & {
  align?: ViewStyle["alignItems"]; reflowAlign?: ViewStyle["alignItems"]; gap?: number;
}) {
  const flow = useReflowStyles();
  return <View {...props} style={[style, flow.row(align, reflowAlign), ...(gap !== undefined ? [{ gap }] : [])]} />;
}

export function ReflowItem({ flex, reflowFlex = flex, maxWidth, reflowMaxWidth = maxWidth, align, reflowAlign = align, style, ...props }: ComponentProps<typeof View> & {
  flex?: number; reflowFlex?: number; maxWidth?: ViewStyle["maxWidth"]; reflowMaxWidth?: ViewStyle["maxWidth"]; align?: ViewStyle["alignItems"]; reflowAlign?: ViewStyle["alignItems"];
}) {
  const reflow = useTier() !== "default";
  return <View {...props} style={[style, {
    ...(flex !== undefined && { flex: reflow ? reflowFlex : flex }),
    ...(maxWidth !== undefined && { maxWidth: reflow ? reflowMaxWidth : maxWidth }),
    ...(align !== undefined && { alignItems: reflow ? reflowAlign : align }),
  }]} />;
}

export type TextReflow = "unclamp" | "trail" | "copy" | "bar";
export function useTextReflow(mode?: TextReflow) {
  const flow = useReflowStyles();
  return {
    ...(mode === "unclamp" || mode === "trail" ? { numberOfLines: flow.text.numberOfLines } : {}),
    style: mode === "trail" ? { maxWidth: flow.trail().maxWidth, textAlign: flow.text.textAlign }
      : mode === "copy" ? flow.flex(1, 0) : mode === "bar" ? { ...flow.bar, textAlign: "right" as const } : undefined,
  };
}
