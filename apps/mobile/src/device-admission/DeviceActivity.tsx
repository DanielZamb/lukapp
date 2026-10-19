import { useAction } from "convex/react";
import React, { useCallback, useEffect, useRef, type ReactNode } from "react";
import { View } from "react-native";
import { api } from "../features/api";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { LocalEntryInteraction, useLocalEntryInteraction } from "../local-auth/interaction";

export function DeviceActivity({ children }: { children: ReactNode }) {
  const recordActivity = useAction(api.deviceAccess.recordActivity);
  const report = useDeviceAccessFailure();
  const interaction = useLocalEntryInteraction();
  const lastAttempt = useRef<number | null>(null);
  const record = useCallback(() => {
    const now = Date.now();
    if (lastAttempt.current !== null && now >= lastAttempt.current && now - lastAttempt.current < 60_000) return;
    lastAttempt.current = now;
    void recordActivity({}).catch(report);
  }, [recordActivity, report]);
  useEffect(record, [record]);
  const onInteraction = useCallback(() => {
    interaction();
    record();
  }, [interaction, record]);
  return (
    <View style={{ flex: 1 }} onTouchStart={onInteraction} onTouchMove={onInteraction}>
      <LocalEntryInteraction.Provider value={onInteraction}>{children}</LocalEntryInteraction.Provider>
    </View>
  );
}
