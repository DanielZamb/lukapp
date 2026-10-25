import { BlurTargetView } from "expo-blur";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type PropsWithChildren, type RefObject } from "react";
import { Animated, Easing, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCameraCutout } from "../device/cameraCutout";
import { Glass, usePillAccessibility } from "./Glass";
import { dockDelay, dockShowsSuffix, islandAmountFits, pillCopy, pillEnabled, pillPlacement, pillVisibility, summaryIsVisible,
  type ContextPillContent, type PillEvent, type PillVisibility } from "./contextPillModel";
import { useTier } from "./themeContext";
import { font } from "./tokens";

export type { ContextPillContent } from "./contextPillModel";
export type SummaryScrollTarget = { y: number; animated: boolean };
type Entry = { key: string; content: ContextPillContent; visibility: PillVisibility; send: (event: PillEvent, animated?: boolean) => void };
type SummaryModel = { id: symbol; visibility: PillVisibility; summary: { y: number; height: number } | null; scrollY: number; registered: boolean };

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
  const enabled = pillEnabled(useTier(), active);
  const latest = useRef({ content, onBackToSummary });
  latest.current = { content, onBackToSummary };
  const model = useMemo<SummaryModel>(() => ({ id: Symbol(identity), visibility: "summary",
    summary: null, scrollY: 0, registered: false }), [identity]);
  const publish = useCallback(() => {
    if (!model.registered || !store) return;
    store.set(model.id, { key: hookId + identity, content: latest.current.content, visibility: model.visibility, send });
    function send(event: PillEvent, animated = true) {
      model.visibility = pillVisibility(model.visibility, event);
      publish();
      if (event === "back") latest.current.onBackToSummary({ y: model.summary?.y ?? 0, animated });
    }
  }, [hookId, identity, model, store]);
  const observe = useCallback(() => {
    const next = pillVisibility(model.visibility, summaryIsVisible(model.summary, model.scrollY) ? "summarySeen" : "summaryGone");
    if (next !== model.visibility) { model.visibility = next; publish(); }
  }, [model, publish]);
  useLayoutEffect(() => {
    if (!enabled || !store) return;
    model.registered = true;
    publish();
    return () => { model.registered = false; store.remove(model.id); };
  }, [enabled, model, publish, store]);
  useLayoutEffect(() => { publish(); }, [content, publish]);
  const onSummaryLayout = useCallback((event: LayoutChangeEvent) => {
    if (!enabled) return;
    const { y, height } = event.nativeEvent.layout;
    model.summary = { y, height };
    observe();
  }, [enabled, model, observe]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!enabled) return;
    model.scrollY = event.nativeEvent.contentOffset.y;
    observe();
  }, [enabled, model, observe]);
  return {
    summaryProps: enabled ? { onLayout: onSummaryLayout, collapsable: false } : {},
    scrollProps: enabled ? { onScroll, scrollEventThrottle: 16 } : {},
  };
}

export function ContextPillHost({ children }: PropsWithChildren) {
  const [store] = useState(createPillStore);
  const target = useRef<View>(null);
  const tier = useTier();
  const Background = Platform.OS === "android" && tier === "xxxl" ? BlurTargetView : View;
  return <PillContext.Provider value={store}><View style={styles.host}>
    <Background ref={target} style={styles.host}>{children}</Background>
    {tier === "xxxl" && <ActiveHost store={store} target={target} />}
  </View></PillContext.Provider>;
}

function ActiveHost({ store, target }: { store: ReturnType<typeof createPillStore>; target: RefObject<View | null> }) {
  const cutout = useCameraCutout();
  const a11y = usePillAccessibility();
  const entry = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return a11y.ready && entry?.visibility === "visible"
    ? <Pill key={entry.key} entry={entry} blurTarget={target} cutout={cutout} a11y={a11y} /> : null;
}

