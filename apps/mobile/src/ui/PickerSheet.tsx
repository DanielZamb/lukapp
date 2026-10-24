import { useMemo, useRef } from "react";
import type { Theme } from "./tokens";
import {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { ReactNode, ComponentProps } from "react";
import { SheetModal, type NativeSheetProps, type SheetRef } from "./SheetModal";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./core";
import { useReadableLayout } from "./themeContext";
import type { ReadableLayout } from "./layout";
import { font, radius, spacing, touchTarget, xxxl } from "./tokens";

export function PickerSheet({
  sheetRef,
  busy = false,
  stickyHeader = true,
  onDismiss,
  children,
  presentOnMount, nativeModalProps, scrollProps, androidBack = false,
}: {
  sheetRef?: SheetRef;
  presentOnMount?: boolean;
  nativeModalProps?: NativeSheetProps;
  scrollProps?: Omit<ComponentProps<typeof BottomSheetScrollView>, "children">;
  androidBack?: boolean;
  busy?: boolean;
  stickyHeader?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const ownRef = useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const modal = sheetRef ?? ownRef;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useReadableLayout();
  const pickerSheetStyles = usePickerSheetStyles();
  return (
    <SheetModal
      sheetRef={modal}
      presentOnMount={presentOnMount ?? !sheetRef}
      busy={busy}
      androidBack={androidBack}
      topInset={insets.top}
      snapPoints={[layout.reflow ? "92%" : "70%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={!busy}
      enableContentPanningGesture={!busy}
      backgroundStyle={pickerSheetStyles.surface}
      handleIndicatorStyle={{ backgroundColor: theme.ring }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={(props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props}
        appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={busy ? "none" : "close"} />}
      {...nativeModalProps}
      onDismiss={() => { nativeModalProps?.onDismiss?.(); onDismiss?.(); }}
    >
      <BottomSheetScrollView
        accessibilityViewIsModal
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[pickerSheetStyles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }]}
        stickyHeaderIndices={stickyHeader ? [0] : undefined}
        {...scrollProps}
      >
        {children}
      </BottomSheetScrollView>
    </SheetModal>
  );
}

function createPickerSheetStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    surface: {
      backgroundColor: theme.background,
      borderTopLeftRadius: layout.tier === "xxxl" ? xxxl.radius.sheet : radius.xl,
      borderTopRightRadius: layout.tier === "xxxl" ? xxxl.radius.sheet : radius.xl,
      borderWidth: 1,
      borderColor: theme.border,
    },
    content: { paddingHorizontal: layout.pagePadding, paddingBottom: 44, gap: spacing.lg },
    title: { color: theme.foreground, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold, letterSpacing: -0.6 },
    search: { backgroundColor: theme.background, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
    input: { minHeight: touchTarget, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring, backgroundColor: theme.secondary },
    row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingVertical: spacing.sm },
    rowName: { flex: 1, minWidth: 0, fontFamily: font.semibold },
    addDisc: { width: touchTarget, height: touchTarget, borderRadius: radius.full, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, backgroundColor: theme.secondary, alignItems: "center", justifyContent: "center" },
  });
}

export function usePickerSheetStyles() {
  const theme = useTheme();
  const layout = useReadableLayout();
  return useMemo(() => createPickerSheetStyles(theme, layout), [theme, layout]);
}
