import { vi } from "vitest";

(globalThis as Record<string, unknown>).__DEV__ = true;

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  canUseBiometricAuthentication: vi.fn(() => false),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
}));

// Animation, gesture and worklet modules run native code; this stand-in lets any screen that reaches the shared UI load.
// A test that exercises motion declares its own mock, which replaces this one.
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return {
    KeyboardState: { UNKNOWN: 0 },
    default: { View: "animated-view", createAnimatedComponent: (component: unknown) => component },
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    useAnimatedStyle: (style: () => unknown) => style(),
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedReaction: () => {},
    useFrameCallback: () => ({ setActive: () => {} }),
    withTiming: (value: number) => value,
    cancelAnimation: () => {},
    interpolate: (value: number) => value,
    Easing: { linear: () => {}, bezier: () => {}, out: () => {}, cubic: () => {} },
    ReduceMotion: { Never: "never", System: "system" },
  };
});
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
vi.mock("react-native-gesture-handler", () => {
  const pan = () => {
    const gesture = { enabled: () => gesture, activeOffsetY: () => gesture, failOffsetX: () => gesture,
      onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture, onFinalize: () => gesture };
    return gesture;
  };
  return { Gesture: { Pan: pan }, GestureDetector: "gesture", GestureHandlerRootView: "gesture-root" };
});

// Native-only view modules the shared UI imports; tests render their host names.
vi.mock("expo-blur", () => ({ BlurView: "blur-view", BlurTargetView: "blur-target" }));
vi.mock("expo-glass-effect", () => ({ GlassView: "glass-view", isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false }));
