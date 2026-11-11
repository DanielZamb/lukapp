import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { BackHandler, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { PrimaryButton, useTheme, useUi } from "../../ui/core";
import { usePlaceStyles } from "./styles";
import { usePlaceRename, type PlaceRenameTransport } from "./usePlaceRename";

type BackdropProps = Parameters<typeof BottomSheetBackdrop>[0];
const ClosingBackdrop = (props: BackdropProps) =>
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />;
const HeldBackdrop = (props: BackdropProps) =>
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="none" />;

export function RenameSheet({ seed, rename, onDismiss }: {
  seed: Parameters<typeof usePlaceRename>[0];
  rename: PlaceRenameTransport["rename"];
  onDismiss: () => void;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { t } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const form = usePlaceRename(seed, { rename, reportFailure, onRenamed: () => sheet.current?.dismiss() });
  const dismissible = useRef(form.canDismiss);
  dismissible.current = form.canDismiss;
  useEffect(() => { sheet.current?.present(); }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissible.current) sheet.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, []);
  const save = () => {
    interact();
    void form.submit();
  };
  return <BottomSheetModal ref={sheet} stackBehavior="push" enableDynamicSizing enablePanDownToClose={form.canDismiss}
    onDismiss={onDismiss} accessibilityLabel={t("planning.renameTitle")}
    backdropComponent={form.canDismiss ? ClosingBackdrop : HeldBackdrop}
    backgroundStyle={styles.sheetSurface} handleIndicatorStyle={{ backgroundColor: theme.ring }}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore">
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
      <View style={styles.field}>
        <Text style={ui.label}>{t("planning.renameEyebrow")}</Text>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{t("planning.renameTitle")}</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t("planning.renameLabel")}</Text>
        <BottomSheetTextInput accessibilityLabel={t("planning.renameA11y")} value={form.name} editable={form.editable}
          onChangeText={(value) => { interact(); form.onName(value); }} onSubmitEditing={save} returnKeyType="done"
          autoCapitalize="sentences" style={styles.input} />
      </View>
      <Text style={styles.muted}>{t("planning.renameHelp")}</Text>
      {!!form.error && <Text accessibilityRole="alert" style={ui.error}>{form.error}</Text>}
      <PrimaryButton
        label={form.busy ? t("planning.renameSaving") : form.pending ? t("planning.renameRetry") : t("planning.renameSave")}
        trailingIcon="checkmark" pending={form.busy} disabled={!form.canSubmit} onPress={save} />
    </BottomSheetScrollView>
  </BottomSheetModal>;
}
