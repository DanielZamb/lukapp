// PROTOTYPE: native route wrapper for one Notification Intake layout.

import { Stack, useLocalSearchParams } from "expo-router";
import {
  normalizeIntakeVariant,
  NotificationIntakePrototype,
} from "../../components/notification-intake-prototype";

export default function NotificationIntakeRoute() {
  const { variant } = useLocalSearchParams<{ variant?: string }>();
  const current = normalizeIntakeVariant(variant);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Intake ${current}`,
          headerBackTitle: "Prototypes",
        }}
      />
      <NotificationIntakePrototype variant={current} />
    </>
  );
}
