import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { BackHandler, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, PrimaryButton, SecondaryButton, useTheme, useUi } from "./core";
import { spacing } from "./tokens";

export type ConfirmSheetAction = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "danger";
};

/**
 * A decision sheet. System Back, the backdrop and a pan down dismiss it before anything behind it,
 * except while `busy`, when the choice in flight must finish first.
 */
export function ConfirmSheet({ label, title, detail, body, actions, busy = false, error, onDismiss }: {
  label: string;
  title: string;
  detail?: string;
  body: string;
  actions: ConfirmSheetAction[];
  busy?: boolean;
  error?: string;
  onDismiss: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const modal = useRef<BottomSheetModal>(null);
  const busyNow = useRef(busy);
  busyNow.current = busy;
  useEffect(() => { modal.current?.present(); }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busyNow.current) modal.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, []);
  return (
    <BottomSheetModal ref={modal} accessibilityLabel={label} enableDynamicSizing enablePanDownToClose={!busy}
      onDismiss={onDismiss} backgroundStyle={{ backgroundColor: theme.background }}
      handleIndicatorStyle={{ backgroundColor: theme.ring }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1}
        pressBehavior={busy ? "none" : "close"} />}>
      <BottomSheetScrollView accessibilityViewIsModal keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, gap: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }}>
        <Header title={title} />
        {detail ? <Text style={ui.body}>{detail}</Text> : null}
        <Text style={ui.muted}>{body}</Text>
        {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
        {actions.map((action) => action.tone === "primary"
          ? <PrimaryButton key={action.label} label={action.label} disabled={busy} trailingIcon="checkmark" onPress={action.onPress} />
          : <SecondaryButton key={action.label} label={action.label} disabled={busy} tone={action.tone} onPress={action.onPress} />)}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
