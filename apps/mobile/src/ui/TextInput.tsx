import type { ComponentPropsWithRef, ComponentType } from "react";
import { StyleSheet, TextInput as NativeTextInput } from "react-native";
import { useNativeTextMetrics, useTier } from "./themeContext";
import { textPresetSpec, type TextPreset } from "./textPresets";
import { cappedNativeStyle } from "./nativeText";
import { useAppTextSize } from "./scaledText";

export function useTextPreset(preset: TextPreset, style?: ComponentPropsWithRef<typeof NativeTextInput>["style"]) {
  const tier = useTier();
  const metrics = useNativeTextMetrics();
  const sized = useAppTextSize();
  const { maxScale, ...base } = textPresetSpec(tier, preset);
  const nativeStyle = tier === "xxxl" && metrics.nonlinearAndroid
    ? cappedNativeStyle(StyleSheet.flatten([base, style]), metrics.fontScale, maxScale) : undefined;
  return { allowFontScaling: true, maxFontSizeMultiplier: maxScale, style: [base, style, nativeStyle], ...sized([base, style], maxScale) };
}

export type TextInputProps = ComponentPropsWithRef<typeof NativeTextInput> & {
  preset: TextPreset;
  InputComponent?: ComponentType<ComponentPropsWithRef<typeof NativeTextInput>>;
};

export function TextInput({ preset, InputComponent = NativeTextInput, style, ...props }: TextInputProps) {
  const typography = useTextPreset(preset, style);
  return <InputComponent {...props} {...typography} />;
}
