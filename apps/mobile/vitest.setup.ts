import { vi } from "vitest";

(globalThis as Record<string, unknown>).__DEV__ = true;

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  canUseBiometricAuthentication: vi.fn(() => false),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
}));

vi.mock("react-native-reanimated", () => ({
  KeyboardState: { UNKNOWN: 0 },
  default: { View: "animated-view" },
  useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
  useAnimatedStyle: (style: () => unknown) => style(),
}));
