import { useTier } from "./themeContext";

export function useNativeStackHeaderOptions<T extends { headerShown?: boolean }>(legacy: T) {
  const tier = useTier();
  return tier === "xxxl" ? { ...legacy, headerShown: false } : legacy;
}

export function useNativeStackHeaderConfig<T extends { hidden?: boolean }>(legacy: T) {
  const tier = useTier();
  return tier === "xxxl" ? { ...legacy, hidden: true } : legacy;
}
