import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type PropsWithChildren,
} from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { ReduceMotion, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import type { EntryState } from "../local-auth/entryController";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../features/api";
import { ConnectingMark, ConnectingSignature } from "./Brand";
import { Text, useThemeMode, useTier } from "./core";

export const connectingPhases = ["protection", "session", "account", "device", "data"] satisfies ConnectingPhase[];
export type ConnectingPhase = "protection" | "session" | "account" | "device" | "data";
export const connectingCopy: Record<ConnectingPhase, string> = {
  protection: "Unlocking Lukapp…", session: "Opening your session…", account: "Connecting to your account…",
  device: "Checking this phone…", data: "Getting your lucas…",
};

type GateSnapshot =
  | { gate: "local"; state: EntryState["kind"]; sessionReady: boolean }
  | { gate: "admission"; clerkLoaded: boolean; signedIn: boolean; convexLoading: boolean; authenticated: boolean;
      connection: "pending" | FunctionReturnType<typeof api.authConnection.connection>["status"] }
  | { gate: "device"; state: "waiting" | "interactive" | "ready" | "error" }
  | { gate: "home"; resolved: boolean };

export function connectingPhase(snapshot: GateSnapshot): ConnectingPhase | null {
  switch (snapshot.gate) {
    case "local": return snapshot.state === "checking" ? "protection"
      : snapshot.state === "open" && !snapshot.sessionReady ? "session" : null;
    case "admission":
      if (!snapshot.clerkLoaded || snapshot.convexLoading || !snapshot.signedIn) return "session";
      if (!snapshot.authenticated || snapshot.connection === "not-owner" || snapshot.connection === "signed-out") return null;
      return snapshot.connection === "pending" ? "account" : null;
    case "device": return snapshot.state === "waiting" ? "device" : null;
    case "home": return snapshot.resolved ? null : "data";
  }
}

type Timeline = { phase: ConnectingPhase | null; since: number; announced: Set<ConnectingPhase>; slowAnnounced: boolean; owners: Set<symbol> };
type Connection = {
  clock: SharedValue<number>;
  reducedMotion: boolean;
  motionReady: boolean;
  enter: (phase: ConnectingPhase, owner: symbol) => number;
  leave: (owner: symbol) => void;
  announceSlow: (phase: ConnectingPhase) => void;
};
const ConnectionContext = createContext<Connection | null>(null);
export const connectingSlowMs = 8000;

export function ConnectingProvider({ children }: PropsWithChildren) {
  const clock = useSharedValue(0);
  const [motionPreference, setReducedMotion] = useState<boolean | null>(null);
  const reducedMotion = motionPreference !== false;
  const motionReady = motionPreference !== null;
  const [active, setActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const timeline = useRef<Timeline>({ phase: null, since: 0, announced: new Set(), slowAnnounced: false, owners: new Set() });
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useFrameCallback(({ timestamp }) => { clock.value = timestamp; }, false);
  useEffect(() => {
    let live = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      setReducedMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live && !changed) setReducedMotion(value); });
    return () => { live = false; listener.remove(); };
  }, []);
  useEffect(() => {
    frame.setActive(active && !reducedMotion);
    return () => frame.setActive(false);
  }, [frame, active, reducedMotion]);
  useEffect(() => () => { if (release.current) clearTimeout(release.current); }, []);
  const enter = useCallback((phase: ConnectingPhase, owner: symbol) => {
    if (release.current) clearTimeout(release.current);
    const current = timeline.current;
    current.owners.add(owner);
    if (current.phase !== phase) { current.phase = phase; current.since = Date.now(); current.slowAnnounced = false; }
    if (!current.announced.has(phase)) {
      current.announced.add(phase);
      setAnnouncement(connectingCopy[phase]);
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions(connectingCopy[phase], { queue: true });
    }
    setActive(true);
    return current.since;
  }, []);
  const leave = useCallback((owner: symbol) => {
    timeline.current.owners.delete(owner);
    if (timeline.current.owners.size) return;
    release.current = setTimeout(() => {
      timeline.current = { phase: null, since: 0, announced: new Set(), slowAnnounced: false, owners: new Set() };
      setAnnouncement("");
      setActive(false);
    }, 0);
  }, []);
  const announceSlow = useCallback((phase: ConnectingPhase) => {
    const current = timeline.current;
    if (current.phase !== phase || current.slowAnnounced) return;
    current.slowAnnounced = true;
    setAnnouncement("Still connecting…");
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions("Still connecting…", { queue: true });
  }, []);
  const value = useMemo(() => ({ clock, reducedMotion, motionReady, enter, leave, announceSlow }), [clock, reducedMotion, motionReady, enter, leave, announceSlow]);
  return <ConnectionContext.Provider value={value}>
    {children}
    <Text variant="body" accessibilityLiveRegion="polite" style={styles.hidden}>{announcement}</Text>
  </ConnectionContext.Provider>;
}

function useConnection() {
  const connection = useContext(ConnectionContext);
  if (!connection) throw new Error("ConnectingScreen needs ConnectingProvider");
  return connection;
}

type DeviceActions = { onCheckAgain: () => void; onSignOut: () => void; signingOut: boolean };
type ConnectingScreenProps =
  | { phase: Exclude<ConnectingPhase, "device"> }
  | ({ phase: "device" } & DeviceActions);

