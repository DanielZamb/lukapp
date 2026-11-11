import { useRef, useState, type RefObject } from "react";
import { Image, PanResponder, Text, View, type GestureResponderEvent, type PanResponderGestureState } from "react-native";
import { useT } from "../../i18n";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header, PrimaryButton, SecondaryButton, useUi } from "../../ui/core";
import { useThemeContext } from "../../ui/themeContext";
import { spacing } from "../../ui/tokens";
import { boxFromDrag, boxRect, type Point, type RedactionBox, type Size } from "./redaction";
import type { Screenshot } from "./report";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

export type RedactionResult =
  | { kind: "unchanged" }
  | { kind: "flattened"; screenshot: Screenshot }
  | { kind: "failed" };

/**
 * Drag to place black boxes over the screenshot. Apply renders the image and
 * the boxes together into a new file, so the hidden pixels are not in it.
 */
export function RedactionEditor({
  screenshot,
  flatten,
  onDone,
  onCancel,
}: {
  screenshot: Screenshot;
  flatten: (canvas: RefObject<View | null>, size: Size) => Promise<Screenshot | null>;
  onDone: (result: RedactionResult) => void;
  onCancel: () => void;
}) {
  const ui = useUi();
  const { layout } = useThemeContext();
  const { t, tn } = useT();
  const canvas = useRef<View>(null);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const scale = Math.min(stage.width / screenshot.width, stage.height / screenshot.height);
  const size: Size = scale > 0 ? { width: screenshot.width * scale, height: screenshot.height * scale } : { width: 0, height: 0 };
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [draft, setDraft] = useState<RedactionBox | null>(null);
  const [applying, setApplying] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const start = useRef<Point | null>(null);
  const end = (gesture: PanResponderGestureState): Point | null =>
    start.current && { x: start.current.x + gesture.dx, y: start.current.y + gesture.dy };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        start.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      },
      onPanResponderMove: (_event, gesture) => {
        const point = end(gesture);
        if (start.current && point) setDraft(boxFromDrag(start.current, point, sizeRef.current));
      },
      onPanResponderRelease: (_event, gesture) => {
        const point = end(gesture);
        const box = start.current && point ? boxFromDrag(start.current, point, sizeRef.current) : null;
        if (box) setBoxes((current) => [...current, box]);
        start.current = null;
        setDraft(null);
      },
      onPanResponderTerminate: () => {
        start.current = null;
        setDraft(null);
      },
    }),
  ).current;
  const apply = async () => {
    if (boxes.length === 0) return onDone({ kind: "unchanged" });
    setApplying(true);
    const flattened = await flatten(canvas, size);
    onDone(flattened ? { kind: "flattened", screenshot: flattened } : { kind: "failed" });
  };
  const shown = draft ? [...boxes, draft] : boxes;
  const half = { flexGrow: 1, flexBasis: "40%" } as const;
  return (
    <SafeAreaView style={ui.screen}>
      <View style={{ flex: 1, padding: layout.pagePadding, gap: spacing.lg }}>
        <Header title={t("feedback.blackOut")} onBack={onCancel} />
        <Text style={ui.body}>{t("feedback.redactHint")}</Text>
        <View
          style={{ flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center" }}
          onLayout={(event) => setStage({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        >
          <View
            ref={canvas}
            collapsable={false}
            accessible
            accessibilityLabel={t("feedback.redactCanvas")}
            accessibilityHint={t("feedback.redactCanvasHint")}
            style={{ width: size.width, height: size.height, overflow: "hidden" }}
            {...responder.panHandlers}
          >
            <View pointerEvents="none" style={fill}>
              <Image source={{ uri: screenshot.uri }} resizeMode="stretch" style={fill} />
            </View>
            {shown.map((box, index) => (
              <View
                key={index}
                testID="redaction-box"
                pointerEvents="none"
                style={{ position: "absolute", backgroundColor: "#000000", opacity: 1, ...boxRect(box, size) }}
              />
            ))}
          </View>
        </View>
        <Text style={ui.muted}>{tn("feedback.boxCount", boxes.length)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          <View style={half}>
            <SecondaryButton
              label={t("feedback.undo")}
              disabled={applying || boxes.length === 0}
              onPress={() => setBoxes((current) => current.slice(0, -1))}
            />
          </View>
          <View style={half}>
            <SecondaryButton
              label={t("feedback.clearBoxes")}
              disabled={applying || boxes.length === 0}
              onPress={() => setBoxes([])}
            />
          </View>
          <View style={half}>
            <SecondaryButton label={t("common.cancel")} disabled={applying} onPress={onCancel} />
          </View>
          <View style={half}>
            <PrimaryButton label={t("feedback.applyBoxes")} pending={applying} onPress={() => void apply()} trailingIcon="checkmark" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
