import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useSheetAccessibility } from "./SheetAccessibility";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref" | "enableDismissOnClose"> & {
  /** Disabling native onDismiss completion with enableDismissOnClose:false is unsupported. */
  enableDismissOnClose?: true;
};
export type SheetRef = RefObject<BottomSheetModal | null>;
export type SheetPresentation =
  | { sheetRef?: never; presentOnMount?: true }
  | { sheetRef: SheetRef; presentOnMount?: boolean };

type Presentation =
  | { kind: "closed"; completed: boolean }
  | { kind: "opening"; pendingClose: Parameters<BottomSheetModal["dismiss"]> | null }
  | { kind: "open" }
  | { kind: "closing" };

type PresentationEvent =
  | { type: "present"; args: Parameters<BottomSheetModal["present"]> }
  | { type: "dismiss"; args: Parameters<BottomSheetModal["dismiss"]> }
  | { type: "index"; args: Parameters<NonNullable<NativeSheetProps["onChange"]>> }
  | { type: "dismissed" | "timeout" | "unmount" };

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
  const [phase, setPhase] = useState<Presentation>(presentOnMount ? { kind: "opening", pendingClose: null } : { kind: "closed", completed: false });
  const [nativeVersion, setNativeVersion] = useState(0);
  const version = useRef(0);
  const committedVersion = useRef(0);
  const pendingPresent = useRef<Parameters<BottomSheetModal["present"]> | null>(null);
  const mounted = useRef(true);
  const recovery = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyDismiss = useRef(onDismiss);
  notifyDismiss.current = onDismiss;
  const native = useRef<BottomSheetModal>(null);
  const presentation = useRef(phase);
  const open = phase.kind !== "closed";
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
  function transition(next: Presentation) {
    presentation.current = next;
    if (mounted.current) setPhase(next);
  }
  function settleClose() {
    const current = presentation.current;
    if (current.kind === "closed" && current.completed) return;
    transition({ kind: "closed", completed: true });
    pendingPresent.current = null;
    cancelRecovery();
    notifyDismiss.current?.();
  }
  function recoverClose(args: Parameters<BottomSheetModal["dismiss"]>) {
    version.current += 1;
    setNativeVersion(version.current);
    native.current?.dismiss(...args);
    settleClose();
  }
  function send(event: PresentationEvent): void {
    const current = presentation.current;
    switch (event.type) {
      case "present":
        if (!mounted.current) return;
        cancelRecovery();
        if (current.kind === "closed" || current.kind === "opening") transition({ kind: "opening", pendingClose: null });
        else transition({ kind: "open" });
        if (version.current !== committedVersion.current) pendingPresent.current = event.args;
        else native.current?.present(...event.args);
        return;
      case "dismiss":
        if (!mounted.current) return;
        if (backEnabled.current) {
          if (current.kind === "closed" && current.completed) return;
          if (current.kind === "opening") {
            if (current.pendingClose !== null) return;
            transition({ kind: "opening", pendingClose: event.args });
            recovery.current = setTimeout(() => send({ type: "timeout" }), 1000);
            return;
          }
        }
        transition({ kind: "closing" });
        native.current?.dismiss(...event.args);
        return;
      case "index": {
        if (event.args[0] >= 0 && (current.kind === "opening" || (current.kind === "closed" && !current.completed))) {
          cancelRecovery();
          if (current.kind === "opening" && current.pendingClose !== null) transition({ kind: "closing" });
          else transition({ kind: "open" });
        }
        onChange?.(...event.args);
        if (event.args[0] >= 0 && current.kind === "opening" && current.pendingClose !== null) native.current?.dismiss(...current.pendingClose);
        return;
      }
      case "dismissed":
        settleClose();
        return;
      case "timeout":
        if (current.kind === "opening" && current.pendingClose !== null) recoverClose(current.pendingClose);
        return;
      case "unmount":
        mounted.current = false;
        pendingPresent.current = null;
        cancelRecovery();
        if (current.kind === "closing" || (current.kind === "opening" && current.pendingClose !== null)) settleClose();
        return;
    }
    const unhandled: never = event;
    return unhandled;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      send({ type: "unmount" });
    };
  }, []);
  useImperativeHandle(sheetRef, () => ({
    present: (...args) => send({ type: "present", args }),
    dismiss: (...args) => send({ type: "dismiss", args }),
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
      send({ type: "dismissed" });
    }} {...props} backdropComponent={backdropComponent}
    {...((androidBack || trackPresentation || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => {
      if (!mounted.current || nativeVersion !== version.current) return;
      send({ type: "index", args });
    } })}
    {...(busy && { enableHandlePanningGesture: false })}>
    {children}
  </BottomSheetModal>;
}
