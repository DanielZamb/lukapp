import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler } from "react-native";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref">;
export type SheetRef = RefObject<BottomSheetModal | null>;

export function SheetModal({ sheetRef, presentOnMount, androidBack, busy, children, onDismiss, onChange, accessibilityLabel, enablePanDownToClose, enableDynamicSizing, ...props }: PropsWithChildren<NativeSheetProps & {
  sheetRef: SheetRef;
  presentOnMount: boolean;
  androidBack: boolean;
  busy: boolean;
}>) {
  const [open, setOpen] = useState(presentOnMount);
  const lock = useRef(busy);
  lock.current = busy;
  useEffect(() => { if (presentOnMount) sheetRef.current?.present(); }, [presentOnMount, sheetRef]);
  useEffect(() => {
    if (!androidBack || !open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!lock.current) sheetRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [androidBack, open, sheetRef]);
  return <BottomSheetModal ref={sheetRef} accessibilityLabel={accessibilityLabel}
    enablePanDownToClose={busy ? false : enablePanDownToClose} enableDynamicSizing={enableDynamicSizing}
    onDismiss={() => { setOpen(false); onDismiss?.(); }} {...props}
    {...((!presentOnMount || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => { setOpen(args[0] >= 0); onChange?.(...args); } })}
    {...(busy && { enablePanDownToClose: false, enableContentPanningGesture: false, enableHandlePanningGesture: false, backdropComponent: (backdropProps) => <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="none" /> })}>
    {children}
  </BottomSheetModal>;
}
