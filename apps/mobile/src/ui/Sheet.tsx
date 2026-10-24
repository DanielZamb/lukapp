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
import { SheetModal, type NativeSheetProps, type SheetRef, type SheetPresentation } from "./SheetModal";

type DismissNotification = { onClose: () => void; onDismiss?: never } | { onDismiss?: () => void; onClose?: never };

type SharedSheetProps = PropsWithChildren<SheetPresentation & DismissNotification & {
  busy?: boolean;
  dismissible?: boolean;
  androidBack?: boolean;
  nativeModalProps?: NativeSheetProps;
}>;

type ManagedBody = {
  body?: "scroll";
  label: string;
  tall?: boolean;
  footer?: ReactNode;
  closeLabel?: string | false;
  stickyHeader?: boolean;
  scrollProps?: Omit<ComponentProps<typeof BottomSheetScrollView>, "children">;
};
type NativeBody = { body: "native"; label?: string; tall?: never; footer?: never; closeLabel?: never; stickyHeader?: never; scrollProps?: never };
export type SheetProps = SharedSheetProps & (ManagedBody | NativeBody);

export function sheetPresentation(tier: LayoutTier, tall = false) {
  return tier === "xxxl" && tall ? "page" : "sheet";
}

export function Sheet(props: SheetProps) {
  const { children, onClose, onDismiss, label, body = "scroll", sheetRef, presentOnMount = !sheetRef, busy = false, dismissible = true, nativeModalProps, tall, footer, closeLabel = "Close details", stickyHeader, scrollProps } = props;
  const theme = useTheme();
  const tier = useTier();
  const page = sheetPresentation(tier, tall) === "page";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const ownRef = useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const modal = sheetRef ?? ownRef;
  const title = useRef<NativeText>(null);
  const readyToFocus = useRef(false);
  const focused = useRef(false);
  const insets = useSafeAreaInsets();
  const close = useCallback(() => { if (!busy && dismissible) modal.current?.dismiss(); }, [busy, dismissible, modal]);
  const focusTitle = useCallback(() => {
    if (!page || !readyToFocus.current || focused.current || !title.current) return;
    const tag = findNodeHandle(title.current);
    if (tag !== null) {
      AccessibilityInfo.setAccessibilityFocus(tag);
      focused.current = true;
    }
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
  return <SheetModal {...defaults} {...nativeModalProps} sheetRef={modal} presentOnMount={presentOnMount} trackPresentation={!!sheetRef}
    busy={busy} dismissible={dismissible} androidBack={props.androidBack ?? body !== "native"}
    {...(tier === "xxxl" && body !== "native" && { backgroundStyle: [styles.surface, { borderTopLeftRadius: xxxl.radius.sheet, borderTopRightRadius: xxxl.radius.sheet }] })}
    {...(page && {
      containerComponent: PageContainer, accessible: false,
      snapPoints: ["100%"], topInset: insets.top, enableDynamicSizing: false,
      enablePanDownToClose: false, handleComponent: null,
      keyboardBehavior: "interactive", keyboardBlurBehavior: "restore", android_keyboardInputMode: "adjustPan",
      footerComponent: footer ? renderFooter : undefined,
      androidBack: true,
      onChange: (...args) => {
        nativeModalProps?.onChange?.(...args);
        readyToFocus.current = args[0] >= 0;
        if (!readyToFocus.current) focused.current = false;
        focusTitle();
      },
    })}
    onDismiss={() => { readyToFocus.current = false; focused.current = false; nativeModalProps?.onDismiss?.(); onClose?.(); onDismiss?.(); }}>
    {body === "native" ? children : <>
      {page && <View style={styles.titleRow}>
        <Text ref={title} variant="section" accessibilityRole="header" style={{ flex: 1 }} onLayout={focusTitle}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} accessibilityState={{ disabled: busy || !dismissible }} disabled={busy || !dismissible} onPress={close} style={styles.close}>
          <Text variant="action" accessible={false}>×</Text>
        </Pressable>
      </View>}
      <BottomSheetScrollView accessibilityViewIsModal={page ? undefined : true} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }, ...(page ? [{ paddingHorizontal: xxxl.spacing.pagePadding }] : [])]}
        {...scrollProps}
        {...(stickyHeader !== undefined && { stickyHeaderIndices: stickyHeader ? [0] : undefined })}
        {...(page && { enableFooterMarginAdjustment: true })}>
        {children}
        {!page && footer}
        {!page && closeLabel !== false && <SecondaryButton label={closeLabel} onPress={close} disabled={busy || !dismissible || undefined} />}
      </BottomSheetScrollView>
    </>}
  </SheetModal>;
}

function PageContainer({ children }: PropsWithChildren) {
  return <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="box-none" accessible={false} accessibilityViewIsModal importantForAccessibility="no">{children}</View>;
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
