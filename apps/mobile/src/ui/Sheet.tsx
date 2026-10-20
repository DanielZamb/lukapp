import type { Theme } from "./tokens";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo, useEffect, useRef, type PropsWithChildren } from "react";
import { BackHandler, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SecondaryButton, useTheme } from "./core";
import { radius, spacing } from "./tokens";

export function Sheet({ children, onClose, label }: PropsWithChildren<{
  onClose: () => void;
  label: string;
}>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const modal = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => { modal.current?.present(); }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      modal.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, []);

  return <BottomSheetModal ref={modal} accessibilityLabel={label} enablePanDownToClose
    enableDynamicSizing onDismiss={onClose} backgroundStyle={styles.surface}
    handleIndicatorStyle={{ backgroundColor: theme.ring }}
    backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />}>
    <BottomSheetScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }]}>
      {children}
      <SecondaryButton label="Close details" onPress={() => modal.current?.dismiss()} />
    </BottomSheetScrollView>
  </BottomSheetModal>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    surface: {
      backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      borderWidth: 1, borderColor: theme.border,
    },
    body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, gap: spacing.md },
  });
}
