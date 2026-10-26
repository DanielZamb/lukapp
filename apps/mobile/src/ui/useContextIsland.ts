import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { ContextIslandController, type IslandOwner } from "./ContextIslandController";
import { islandCapabilitySchema } from "./contextIslandModel";
import { registerIslandReturn } from "./contextPillIntent";
import type { ContextIslandNativeModule } from "../../modules/context-island";

const idle = () => "idle" as const;
const noSubscription = () => () => {};

export function useContextIsland(owner: IslandOwner, admitted: boolean, reduceMotion: boolean) {
  const [controller, setController] = useState<ContextIslandController | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [capable, setCapable] = useState(false);
  const latest = useRef({ owner, admitted, foreground, reduceMotion });
  latest.current = { owner, admitted, foreground, reduceMotion };
  useEffect(() => {
    let cancelled = false;
    let instance: ContextIslandController | null = null;
    let native: ContextIslandNativeModule | null = null;
    let revision = 0;
    let enabled = false;
    let removeState = () => {};
    let removeReturn = () => {};
    const refresh = async () => {
      const current = ++revision;
      try {
        const result = islandCapabilitySchema.safeParse(await native?.getCapability());
        if (cancelled || current !== revision) return;
        enabled = result.success && result.data.supported && result.data.enabled;
      } catch { if (cancelled || current !== revision) return; enabled = false; }
      setCapable(enabled);
      instance?.bind(latest.current.owner, enabled && latest.current.foreground && latest.current.admitted);
    };
    const changes = AppState.addEventListener("change", state => {
      const active = state === "active";
      latest.current.foreground = active;
      if (active) {
        enabled = false;
        setCapable(false);
        void refresh();
      } else revision++;
      instance?.bind(latest.current.owner, active && enabled && latest.current.admitted);
      setForeground(active);
    });
    void (async () => {
      try {
        const [{ loadContextIslandModule }, { randomUUID }] = await Promise.all([
          import("../../modules/context-island"), import("expo-crypto"),
        ]);
        native = await loadContextIslandModule();
        if (cancelled || !native) return;
        await native.endAll();
        if (cancelled) return;
        const active = new ContextIslandController(native, randomUUID);
        instance = active;
        const observation = native.addListener("onActivityState", event => active.observe(event));
        removeState = () => observation.remove();
        removeReturn = registerIslandReturn(scope => active.back(scope, !latest.current.reduceMotion));
        setController(active);
        await refresh();
      } catch {}
    })();
    return () => { cancelled = true; removeReturn(); removeState(); changes.remove(); instance?.dispose(); };
  }, []);
  useLayoutEffect(() => { controller?.bind(owner, admitted && foreground && capable); }, [controller, owner, admitted, foreground, capable]);
  const phase = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.getSnapshot ?? idle, idle);
  return { available: controller !== null && capable, hidden: phase !== "idle", activate: () => controller?.activate() };
}
