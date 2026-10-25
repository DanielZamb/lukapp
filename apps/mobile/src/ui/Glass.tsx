import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type PropsWithChildren, type RefObject } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, View, type ViewProps } from "react-native";
import { glassMaterial, type GlassMaterial } from "./contextPillModel";

export function usePillAccessibility() {
  const [motion, setMotion] = useState(true);
  const [transparency, setTransparency] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let motionChanged = false;
    let transparencyChanged = false;
    let readerChanged = false;
    const subscriptions = [
      AccessibilityInfo.addEventListener("reduceMotionChanged", value => { motionChanged = true; setMotion(value); }),
      AccessibilityInfo.addEventListener("reduceTransparencyChanged", value => { transparencyChanged = true; setTransparency(value); }),
      AccessibilityInfo.addEventListener("screenReaderChanged", value => { readerChanged = true; setScreenReader(value); }),
    ];
    void Promise.allSettled([
      AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !motionChanged) setMotion(value); }),
      AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active && !transparencyChanged) setTransparency(value); }),
      AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active && !readerChanged) setScreenReader(value); }),
    ]).then(() => { if (active) setReady(true); });
    return () => { active = false; subscriptions.forEach(subscription => subscription.remove()); };
  }, []);
  return { reduceMotion: motion, reduceTransparency: transparency, screenReader, ready };
}

export type GlassProps = PropsWithChildren<Animated.AnimatedProps<ViewProps> & {
  material?: GlassMaterial;
  darkContent?: boolean;
  darkTintOpacity?: 0.74 | 0.9;
  reduceTransparency: boolean;
  blurTarget: RefObject<View | null>;
}>;

export function Glass({ children, material = "regular", darkContent = false, darkTintOpacity = 0.74, reduceTransparency, blurTarget, style, ...props }: GlassProps) {
  const selected = glassMaterial({ requested: material, darkContent, reduceTransparency });
  const dark = darkContent;
  const solid = dark ? "#141018" : "#f3eff8";
  const tint = dark ? `rgba(12,8,18,${selected === "clear" ? 0.46 : darkTintOpacity})` : "rgba(255,255,255,0.56)";
  const liquid = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  return <Animated.View {...props} style={[styles.depth, style]}>
    <Animated.View style={[styles.clip, style]}>
      {selected === "solid" ? <View style={[StyleSheet.absoluteFill, { backgroundColor: solid }]} />
        : liquid ? <GlassView pointerEvents="none" style={StyleSheet.absoluteFill} glassEffectStyle={selected}
          colorScheme={dark ? "dark" : "light"} tintColor={dark ? undefined : tint} />
          : <BlurView pointerEvents="none" style={StyleSheet.absoluteFill} blurTarget={blurTarget}
            blurMethod="dimezisBlurView" intensity={25} tint={dark ? "dark" : "regular"} />}
      {selected !== "solid" && (!liquid || dark) && <View pointerEvents="none" style={[StyleSheet.absoluteFill,
        { backgroundColor: tint, borderWidth: 1.3, borderColor: dark ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)" }]} />}
      {children}
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  depth: { boxShadow: "0 12px 30px rgba(14,6,30,0.26), 0 2px 6px rgba(14,6,30,0.14)" },
  clip: { overflow: "hidden" },
});
