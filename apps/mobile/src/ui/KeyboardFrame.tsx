import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Dimensions, Keyboard, View, type LayoutChangeEvent } from "react-native";
import Animated, { KeyboardState, useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useThemeContext } from "./themeContext";

export function keyboardOverlap(bottom: number, keyboardTop: number | null) {
  "worklet";
  return keyboardTop === null ? 0 : Math.max(0, bottom - keyboardTop);
}
export function KeyboardFrame({ children }: PropsWithChildren) {
  const { ui } = useThemeContext();
  const host = useRef<View>(null);
  const [bottom, setBottom] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(() => Keyboard.metrics()?.screenY ?? null);
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  const screenHeight = Dimensions.get("screen").height;
  const measure = () => host.current?.measureInWindow((_x, y, _width, height) => setBottom(y + height));
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", event => { setKeyboardTop(event.endCoordinates.screenY); measure(); });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardTop(null));
    setKeyboardTop(Keyboard.metrics()?.screenY ?? null);
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const onLayout = (event: LayoutChangeEvent) => { setBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height); measure(); };
  const clearance = useAnimatedStyle(() => ({ paddingBottom: keyboardOverlap(bottom, keyboard.state.value === KeyboardState.UNKNOWN ? keyboardTop : keyboard.height.value > 0 ? screenHeight - keyboard.height.value : null) }));
  return <Animated.View ref={host} onLayout={onLayout} style={[ui.screen, clearance]}>{children}</Animated.View>;
}
