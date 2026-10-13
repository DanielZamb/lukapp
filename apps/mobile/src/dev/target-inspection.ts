import { useSyncExternalStore } from "react";
import type { LayoutChangeEvent } from "react-native";
import { touchTarget } from "../theme/tokens";

type TargetMeasurement = {
  label: string;
  width: number;
  height: number;
  passes: boolean;
};
let snapshot: readonly TargetMeasurement[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => snapshot;
export function inspectTarget(component: string, label: string) {
  return (event: LayoutChangeEvent) => {
    if (!__DEV__) return;
    const { width, height } = event.nativeEvent.layout;
    const key = `${component}: ${label}`;
    const previous = snapshot.find((item) => item.label === key);
    if (previous?.width === width && previous.height === height) return;
    snapshot = [
      ...snapshot.filter((item) => item.label !== key),
      {
        label: key,
        width,
        height,
        passes: width >= touchTarget && height >= touchTarget,
      },
    ];
    for (const listener of listeners) listener();
  };
}
export function useTargetMeasurements() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
