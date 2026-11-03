import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useSheetAccessibility } from "./SheetAccessibility";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref">;
export type SheetRef = RefObject<BottomSheetModal | null>;
export type SheetPresentation =
  | { sheetRef?: never; presentOnMount?: true }
  | { sheetRef: SheetRef; presentOnMount?: boolean };

type Presentation =
  | { kind: "idle" | "hidden" | "opening" | "open" | "closing" }
  | { kind: "waitingToClose"; args: Parameters<BottomSheetModal["dismiss"]> };

export function SheetModal({ sheetRef, presentOnMount, trackPresentation, androidBack, busy, dismissible = true,
  children, onDismiss, onChange, accessibilityLabel, enablePanDownToClose, enableDynamicSizing, backdropComponent: Backdrop, ...props
}: PropsWithChildren<NativeSheetProps & {
  sheetRef: SheetRef;
  presentOnMount: boolean;
  trackPresentation: boolean;
  androidBack: boolean;
  busy: boolean;
  dismissible?: boolean;
}>) {
  const [open, setOpen] = useState(presentOnMount);
  const [nativeVersion, setNativeVersion] = useState(0);
  const version = useRef(0);
  const committedVersion = useRef(0);
  const pendingPresent = useRef<Parameters<BottomSheetModal["present"]> | null>(null);
  const mounted = useRef(true);
  const recovery = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyDismiss = useRef(onDismiss);
  notifyDismiss.current = onDismiss;
  const native = useRef<BottomSheetModal>(null);
  const presentation = useRef<Presentation>({ kind: "idle" });
  const backEnabled = useRef(androidBack);
  backEnabled.current = androidBack;
  const id = useRef(Symbol("sheet"));
  const { setPresented } = useSheetAccessibility();
  const locked = busy || !dismissible;
  const lock = useRef(locked);
  lock.current = locked;
  function cancelRecovery() {
    if (recovery.current !== null) clearTimeout(recovery.current);
    recovery.current = null;
  }
  function settleClose() {
    if (presentation.current.kind === "hidden") return;
    presentation.current = { kind: "hidden" };
    pendingPresent.current = null;
    cancelRecovery();
    if (mounted.current) setOpen(false);
    notifyDismiss.current?.();
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingPresent.current = null;
      if (presentation.current.kind === "waitingToClose" || presentation.current.kind === "closing") settleClose();
      else cancelRecovery();
    };
  }, []);
  useImperativeHandle(sheetRef, () => ({
    present: (...args) => {
      const { kind } = presentation.current;
      if (backEnabled.current && (kind === "waitingToClose" || kind === "closing")) return;
      if (kind !== "open") presentation.current = { kind: "opening" };
      setOpen(true);
      if (version.current !== committedVersion.current) pendingPresent.current = args;
      else native.current?.present(...args);
    },
    dismiss: (...args) => {
      const { kind } = presentation.current;
      if (backEnabled.current) {
        if (kind === "hidden" || kind === "closing" || kind === "waitingToClose") return;
        if (kind === "opening") {
          presentation.current = { kind: "waitingToClose", args };
          recovery.current = setTimeout(() => {
            version.current += 1;
            setNativeVersion(version.current);
            native.current?.dismiss(...args);
            settleClose();
          }, 1000);
          return;
        }
      }
      presentation.current = { kind: "closing" };
      native.current?.dismiss(...args);
    },
    snapToIndex: (...args) => native.current?.snapToIndex(...args),
    snapToPosition: (...args) => native.current?.snapToPosition(...args),
    expand: (...args) => native.current?.expand(...args),
    collapse: (...args) => native.current?.collapse(...args),
    close: (...args) => native.current?.close(...args),
    forceClose: (...args) => native.current?.forceClose(...args),
  }), [sheetRef]);
  useLayoutEffect(() => {
    committedVersion.current = nativeVersion;
    const args = pendingPresent.current;
    pendingPresent.current = null;
    if (args !== null) native.current?.present(...args);
  }, [nativeVersion]);
  useEffect(() => {
    if (presentOnMount) {
      sheetRef.current?.present();
      setOpen(true);
    }
  }, [presentOnMount, sheetRef]);
  useEffect(() => {
    const key = id.current;
    setPresented(key, open);
    return () => setPresented(key, false);
  }, [open, setPresented]);
  useEffect(() => {
    if (!androidBack || !open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!lock.current) sheetRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [androidBack, open, sheetRef]);
  const backdropComponent: NativeSheetProps["backdropComponent"] = locked && Backdrop ? (backdropProps) =>
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="box-only" importantForAccessibility="no-hide-descendants">
      <Backdrop {...backdropProps} />
    </View> : Backdrop;
  return <BottomSheetModal key={nativeVersion} ref={native} accessibilityLabel={accessibilityLabel}
    enablePanDownToClose={locked ? false : enablePanDownToClose} enableDynamicSizing={enableDynamicSizing}
    onDismiss={() => {
      if (!mounted.current || nativeVersion !== version.current) return;
      settleClose();
    }} {...props} backdropComponent={backdropComponent}
    {...((androidBack || trackPresentation || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => {
      if (!mounted.current || nativeVersion !== version.current) return;
      const current = presentation.current;
      if (args[0] >= 0) {
        cancelRecovery();
        if (current.kind === "waitingToClose") {
          presentation.current = { kind: "closing" };
        } else if (current.kind !== "closing") presentation.current = { kind: "open" };
      }
      setOpen(args[0] >= 0 || presentation.current.kind === "opening" || presentation.current.kind === "waitingToClose" || presentation.current.kind === "closing");
      onChange?.(...args);
      if (args[0] >= 0 && current.kind === "waitingToClose") native.current?.dismiss(...current.args);
    } })}
    {...(busy && { enableHandlePanningGesture: false })}>
    {children}
  </BottomSheetModal>;
}