export function ConnectingScreen(props: ConnectingScreenProps) {
  const { clock, reducedMotion, enter, leave, announceSlow } = useConnection();
  const mode = useThemeMode();
  const large = useTier() === "xxxl";
  const [slow, setSlow] = useState(false);
  useLayoutEffect(() => {
    const owner = Symbol();
    const since = enter(props.phase, owner);
    const remaining = Math.max(0, connectingSlowMs - (Date.now() - since));
    setSlow(remaining === 0);
    if (remaining === 0) announceSlow(props.phase);
    const timer = setTimeout(() => { setSlow(true); announceSlow(props.phase); }, remaining);
    return () => { clearTimeout(timer); leave(owner); };
  }, [props.phase, enter, leave, announceSlow]);
  const markStyle = useAnimatedStyle(() => {
    const breath = (1 - Math.cos(2 * Math.PI * (clock.value % 2800) / 2800)) / 2;
    return { transform: [{ scale: reducedMotion ? 1 : 1 + 0.035 * breath }] };
  });
  const haloStyle = useAnimatedStyle(() => {
    const breath = (1 - Math.cos(2 * Math.PI * (clock.value % 2800) / 2800)) / 2;
    return { opacity: reducedMotion ? 0.7 : 0.45 + 0.5 * breath,
      transform: [{ scale: reducedMotion ? 1 : 0.9 + 0.17 * breath }] };
  });
  const pulseStyle = useAnimatedStyle(() => {
    const pulse = (clock.value % 1400) / 1400;
    return { opacity: reducedMotion ? 0.6 : 0.9 * (1 - pulse),
      transform: [{ scale: reducedMotion ? 1 : 0.6 + 0.9 * pulse }] };
  });
  const step = connectingPhases.indexOf(props.phase);
  return <SafeAreaView style={[styles.screen, { backgroundColor: mode === "dark" ? "#21132f" : "#6d28d9" }]}>
    <StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: large ? 48 : 84 }]}>
      <View accessibilityLabel="Lukapp is connecting" style={styles.signature}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.mark, { height: large ? 102 : 128 }]}>
          <Animated.View style={[styles.halo, haloStyle]}>
            {Array.from({ length: 16 }, (_, index) => <View key={index} style={[styles.glow, {
              width: 230 - index * 10, height: 230 - index * 10, backgroundColor: `rgba(245,243,255,${0.004 + index * 0.001})`,
            }]} />)}
          </Animated.View>
          <Animated.View style={markStyle}><ConnectingMark /></Animated.View>
        </View>
        <ConnectingSignature />
        <View style={styles.dots} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {connectingPhases.map((phase, index) => <View key={phase} style={[styles.dot, index <= step && styles.filled]}>
            {phase === props.phase && <Animated.View style={[styles.ring, pulseStyle]} />}
          </View>)}
        </View>
        <View style={styles.status}>
          {slow && <Text variant="body" style={styles.soft}>Still connecting…</Text>}
          {slow && props.phase === "device" && <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Check again" onPress={props.onCheckAgain}
              style={[styles.button, { minHeight: large ? 60 : 52 }]}>
              <Text variant="action" style={styles.soft}>Check again</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={props.signingOut ? "Signing out…" : "Sign out"}
              disabled={props.signingOut} onPress={props.onSignOut} style={[styles.signOut, { minHeight: large ? 56 : 44 }]}>
              <Text variant="meta" style={[styles.soft, styles.underline]}>{props.signingOut ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
          </View>}
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

export function ConnectingHandover({ ready, children }: PropsWithChildren<{ ready: boolean }>) {
  const { reducedMotion, motionReady } = useConnection();
  const [cover, setCover] = useState(true);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!ready || !cover || !motionReady) return;
    const duration = reducedMotion ? 150 : 320;
    opacity.value = withTiming(0, { duration, reduceMotion: ReduceMotion.Never });
    const timer = setTimeout(() => setCover(false), duration);
    return () => clearTimeout(timer);
  }, [ready, cover, reducedMotion, motionReady, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <View style={styles.fill}>
    <View style={styles.fill} pointerEvents={cover ? "none" : "auto"}
      accessibilityElementsHidden={cover} importantForAccessibility={cover ? "no-hide-descendants" : "auto"}>{children}</View>
    {cover && <Animated.View style={[styles.cover, fade]}><ConnectingScreen phase="data" /></Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, screen: { flex: 1 }, cover: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
  signature: { alignItems: "center", alignSelf: "stretch", gap: 16 },
  mark: { width: 120, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 230, height: 230, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", borderRadius: 200 },
  dots: { flexDirection: "row", gap: 12, marginTop: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: "rgba(245,243,255,0.5)" },
  filled: { backgroundColor: "#f5f3ff", borderColor: "#f5f3ff" },
  ring: { position: "absolute", top: -7.5, left: -7.5, width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: "rgba(245,243,255,0.6)" },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden" },
  status: { alignSelf: "stretch", alignItems: "center", gap: 14, marginTop: 8 },
  soft: { color: "#e9ddff", textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 10 },
  button: { borderWidth: 1.5, borderColor: "rgba(245,243,255,0.7)", borderRadius: 16,
    padding: 12, alignItems: "center", justifyContent: "center" },
  signOut: { padding: 8, alignItems: "center", justifyContent: "center" }, underline: { textDecorationLine: "underline" },
});
