import { Redirect, useLocalSearchParams } from "expo-router";
import { LevelUnlocked } from "../src/features/levelDoor/LevelUnlocked";
import { levelUnlockSchema } from "../src/features/levelDoor/model";
import { useLevelNavigation } from "../src/features/levelDoor/navigation";

export default function LevelUnlockedRoute() {
  const params = useLocalSearchParams();
  const navigation = useLevelNavigation();
  const unlock = levelUnlockSchema.safeParse(params);
  return unlock.success ? <LevelUnlocked unlock={unlock.data} onHome={navigation.home} /> : <Redirect href="/" />;
}
