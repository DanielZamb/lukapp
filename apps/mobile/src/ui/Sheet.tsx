import type { Theme } from "./tokens";
import { BottomSheetBackdrop, BottomSheetFooter, BottomSheetScrollView, type BottomSheetFooterProps } from "@gorhom/bottom-sheet";
import { useMemo, useRef, useCallback, type PropsWithChildren, type ReactNode, type ComponentProps } from "react";
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View, Text as NativeText } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SecondaryButton, useTheme } from "./core";
import { Text } from "./Text";
import { useTier } from "./themeContext";
import type { LayoutTier } from "./layout";
import { radius, spacing, xxxl } from "./tokens";
import { SheetModal, type NativeSheetProps, type SheetRef } from "./SheetModal";

type SharedSheetProps = PropsWithChildren<{
  sheetRef?: SheetRef;
  presentOnMount?: boolean;
  onClose?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  androidBack?: boolean;
  nativeModalProps?: NativeSheetProps;
}>;

type ManagedBody = {
  body?: "scroll";
  label: string;
  tall?: boolean;
  footer?: ReactNode;
  stickyHeader?: boolean;
  scrollProps?: Omit<ComponentProps<typeof BottomSheetScrollView>, "children">;
};
type NativeBody = { body: "native"; label?: string; tall?: never; footer?: never; stickyHeader?: never; scrollProps?: never };
export type SheetProps = SharedSheetProps & (ManagedBody | NativeBody);

export function sheetPresentation(tier: LayoutTier, tall = false) {
  return tier === "xxxl" && tall ? "page" : "sheet";
}

export function Sheet(props: SheetProps) {
  const { children, onClose, onDismiss, label, body = "scroll", sheetRef, presentOnMount = !sheetRef, busy = false, nativeModalProps, tall, footer, stickyHeader, scrollProps } = props;
  const theme = useTheme();
  const tier = useTier();
  const page = sheetPresentation(tier, tall) === "page";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const ownRef = useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const modal = sheetRef ?? ownRef;
  const title = useRef<NativeText>(null);
  const insets = useSafeAreaInsets();
  const close = useCallback(() => { if (!busy) modal.current?.dismiss(); }, [busy, modal]);
  const focusTitle = useCallback(() => {
    if (!page || !title.current) return;
    const tag = findNodeHandle(title.current);
    if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag);
  }, [page]);
  const renderFooter = useCallback((footerProps: BottomSheetFooterProps) => <BottomSheetFooter {...footerProps} bottomInset={insets.bottom}>
    <View style={[styles.footer, { backgroundColor: theme.background }]}>{footer}</View>
  </BottomSheetFooter>, [footer, insets.bottom, styles, theme.background]);

  const defaults: NativeSheetProps = body === "native" ? {} : {
    accessibilityLabel: label,
    enablePanDownToClose: true,
    enableDynamicSizing: true,
    backgroundStyle: styles.surface,
    handleIndicatorStyle: { backgroundColor: theme.ring },
    backdropComponent: (backdropProps) => <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={busy ? "none" : "close"} />,
  };
  return <SheetModal {...defaults} {...nativeModalProps} sheetRef={modal} presentOnMount={presentOnMount}
    busy={busy} androidBack={props.androidBack ?? body !== "native"}
    {...(tier === "xxxl" && body !== "native" && { backgroundStyle: [styles.surface, { borderTopLeftRadius: xxxl.radius.sheet, borderTopRightRadius: xxxl.radius.sheet }] })}
    {...(page && {
      snapPoints: ["100%"], topInset: insets.top, enableDynamicSizing: false,
      enablePanDownToClose: false, handleComponent: null,
      keyboardBehavior: "interactive", keyboardBlurBehavior: "restore", android_keyboardInputMode: "adjustResize",
      footerComponent: footer ? renderFooter : undefined,
      androidBack: true,
      onChange: (...args) => { nativeModalProps?.onChange?.(...args); if (args[0] >= 0) focusTitle(); },
    })}
    onDismiss={() => { nativeModalProps?.onDismiss?.(); onClose?.(); onDismiss?.(); }}>
    {body === "native" ? children : <>
      {page && <View style={styles.titleRow} accessibilityViewIsModal importantForAccessibility="yes">
        <Text ref={title} variant="section" accessibilityRole="header" style={{ flex: 1 }} onLayout={focusTitle}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={close} style={styles.close}>
          <Text variant="action" accessible={false}>×</Text>
        </Pressable>
      </View>}
      <BottomSheetScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }, ...(page ? [{ paddingHorizontal: xxxl.spacing.pagePadding }] : [])]}
        {...scrollProps}
        {...(stickyHeader !== undefined && { stickyHeaderIndices: stickyHeader ? [0] : undefined })}
        {...(page && { enableFooterMarginAdjustment: true })}>
        {children}
        {!page && footer}
        {!page && <SecondaryButton label="Close details" onPress={close} />}
      </BottomSheetScrollView>
    </>}
  </SheetModal>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    surface: {
      backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      borderWidth: 1, borderColor: theme.border,
    },
    body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, gap: spacing.md },
    titleRow: { minHeight: xxxl.controls.touchTarget, flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg },
    close: { minWidth: xxxl.controls.touchTarget, minHeight: xxxl.controls.touchTarget, alignItems: "center", justifyContent: "center" },
    footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: theme.border },
  });
}