function Pill({ entry, blurTarget, cutout, a11y }: { entry: Entry; blurTarget: RefObject<View | null>; cutout: ReturnType<typeof useCameraCutout>; a11y: ReturnType<typeof usePillAccessibility> }) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const copy = pillCopy(entry.content);
  const [amountMeasure, setAmountMeasure] = useState<{ text: string; width: number } | null>(null);
  const measuredAmount = amountMeasure?.text === copy.amount ? amountMeasure.width : 0;
  const geometry = pillPlacement(cutout);
  const placement: ReturnType<typeof pillPlacement> = geometry.kind === "island" && measuredAmount > 0
    && !islandAmountFits({ measuredWidth: measuredAmount, fontScale, windowWidth: width, cutout: geometry.cutout })
    ? { kind: "peekDock" } : geometry;
  const island = placement.kind === "island";
  const top = island ? placement.top : insets.top + 4;
  const expandedPaddingTop = island ? placement.cutout.y + placement.cutout.height - top + 8 : 0;
  const expandedBodyMax = Math.max(0, height - top - insets.bottom - 8 - expandedPaddingTop - 18 - 72);
  const [expanded, setExpanded] = useState(false);
  const [docked, setDocked] = useState(false);
  const [lineWidth, setLineWidth] = useState(0);
  const [amountWidth, setAmountWidth] = useState(0);
  const [peekHeight, setPeekHeight] = useState(128);
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const back = () => entry.send("back", !a11y.reduceMotion);
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 1, duration: a11y.reduceMotion ? 120 : 180, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [a11y.reduceMotion, opacity]);
  useEffect(() => {
    if (placement.kind !== "peekDock") return;
    setDocked(false);
    const timer = setTimeout(() => setDocked(true), dockDelay(a11y.reduceMotion));
    return () => clearTimeout(timer);
  }, [placement.kind, a11y.reduceMotion]);
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: docked ? 1 : 0, duration: a11y.reduceMotion ? 0 : 500,
      easing: Easing.bezier(0.2, 1.18, 0.36, 1), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [a11y.reduceMotion, docked, progress]);
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (!expanded || gesture.y0 < top + expandedPaddingTop)
      && gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (event, gesture) => {
      if (Math.min(gesture.dy, event.nativeEvent.pageY - gesture.y0) < -26) entry.send("swipeUp");
    },
  }), [entry, expanded, expandedPaddingTop, top]);
  const dark = island;
  const ink = dark ? "#ffffff" : "#141118";
  const muted = dark ? "rgba(255,255,255,0.72)" : "#4f4858";
  const money = copy.tone === "positive" ? dark ? "#4ade80" : "#047857"
    : copy.tone === "warning" ? dark ? "#fbbf24" : "#9c5f06" : ink;
  const dockMax = width - 16;
  const available = dockMax - 100;
  const showSuffix = dockShowsSuffix({ textWidth: lineWidth, availableWidth: available });
  const dockWidth = Math.min(dockMax, Math.max(180, (showSuffix ? lineWidth : amountWidth || available) + 100));
  const belowClose = dockWidth > width - 128;
  const pillWidth = island || !docked ? width - 16 : dockWidth;
  const activate = () => { if (island && !a11y.screenReader) setExpanded(true); else back(); };
  const emoji = (size: "compact" | "peek" | "expanded" | "dock") => <View style={[styles.tile, styles[`${size}Tile`],
    { backgroundColor: dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.7)" }]}>
    <Text accessible={false} style={[styles.emoji, size === "peek" && styles.peekEmoji]} maxFontSizeMultiplier={1.5}>{entry.content.emoji}</Text>
  </View>;
  const full = <View onLayout={event => setPeekHeight(event.nativeEvent.layout.height)} style={[styles.peekRow, { width: width - 16 }]}>{emoji("peek")}<View style={styles.copy}>
    <Text style={[styles.name, { color: muted }]}>{entry.content.name}</Text>
    <Text style={[styles.value, { color: money }]} maxFontSizeMultiplier={1.5}>{copy.line}</Text>
    {copy.limit !== null && <><Text style={[styles.sub, { color: muted }]}>{copy.limit}</Text>
      <View style={styles.bar}><View style={[styles.fill, { width: `${(copy.progress ?? 0) * 100}%` }]} /></View></>}
  </View></View>;
  const compact = island ? <View style={[styles.islandRow, { height: placement.height }]}>
    <View style={{ width: Math.max(32, placement.cutout.x - 8 - 7 - 6) }}>{emoji("compact")}</View>
    <View style={{ width: placement.cutout.width + 12 }} />
    <Text style={[styles.islandMoney, { color: money, flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit
      minimumFontScale={Math.min(1, 18 / (14.67 * Math.min(fontScale, 1.5)))} maxFontSizeMultiplier={1.5}>{copy.amount}</Text>
  </View> : <View style={styles.dockRow}>{emoji("dock")}
    <Text style={[styles.dockValue, { color: money, flexShrink: 1 }]} maxFontSizeMultiplier={1.5} numberOfLines={1}>
      {showSuffix ? copy.line : copy.amount}</Text><View style={styles.chevron}><View style={[styles.chevronStroke, { borderColor: ink }]} /></View></View>;
  const measureMoney = <Text accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={[styles.measure, styles.islandMoney]} maxFontSizeMultiplier={1.5}
    onTextLayout={event => setAmountMeasure({ text: copy.amount, width: event.nativeEvent.lines[0]?.width ?? 0 })}>{copy.amount}</Text>;
  if (geometry.kind === "island" && measuredAmount === 0) return measureMoney;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {geometry.kind === "island" && measureMoney}
    {island && <StatusBar hidden />}
    {expanded && <Pressable accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={() => setExpanded(false)} />}
    <Animated.View style={[styles.overlay, { top, left: 8, width: pillWidth, opacity,
      maxHeight: height - top - insets.bottom - 8 }, !island && {
      top: progress.interpolate({ inputRange: [0, 1], outputRange: [top, top + (belowClose ? 56 : 0)] }),
      left: progress.interpolate({ inputRange: [0, 1], outputRange: [8, (width - dockWidth) / 2] }),
      width: progress.interpolate({ inputRange: [0, 1], outputRange: [width - 16, dockWidth] }) }]}>
      <Glass blurTarget={blurTarget} darkContent={dark} reduceTransparency={a11y.reduceTransparency}
        style={{ borderRadius: expanded ? 38 : island ? placement.height / 2 : progress.interpolate({ inputRange: [0, 1], outputRange: [30, 26] }) }}>
        <View {...swipe.panHandlers}>
        {island && expanded ? <View style={[styles.expanded, { paddingTop: expandedPaddingTop, backgroundColor: "rgba(0,0,0,0.2)" }]}>
          <ScrollView style={{ flexGrow: 0, maxHeight: expandedBodyMax }} accessible={false} importantForAccessibility="no" showsVerticalScrollIndicator={false}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            <View style={styles.expandedHeading}>{emoji("expanded")}<Text style={[styles.expandedName, { color: ink }]}>{entry.content.name}</Text></View>
            {copy.figures.map((figure, index) => <View key={figure.label} style={styles.figure}>
              <Text style={[styles.figureLabel, { color: muted }]}>{figure.label}</Text>
              <Text style={[styles.figureValue, { color: index === 0 ? money : ink }]} maxFontSizeMultiplier={1.5}>{figure.value}</Text>
            </View>)}
          </View>
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.label} accessibilityActions={[{ name: "dismiss", label: "Hide until summary is visible" }]}
            onAccessibilityAction={event => { if (event.nativeEvent.actionName === "dismiss") entry.send("swipeUp"); }}
            onPress={back} style={styles.backButton}><Text accessible={false} style={[styles.backText, { color: ink }]} maxFontSizeMultiplier={1.5}>Back to summary</Text><View style={styles.chevron}><View style={[styles.chevronStroke, { borderColor: ink }]} /></View></Pressable>
        </View> : <Pressable accessibilityRole="button" accessibilityLabel={copy.label}
          accessibilityState={island && !a11y.screenReader ? { expanded } : undefined} accessibilityActions={[{ name: "activate", label: "Back to summary" }, { name: "dismiss", label: "Hide until summary is visible" }]}
          onAccessibilityAction={event => event.nativeEvent.actionName === "dismiss" ? entry.send("swipeUp") : back()}
          onPress={activate}>
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {island ? compact : <Animated.View style={{ height: progress.interpolate({ inputRange: [0, 1], outputRange: [peekHeight, 52] }) }}>
              <Animated.View style={{ position: "absolute", opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>{full}</Animated.View>
              <Animated.View style={{ position: "absolute", width: dockWidth, opacity: progress }}>{compact}</Animated.View>
            </Animated.View>}
          </View>
        </Pressable>}
        </View>
      </Glass>
    </Animated.View>
    {!island && <Text accessible={false} pointerEvents="none" style={[styles.measure, styles.dockValue]} maxFontSizeMultiplier={1.5}
      onTextLayout={event => setLineWidth(event.nativeEvent.lines[0]?.width ?? 0)}>{copy.line}</Text>}
    {!island && <Text accessible={false} pointerEvents="none" style={[styles.measure, styles.dockValue]} maxFontSizeMultiplier={1.5}
      onTextLayout={event => setAmountWidth(event.nativeEvent.lines[0]?.width ?? 0)}>{copy.amount}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  overlay: { position: "absolute", zIndex: 100, elevation: 100 },
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
  bar: { height: 6, borderRadius: 6, backgroundColor: "rgba(109,40,217,0.16)", overflow: "hidden", marginTop: 8 },
  fill: { height: 6, backgroundColor: "#6d28d9" },
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
