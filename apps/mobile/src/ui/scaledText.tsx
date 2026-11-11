import type { ComponentPropsWithRef } from "react";
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type StyleProp, type TextStyle } from "react-native";
import { appScaledStyle } from "./nativeText";
import { useNativeTextMetrics } from "./themeContext";

/**
 * Props that draw a text style at the app's own text size when that is above the phone's. While the phone's setting is
 * the larger one this returns null and the platform scales the text as it always has.
 */
export function useAppTextSize() {
  const { fontScale, systemScale, nonlinearAndroid } = useNativeTextMetrics();
  const raised = fontScale > systemScale + 0.005;
  return (style: StyleProp<TextStyle>, cap?: number) => raised
    ? { allowFontScaling: false as const, maxFontSizeMultiplier: undefined, style: [style, appScaledStyle(StyleSheet.flatten(style) ?? {}, fontScale, nonlinearAndroid, cap)] }
    : null;
}

/** React Native's Text with its own style, drawn at the app's text size. For screens not yet on named text styles. */
export function RawText({ style, ...props }: ComponentPropsWithRef<typeof NativeText>) {
  const sized = useAppTextSize();
  const scaled = props.allowFontScaling === false ? null : sized(style, props.maxFontSizeMultiplier ?? undefined);
  return <NativeText {...props} style={style} {...scaled} />;
}

/** React Native's TextInput with its own style, drawn at the app's text size. */
export function RawTextInput({ style, ...props }: ComponentPropsWithRef<typeof NativeTextInput>) {
  const sized = useAppTextSize();
  const scaled = props.allowFontScaling === false ? null : sized(style, props.maxFontSizeMultiplier ?? undefined);
  return <NativeTextInput {...props} style={style} {...scaled} />;
}
