import { router } from "expo-router";
import { DevicesScreen } from "../src/features/devices/DevicesScreen";

export default function DevicesRoute() {
  return <DevicesScreen onBack={() => router.back()} />;
}
