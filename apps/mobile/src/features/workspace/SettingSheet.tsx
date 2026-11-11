import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useEffect, useRef, type PropsWithChildren, type RefObject } from "react";
import { BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, useTheme } from "../../ui/core";
import { useReadableLayout } from "../../ui/themeContext";
import { radius, spacing } from "../../ui/tokens";

/**
 * A workspace setting's sheet. System Back, the backdrop and a pan down close it before the screen,
 * except while `locked`: a change in flight or with an unknown outcome keeps its sheet open.
 */
export function SettingSheet({ sheetRef, label, title, locked, onDismiss, children }: PropsWithChildren<{
  sheetRef: RefObject<BottomSheetModal | null>;
  label: string;
  title: string;
  locked: boolean;
  onDismiss: () => void;
}>) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const insets = useSafeAreaInsets();
  const lockedNow = useRef(locked);
  lockedNow.current = locked;
  useEffect(() => {
    sheetRef.current?.present();
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!lockedNow.current) sheetRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [sheetRef]);
  return (
    <BottomSheetModal ref={sheetRef} accessibilityLabel={label} stackBehavior="push" enableDynamicSizing
      enablePanDownToClose={!locked} onDismiss={onDismiss}
      backgroundStyle={{ backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        borderWidth: 1, borderColor: theme.border }}
      handleIndicatorStyle={{ backgroundColor: theme.ring }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1}
        pressBehavior={locked ? "none" : "close"} />}>
      <BottomSheetScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: spacing.sm, gap: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }}>
        <Header title={title} />
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
