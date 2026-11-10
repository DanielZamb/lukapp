import { useAuth } from "@clerk/expo";
import { useConvex } from "convex/react";
import * as Crypto from "expo-crypto";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { notificationIntake } from "../../../modules/notification-intake";
import { LocalInput } from "../../local-auth/localInput";
import { requiresLocalWipe, useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { api } from "../api";
import { clearDiscardNotices } from "../localDiscardNotices";
import { IntakeAdmission, IntakeDeviceAdmission } from "./admission";
import { clearIntakeCandidates, readIntakeRaw } from "./candidates";
import { secureWipeStore } from "./control";
import { hashIntakeEnvelope, intakeOwnerScope } from "./owner";
import { registerIntake } from "./registry";
import { IntakeService } from "./service";

export const IntakeContext = createContext<IntakeService | null>(null);
export function useIntakeService() {
  const service = useContext(IntakeContext);
  if (!service) throw new Error("Notification intake requires an unlocked admitted device");
  return service;
}
export function useIntakeSnapshot() {
  const service = useIntakeService();
  return useSyncExternalStore(service.subscribe, service.getSnapshot);
}
export function IntakeProvider({ children }: { children: ReactNode }) {
  const lease = useContext(LocalInput);
  const admitted = useContext(IntakeAdmission);
  const deviceAdmitted = useContext(IntakeDeviceAdmission);
  const { userId } = useAuth();
  const convex = useConvex();
  const report = useDeviceAccessFailure();
  const [instance, setInstance] = useState(0);
  const current = useRef({ lease, userId, admitted, deviceAdmitted });
  current.current = { lease, userId, admitted, deviceAdmitted };
  const service = useMemo(() => {
    if (!lease || !userId || lease.subject !== userId || !admitted() || !deviceAdmitted()) return null;
    const isCurrent = () => current.current.lease === lease && current.current.userId === userId && current.current.admitted() && current.current.deviceAdmitted();
    return new IntakeService({
      native: notificationIntake, lease, subject: userId, now: Date.now,
      hash: hashIntakeEnvelope, ownerScope: () => intakeOwnerScope(userId), newMutationId: Crypto.randomUUID,
      isCurrent, onWiped: () => setInstance((value) => value + 1),
      readLegacy: () => readIntakeRaw(userId), deleteLegacy: () => clearIntakeCandidates(userId),
      deleteNotices: () => clearDiscardNotices(userId), wipeStore: secureWipeStore(userId),
      validateMapping: async (mapping) => {
        try {
          const workspace = await convex.query(api.accounting.openWorkspace, { workspaceId: mapping.workspaceId });
          if (!isCurrent()) throw new Error("Intake admission ended");
          if (workspace.functionalCurrency !== mapping.currency ||
              (workspace.functionalCurrency !== "COP" && workspace.functionalCurrency !== "USD")) return null;
          const profiles = await convex.query(api.accounting.listFinancialAccountProfiles, { workspaceId: mapping.workspaceId });
          if (!isCurrent()) throw new Error("Intake admission ended");
          return profiles.some((p) => p.id === mapping.financialAccountProfileId && p.workspaceId === mapping.workspaceId)
            ? { timeZone: workspace.timeZone } : null;
        } catch (error) {
          if (requiresLocalWipe(error)) report(error);
          throw error;
        }
      },
    });
  }, [lease, userId, convex, instance, report]);
  useLayoutEffect(() => {
    if (!service || !lease) return;
    const unregister = registerIntake(lease.subject, service);
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { void service.refresh().catch((error: unknown) => { report(error); }); };
    const armExpiry = () => {
      clearTimeout(expiry);
      const now = Date.now();
      const expiries = service.getSnapshot().state.records.map((record) => record.expiresAt).filter((time) => time > now);
      if (expiries.length) expiry = setTimeout(refresh, Math.min(2_147_483_647, Math.max(1, Math.min(...expiries) - now)));
    };
    const unsubscribeExpiry = service.subscribe(armExpiry);
    armExpiry();
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", refresh) : null;
    let hints: { remove(): void } | undefined;
    try { hints = notificationIntake.addChangeListener(refresh); }
    catch (error) {
      if (!(error !== null && typeof error === "object" && "code" in error && error.code === "UNSUPPORTED")) report(error);
    }
    refresh();
    return () => { unregister(); unsubscribeExpiry(); clearTimeout(expiry); foreground.remove(); focus?.remove(); hints?.remove(); };
  }, [service, lease, report]);
  return <IntakeContext.Provider value={service}>{service ? children : null}</IntakeContext.Provider>;
}
