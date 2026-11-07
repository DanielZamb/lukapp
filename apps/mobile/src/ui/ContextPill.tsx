import { BlurTargetView } from "expo-blur";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type PropsWithChildren, type RefObject } from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type ViewProps } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCameraCutout } from "../device/cameraCutout";
import { Glass, usePillAccessibility } from "./Glass";
import { dockDelay, dockShowsSuffix, islandAmountFits, pillCopy, pillEnabled, pillPlacement, pillAppearance, compactTypography, pillHideReason, pillPresenceTransition, pillVisibility, summaryIsVisible,
  type ContextPillContent, type PillEvent, type PillVisibility } from "./contextPillModel";
import { useThemeMode, useTier } from "./themeContext";
import { font } from "./tokens";
import { useContextIsland } from "./useContextIsland";
import { nativeTransientIsland } from "./contextIslandConfig";
import { islandExpansion } from "./contextIslandModel";

export type { ContextPillContent } from "./contextPillModel";
export type SummaryScrollTarget = { y: number; animated: boolean };
type Entry = { key: string; cycle: number; content: ContextPillContent; visibility: PillVisibility; send: (event: PillEvent, animated?: boolean) => void };
type SummaryModel = { id: symbol; cycle: number; visibility: PillVisibility; registered: boolean };

function createPillStore() {
  const entries = new Map<symbol, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: Entry | null = null;
  const notify = () => {
    snapshot = [...entries.values()].at(-1) ?? null;
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    set(id: symbol, entry: Entry) { entries.set(id, entry); notify(); },
    remove(id: symbol) { entries.delete(id); notify(); },
  };
}
const PillContext = createContext<ReturnType<typeof createPillStore> | null>(null);

export function useContextPill({ identity, active, content, onBackToSummary }: {
  identity: string;
  active: boolean;
  content: ContextPillContent;
  onBackToSummary: (target: SummaryScrollTarget) => void;
}): { summaryProps: Pick<ViewProps, "onLayout" | "collapsable">; scrollProps: Pick<ScrollViewProps, "onScroll" | "scrollEventThrottle"> } {
  const store = useContext(PillContext);
  const hookId = useId();
  const tracking = pillEnabled(useTier(), true);
  const enabled = tracking && active;
  const latest = useRef({ content, onBackToSummary });
  latest.current = { content, onBackToSummary };
  const geometry = useRef<{ summary: { y: number; height: number } | null; scrollY: number }>({ summary: null, scrollY: 0 });
  const model = useMemo<SummaryModel>(() => ({ id: Symbol(identity), cycle: 0, visibility: "summary", registered: false }), [identity]);
  const publish = useCallback(() => {
    if (!model.registered || !store) return;
    store.set(model.id, { key: hookId + identity, cycle: model.cycle, content: latest.current.content, visibility: model.visibility, send });
    function send(event: PillEvent, animated = true) {
      model.visibility = pillVisibility(model.visibility, event);
      publish();
      if (event === "back") latest.current.onBackToSummary({ y: geometry.current.summary?.y ?? 0, animated });
    }
  }, [hookId, identity, model, store]);
  const observe = useCallback(() => {
    const next = pillVisibility(model.visibility, summaryIsVisible(geometry.current.summary, geometry.current.scrollY) ? "summarySeen" : "summaryGone");
    if (next !== model.visibility) { if (next === "summary") model.cycle++; model.visibility = next; publish(); }
  }, [model, publish]);
  useLayoutEffect(() => {
    if (!enabled || !store) return;
    model.registered = true;
    observe();
    publish();
    return () => { model.registered = false; store.remove(model.id); };
  }, [enabled, model, observe, publish, store]);
  useLayoutEffect(() => { publish(); }, [content, publish]);
  const onSummaryLayout = useCallback((event: LayoutChangeEvent) => {
    if (!tracking) return;
    const { y, height } = event.nativeEvent.layout;
    geometry.current.summary = { y, height };
    if (enabled) observe();
  }, [enabled, observe, tracking]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!tracking) return;
    geometry.current.scrollY = event.nativeEvent.contentOffset.y;
    if (enabled) observe();
  }, [enabled, observe, tracking]);
  return {
    summaryProps: tracking ? { onLayout: onSummaryLayout, collapsable: false } : {},
    scrollProps: tracking ? { onScroll, scrollEventThrottle: 16 } : {},
  };
}

