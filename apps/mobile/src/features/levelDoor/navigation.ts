import { useNavigation } from "expo-router";
import type { LevelUnlock } from "./model";

export function useLevelNavigation() {
  const navigation = useNavigation();
  return {
    showUnlocked: (unlock: LevelUnlock) => navigation.dispatch({
      type: "RESET", payload: { index: 0, routes: [{ name: "level-unlocked", params: unlock }] },
    }),
    home: () => navigation.dispatch({ type: "RESET", payload: { index: 0, routes: [{ name: "index" }] } }),
  };
}
