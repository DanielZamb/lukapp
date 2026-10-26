import type { ComponentPropsWithRef, ComponentType } from "react";
import { StyleSheet, TextInput as NativeTextInput } from "react-native";
import { useNativeTextMetrics, useTier } from "./themeContext";
import { textPresetSpec, type TextPreset } from "./textPresets";
import { cappedNativeStyle } from "./nativeText";

export function useTextPreset(preset: TextPreset) {
  const tier = useTier();
  const metrics = useNativeTextMetrics();
  const { maxScale, ...style } = textPresetSpec(tier, preset);
  return { ...style, ...(tier === "xxxl" && metrics.nonlinearAndroid ? cappedNativeStyle(style, metrics.fontScale, maxScale) : {}) };
}

export type TextInputProps = ComponentPropsWithRef<typeof NativeTextInput> & {
  preset: TextPreset;
  InputComponent?: ComponentType<ComponentPropsWithRef<typeof NativeTextInput>>;
};

export function TextInput({ preset, InputComponent = NativeTextInput, style, ...props }: TextInputProps) {
  const tier = useTier();
  const metrics = useNativeTextMetrics();
  const { maxScale, ...base } = textPresetSpec(tier, preset);
  const nativeStyle = tier === "xxxl" && metrics.nonlinearAndroid
    ? cappedNativeStyle(StyleSheet.flatten([base, style]), metrics.fontScale, maxScale) : undefined;
  return <InputComponent {...props} allowFontScaling maxFontSizeMultiplier={maxScale} style={[base, style, nativeStyle]} />;
}