export function ContextPillHost({ children, admitted = false }: PropsWithChildren<{ admitted?: boolean }>) {
  const [store] = useState(createPillStore);
  const target = useRef<View>(null);
  const tier = useTier();
  const Background = Platform.OS === "android" && tier === "xxxl" ? BlurTargetView : View;
  return <PillContext.Provider value={store}><View style={styles.host}>
    <Background ref={target} style={styles.host}>{children}</Background>
    {tier === "xxxl" && <ActiveHost store={store} target={target} admitted={admitted} />}
  </View></PillContext.Provider>;
}

function ActiveHost({ store, target, admitted }: { store: ReturnType<typeof createPillStore>; target: RefObject<View | null>; admitted: boolean }) {
  const cutout = useCameraCutout();
  const a11y = usePillAccessibility();
  const entry = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!a11y.ready || !entry) return null;
  return nativeTransientIsland && Platform.OS === "ios" && Number.parseFloat(String(Platform.Version)) >= 18 && cutout.kind === "island"
    ? <NativePill entry={entry} blurTarget={target} cutout={cutout} a11y={a11y} admitted={admitted} />
    : <Pill key={entry.key} entry={entry} blurTarget={target} cutout={cutout} a11y={a11y} />;
}

function NativePill({ admitted, ...props }: Parameters<typeof Pill>[0] & { admitted: boolean }) {
  const native = useContextIsland(props.entry, admitted, props.a11y.reduceMotion);
  return <Pill key={props.entry.key} {...props} native={native} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Pill({ entry, blurTarget, cutout, a11y, native }: { entry: Entry; blurTarget: RefObject<View | null>; cutout: ReturnType<typeof useCameraCutout>; a11y: ReturnType<typeof usePillAccessibility>; native?: ReturnType<typeof useContextIsland> }) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const copy = pillCopy(entry.content);
  const nativeExpansion = islandExpansion({ platform: Platform.OS, iosVersion: Number.parseFloat(String(Platform.Version)),
    tier: "xxxl", cutout, nativeTransientIsland, capability: { supported: !!native?.available, enabled: !!native?.available } }) === "native";
  const appTheme = useThemeMode();
  const visible = entry.visibility === "visible" && !native?.hidden;
  const hideReason = pillHideReason(entry.visibility);
  const latestVisible = useRef(visible);
  latestVisible.current = visible;
  const [amountMeasure, setAmountMeasure] = useState<{ text: string; width: number } | null>(null);
  const measuredAmount = amountMeasure?.text === copy.amount ? amountMeasure.width : 0;
  const geometry = pillPlacement(cutout, width);
  const typography = compactTypography({ height: geometry.kind === "island" ? geometry.height : 44, fontScale, android: Platform.OS === "android" });
  const multiplierCap = typography.kind === "fits" ? typography.multiplierCap : 1.5;
  const placement: ReturnType<typeof pillPlacement> = geometry.kind === "island" && (typography.kind === "fallback" || (measuredAmount > 0
    && !islandAmountFits({ measuredWidth: measuredAmount, fontScale, windowWidth: width, cutout: geometry.cutout, height: geometry.height, android: Platform.OS === "android" })))
    ? { kind: "peekDock" } : geometry;
  const island = placement.kind === "island";
  const androidIsland = island && Platform.OS === "android";
  const top = island ? placement.top : insets.top + 4;
  const fullWidth = width - 16;
  const left = androidIsland ? placement.centerX - fullWidth / 2 : 8;
  const compactHeight = island ? placement.height : 52;
  const expandedPaddingTop = island ? placement.cutout.y + placement.cutout.height - top + 8 : 0;
  const expandedBodyMax = Math.max(0, height - top - insets.bottom - 8 - expandedPaddingTop - 18 - 72);
  const [surfaceMounted, setSurfaceMounted] = useState(visible);
  const [expanded, setExpanded] = useState(false);
  const [docked, setDocked] = useState(false);
  const [lineWidth, setLineWidth] = useState(0);
  const [amountWidth, setAmountWidth] = useState(0);
  const [peekHeight, setPeekHeight] = useState(128);
  const [expandedHeight, setExpandedHeight] = useState(360);
  const presence = useSharedValue(0);
  const presentationGeneration = useRef(0);
  const presenceControl = useSharedValue({ visible, reason: hideReason, reduceMotion: a11y.reduceMotion, generation: 0 });
  const gestureStart = useSharedValue(1);
  const dock = useSharedValue(0);
  const expansion = useSharedValue(0);
  const open = island && expanded;
  const appearance = pillAppearance(island ? { appTheme, reduceTransparency: a11y.reduceTransparency, form: "island", platform: Platform.OS === "android" ? "android" : "ios", expanded: open }
    : { appTheme, reduceTransparency: a11y.reduceTransparency, form: "peekDock" });
  const back = () => entry.send("back", !a11y.reduceMotion);
  const resetPresentation = useCallback((generation: number) => {
    if (generation === presentationGeneration.current && !latestVisible.current) { setExpanded(false); setDocked(false); setSurfaceMounted(false); }
  }, []);
  useLayoutEffect(() => { if (visible) setSurfaceMounted(true); }, [visible]);
  useLayoutEffect(() => { presenceControl.value = { visible: visible && surfaceMounted, reason: hideReason, reduceMotion: a11y.reduceMotion, generation: ++presentationGeneration.current }; }, [visible, surfaceMounted, hideReason, a11y.reduceMotion, presenceControl]);
  useAnimatedReaction(() => presenceControl.value, control => {
    const plan = pillPresenceTransition({ current: presence.value, ...control });
    presence.value = withTiming(plan.target, { duration: plan.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, finished => {
      if (finished && plan.target === 0) scheduleOnRN(resetPresentation, control.generation);
    });
  });
  useEffect(() => () => cancelAnimation(presence), [presence]);
  useEffect(() => {
    if (placement.kind !== "peekDock" || !visible) return;
    setExpanded(false);
    const timer = setTimeout(() => setDocked(true), dockDelay(a11y.reduceMotion));
    return () => clearTimeout(timer);
  }, [placement.kind, a11y.reduceMotion, visible]);
  useEffect(() => {
    dock.value = withTiming(docked ? 1 : 0, { duration: a11y.reduceMotion ? 0 : 500,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1), reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(dock);
  }, [a11y.reduceMotion, docked, dock]);
  useEffect(() => {
    expansion.value = withTiming(open ? 1 : 0, { duration: a11y.reduceMotion ? 0 : open ? 300 : 240,
      easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(expansion);
  }, [a11y.reduceMotion, expansion, open]);
  const dismiss = useCallback(() => entry.send("swipeUp"), [entry]);
  const swipe = useMemo(() => {
    const create = () => Gesture.Pan().enabled(visible).activeOffsetY([-6, 10000]).failOffsetX([-18, 18])
      .onStart(() => { gestureStart.value = presence.value; cancelAnimation(presence); })
      .onUpdate(event => { presence.value = Math.max(0, Math.min(1, gestureStart.value + Math.min(0, event.translationY) / compactHeight)); })
      .onEnd((event, success) => {
        if (!success || !presenceControl.value.visible) return;
        if (event.translationY < -Math.min(26, compactHeight / 2)) scheduleOnRN(dismiss);
        else {
          const plan = pillPresenceTransition({ current: presence.value, visible: true, reason: "swipe", reduceMotion: a11y.reduceMotion });
          presence.value = withTiming(1, { duration: plan.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
        }
      }).onFinalize((_event, success) => {
        if (!success && presenceControl.value.visible) {
          const plan = pillPresenceTransition({ current: presence.value, visible: true, reason: "swipe", reduceMotion: a11y.reduceMotion });
          presence.value = withTiming(1, { duration: plan.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
        }
      });
    return { compact: create(), expanded: create() };
  }, [visible, dismiss, a11y.reduceMotion, compactHeight, gestureStart, presence, presenceControl]);
  const { ink, muted, accents } = appearance;
  const money = copy.tone === "positive" ? appearance.positive : copy.tone === "warning" ? appearance.danger : ink;
  const available = fullWidth - 100;
  const showSuffix = dockShowsSuffix({ textWidth: lineWidth, availableWidth: available });
  const dockWidth = Math.min(fullWidth, Math.max(180, (showSuffix ? lineWidth : amountWidth || available) + 100));
  const dockOffset = dockWidth > width - 128 ? 56 : 0;
  const rootHeight = height - top - insets.bottom - 8;
  const originY = island ? placement.centerY - top : 0;
  const originX = island ? placement.centerX - left : fullWidth / 2;
  const lensWidth = island ? placement.cutout.width : 0;
  const lensDiameter = island ? Math.min(placement.cutout.width, placement.cutout.height) : 0;
  const presenceStyle = useAnimatedStyle(() => {
    const p = presence.value;
    const surfaceHeight = interpolate(expansion.value, [0, 1], [compactHeight, expandedHeight]);
    const scaleX = island && !a11y.reduceMotion ? interpolate(p, [0, 1], [lensWidth / fullWidth, 1]) : 1;
    const scaleY = island && !a11y.reduceMotion ? interpolate(p, [0, 1], [lensDiameter / surfaceHeight, 1]) : 1;
    return { opacity: p, transform: [
      { translateX: (originX - fullWidth / 2) * (1 - scaleX) },
      { translateY: a11y.reduceMotion ? 0 : island ? (originY - rootHeight / 2) * (1 - scaleY) - (1 - p) * scaleY * (surfaceHeight / 2 - originY) : -8 * (1 - p) },
      { scaleX }, { scaleY },
    ] };
  });
  const frameStyle = useAnimatedStyle(() => ({
    width: island ? fullWidth : interpolate(dock.value, [0, 1], [fullWidth, dockWidth]),
    height: island ? interpolate(expansion.value, [0, 1], [compactHeight, expandedHeight])
      : interpolate(dock.value, [0, 1], [peekHeight, 52]),
    borderRadius: island ? interpolate(expansion.value, [0, 1], [compactHeight / 2, 38])
      : interpolate(dock.value, [0, 1], [30, 26]),
    transform: [
      { translateX: island ? 0 : (fullWidth - dockWidth) / 2 * dock.value },
      { translateY: island ? 0 : dockOffset * dock.value },
    ],
  }));
  const compactStyle = useAnimatedStyle(() => ({ opacity: interpolate(expansion.value, [0, 0.3, 1], [1, 0, 0]) }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expansion.value, [0, 0.25, 1], [0, 0, 1]),
    transform: [{ translateY: (1 - expansion.value) * 6 }],
  }));
  const peekStyle = useAnimatedStyle(() => ({ opacity: interpolate(dock.value, [0, 0.35, 1], [1, 0, 0]) }));
  const dockStyle = useAnimatedStyle(() => ({ opacity: interpolate(dock.value, [0, 0.35, 1], [0, 0, 1]),
    transform: [{ translateY: (1 - dock.value) * 6 }] }));
  const activate = () => { if (nativeExpansion) native?.activate(); else if (island && !a11y.screenReader) setExpanded(true); else back(); };
  const emoji = (size: "compact" | "peek" | "expanded" | "dock") => <View style={[styles.tile, styles[`${size}Tile`],
    { backgroundColor: accents.tint }, size === "compact" && androidIsland && typography.kind === "fits" && { width: typography.tileSize, height: typography.tileSize, borderRadius: typography.tileSize / 2 }]}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: accents.ink, borderRadius: size === "compact" && androidIsland && typography.kind === "fits" ? typography.tileSize / 2 : size === "dock" ? 18 : size === "expanded" ? 14 : 16 }]} />
    <Text accessible={false} style={[styles.emoji, size === "peek" && styles.peekEmoji]} maxFontSizeMultiplier={size === "compact" ? multiplierCap : 1.5}>{entry.content.emoji}</Text>
  </View>;
  const full = <View onLayout={event => setPeekHeight(event.nativeEvent.layout.height)} style={[styles.peekRow, { width: fullWidth }]}>{emoji("peek")}<View style={styles.copy}>
    <Text style={[styles.name, { color: muted }]}>{entry.content.name}</Text>
    <Text style={[styles.value, { color: money }]} maxFontSizeMultiplier={1.5}>{copy.line}</Text>
    {copy.limit !== null && <><Text style={[styles.sub, { color: muted }]}>{copy.limit}</Text>
      <View style={[styles.bar, { backgroundColor: accents.tint }]}><View style={[styles.fill, { backgroundColor: accents.ink, width: `${(copy.progress ?? 0) * 100}%` }]} /><View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: accents.ink, borderRadius: 6 }]} /></View></>}
  </View></View>;
  const compact = island ? <View style={[styles.islandRow, { height: compactHeight }, androidIsland && { paddingHorizontal: 8 }]}>
    <View style={androidIsland ? styles.islandLane : { width: Math.max(32, placement.cutout.x - 8 - 7 - 6) }}>{emoji("compact")}</View>
    <View style={{ width: placement.cutout.width + 12 }} />
    <Text style={[styles.islandMoney, { color: money, flex: 1 }, androidIsland && { textAlign: "center" }]} numberOfLines={1} adjustsFontSizeToFit
      minimumFontScale={typography.kind === "fits" ? typography.minimumScale : 1} maxFontSizeMultiplier={multiplierCap}>{copy.amount}</Text>
  </View> : <View style={[styles.dockRow, { width: dockWidth }]}>{emoji("dock")}
    <Text style={[styles.dockValue, { color: money, flexShrink: 1 }]} maxFontSizeMultiplier={1.5} numberOfLines={1}>
      {showSuffix ? copy.line : copy.amount}</Text><View style={[styles.chevron, { backgroundColor: accents.chevronBacking, borderRadius: 13, overflow: "hidden" }]}><View style={[styles.chevronStroke, { borderColor: accents.ink }]} /></View></View>;
  const measureMoney = <Text accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={[styles.measure, styles.islandMoney]} maxFontSizeMultiplier={multiplierCap}
    onTextLayout={event => setAmountMeasure({ text: copy.amount, width: event.nativeEvent.lines[0]?.width ?? 0 })}>{copy.amount}</Text>;
  if (geometry.kind === "island" && measuredAmount === 0) return measureMoney;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {geometry.kind === "island" && measureMoney}
    {island && <StatusBar hidden={visible} />}
    {open && visible && <Pressable accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={() => setExpanded(false)} />}
    <Animated.View pointerEvents={visible ? "box-none" : "none"} importantForAccessibility={visible ? "auto" : "no-hide-descendants"} accessibilityElementsHidden={!visible}
      style={[styles.overlay, { top, left, width: fullWidth, height: rootHeight }, presenceStyle]}>
      {androidIsland ? <Animated.View pointerEvents="none" style={[styles.surface, { backgroundColor: appearance.background }, frameStyle]} />
        : surfaceMounted && <Glass pointerEvents="none" blurTarget={blurTarget} material={appearance.material} darkContent={appearance.dark} tintOpacity={appearance.tintOpacity}
          backdropSize={{ width: fullWidth, height: island ? expandedHeight : Math.max(peekHeight, 52) }}
          reduceTransparency={a11y.reduceTransparency} style={[styles.surface, frameStyle]} />}
      <GestureDetector gesture={swipe.compact}><View pointerEvents="box-none" style={StyleSheet.absoluteFill}><AnimatedPressable pointerEvents={open || !visible ? "none" : "auto"} accessible={!open && visible}
        importantForAccessibility={open || !visible ? "no-hide-descendants" : "auto"}
        accessibilityRole={open || !visible ? undefined : "button"} accessibilityLabel={nativeExpansion ? `Show summary, ${entry.content.name}, ${copy.line}` : copy.label}
        accessibilityState={island && !a11y.screenReader ? { expanded: false } : undefined}
        accessibilityActions={[{ name: "activate", label: nativeExpansion ? "Show summary" : "Back to summary" }, { name: "dismiss", label: "Hide until summary is visible" }]}
        onAccessibilityAction={event => event.nativeEvent.actionName === "dismiss" ? entry.send("swipeUp") : nativeExpansion ? activate() : back()}
        onPress={activate}
        style={[styles.surface, frameStyle, island && compactStyle]}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {island ? compact : <><Animated.View style={[styles.contentLayer, { width: fullWidth }, peekStyle]}>{full}</Animated.View>
            <Animated.View style={[styles.contentLayer, { width: dockWidth }, dockStyle]}>{compact}</Animated.View></>}
        </View>
      </AnimatedPressable>
        {androidIsland && visible && !open && <Pressable accessible={false} importantForAccessibility="no-hide-descendants" onPress={activate}
          style={{ position: "absolute", top: compactHeight, left: Math.max(0, 56 - left), width: Math.max(0, width - 112), height: Math.max(0, 44 - compactHeight) }} />}
      </View></GestureDetector>
      {island && <Animated.View pointerEvents={open ? "box-none" : "none"}
        onLayout={event => setExpandedHeight(event.nativeEvent.layout.height)}
        style={[styles.expanded, { width: fullWidth, paddingTop: expandedPaddingTop }, expandedStyle]}>
        <ScrollView style={{ flexGrow: 0, maxHeight: expandedBodyMax }} accessible={false} importantForAccessibility="no" showsVerticalScrollIndicator={false}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GestureDetector gesture={swipe.expanded}><View style={styles.expandedHeading}>{emoji("expanded")}<Text style={[styles.expandedName, { color: ink }]}>{entry.content.name}</Text></View></GestureDetector>
            {copy.figures.map((figure, index) => <View key={figure.label} style={[styles.figure, { borderTopColor: appearance.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)" }]}>
              <Text style={[styles.figureLabel, { color: muted }]}>{figure.label}</Text>
              <Text style={[styles.figureValue, { color: index === 0 ? money : ink }]} maxFontSizeMultiplier={1.5}>{figure.value}</Text>
            </View>)}
          </View>
        </ScrollView>
        <Pressable accessible={open && visible} importantForAccessibility={open && visible ? "auto" : "no-hide-descendants"}
          accessibilityRole={open && visible ? "button" : undefined} accessibilityLabel={copy.label}
          accessibilityActions={[{ name: "dismiss", label: "Hide until summary is visible" }]}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === "dismiss") entry.send("swipeUp"); }}
          onPress={back} style={[styles.backButton, { backgroundColor: accents.buttonFill }]}><View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: accents.ink, borderRadius: 30 }]} /><Text accessible={false} style={[styles.backText, { color: accents.buttonInk }]} maxFontSizeMultiplier={1.5}>Back to summary</Text><View style={styles.chevron}><View style={[styles.chevronStroke, { borderColor: accents.buttonInk }]} /></View></Pressable>
      </Animated.View>}
    </Animated.View>
    {!island && <Text accessible={false} pointerEvents="none" style={[styles.measure, styles.dockValue]} maxFontSizeMultiplier={1.5}
      onTextLayout={event => setLineWidth(event.nativeEvent.lines[0]?.width ?? 0)}>{copy.line}</Text>}
    {!island && <Text accessible={false} pointerEvents="none" style={[styles.measure, styles.dockValue]} maxFontSizeMultiplier={1.5}
      onTextLayout={event => setAmountWidth(event.nativeEvent.lines[0]?.width ?? 0)}>{copy.amount}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  overlay: { position: "absolute", zIndex: 100 },
  surface: { position: "absolute", top: 0, left: 0, overflow: "hidden" },
  contentLayer: { position: "absolute", top: 0, left: 0 },
  islandLane: { flex: 1, alignItems: "center" },
  tile: { justifyContent: "center", alignItems: "center", flexShrink: 0 },
  compactTile: { width: 32, height: 32, borderRadius: 16 },
  peekTile: { width: 48, height: 48, borderRadius: 16 },
  expandedTile: { width: 44, height: 44, borderRadius: 14 },
  dockTile: { width: 36, height: 36, borderRadius: 18 },
  emoji: { fontSize: 13.33, maxWidth: "100%" },
  peekEmoji: { fontSize: 18 },
  copy: { flex: 1, gap: 2 },
  peekRow: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16, flexDirection: "row", gap: 12 },
  name: { fontFamily: font.regular, fontSize: 14, lineHeight: 18.2 },
  value: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20, letterSpacing: -0.48 },
  sub: { fontFamily: font.regular, fontSize: 12, lineHeight: 16.2 },
  bar: { height: 6, borderRadius: 6, overflow: "hidden", marginTop: 8 },
  fill: { height: 6 },
  islandRow: { flexDirection: "row", alignItems: "center", paddingLeft: 7, paddingRight: 10 },
  islandMoney: { fontFamily: font.semibold, fontSize: 14.67, lineHeight: 18.33, letterSpacing: -0.44, textAlign: "right" },
  dockRow: { minHeight: 52, paddingLeft: 8, paddingRight: 10, flexDirection: "row", gap: 10, alignItems: "center" },
  dockValue: { fontFamily: font.semibold, fontSize: 14.67, lineHeight: 18.33, letterSpacing: -0.44 },
  chevron: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  chevronStroke: { width: 10, height: 10, borderTopWidth: 1.9, borderLeftWidth: 1.9, transform: [{ rotate: "45deg" }], marginTop: 5 },
  expanded: { paddingHorizontal: 18, paddingBottom: 18 },
  expandedHeading: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 14 },
  expandedName: { flex: 1, fontFamily: font.semibold, fontSize: 16, lineHeight: 20.8, letterSpacing: -0.32 },
  figure: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)", gap: 2 },
  figureLabel: { fontFamily: font.regular, fontSize: 12, lineHeight: 15.6 },
  figureValue: { fontFamily: font.semibold, fontSize: 18, lineHeight: 22.5, letterSpacing: -0.54 },
  backButton: { marginTop: 12, minHeight: 60, borderRadius: 30, padding: 8, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  backText: { fontFamily: font.semibold, fontSize: 14.67, lineHeight: 18.33, textAlign: "center" },
  measure: { position: "absolute", opacity: 0, left: 0, top: 0, width: 10000 },
});
