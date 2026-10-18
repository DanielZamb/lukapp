import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { ReactNode, RefObject } from "react";
import { StyleSheet } from "react-native";
import { theme } from "./core";
import { font, radius, spacing, touchTarget } from "./tokens";

function renderBackdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />;
}

export function PickerSheet({
  sheetRef,
  busy = false,
  stickyHeader = true,
  onDismiss,
  children,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  busy?: boolean;
  stickyHeader?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["70%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={!busy}
      enableContentPanningGesture={!busy}
      backgroundStyle={pickerSheetStyles.surface}
      handleIndicatorStyle={{ backgroundColor: theme.ring }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={pickerSheetStyles.content}
        stickyHeaderIndices={stickyHeader ? [0] : undefined}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export const pickerSheetStyles = StyleSheet.create({
  surface: {
    backgroundColor: theme.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
  },
  content: { paddingHorizontal: spacing.xxl, paddingBottom: 44, gap: spacing.lg },
  title: { color: theme.foreground, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold, letterSpacing: -0.6 },
  search: { backgroundColor: theme.background, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  input: { minHeight: touchTarget, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring, backgroundColor: theme.secondary },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingVertical: spacing.sm },
  rowName: { flex: 1, fontFamily: font.semibold },
  addDisc: { width: touchTarget, height: touchTarget, borderRadius: radius.full, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, backgroundColor: theme.secondary, alignItems: "center", justifyContent: "center" },
});
