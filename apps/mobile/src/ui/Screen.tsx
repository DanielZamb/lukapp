import { useEffect, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Keyboard,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { useInteraction } from "./Interaction";

export function Screen({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  const theme = useTheme();
  const interact = useInteraction();
  const { height } = useWindowDimensions();
  const [keyboardTop, setKeyboardTop] = useState(height);
  useEffect(() => {
    const change = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      event => setKeyboardTop(event.endCoordinates.screenY));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardTop(height));
    return () => { change.remove(); hide.remove(); };
  }, [height]);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.safe}
      >
        <ScrollView
          style={styles.safe}
          onTouchStart={interact}
          onScrollBeginDrag={interact}
          nestedScrollEnabled
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios" && !footer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
        {footer && <View style={{
          paddingHorizontal: spacing.xxl, gap: spacing.md,
          paddingBottom: Math.max(spacing.lg, height - keyboardTop + spacing.lg),
        }}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.section,
    gap: spacing.section,
  },
});
