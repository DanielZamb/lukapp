import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, Text } from "react-native";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { Header, SecondaryButton, ui } from "../ui/core";
import { spacing } from "../ui/tokens";
import type { usePersonalDefaults } from "./activity";
import { localDate } from "./money";
import { AccountSetupForm } from "./posting/AccountSetupForm";
import { usePostingEditor } from "./posting/usePostingEditor";
import { usePostingTransport } from "./posting/usePostingTransport";
import { defaultAccountingDate } from "./timeZones";

export function HomePlaceSetup({ defaults, subject, onClose }: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
  onClose: () => void;
}) {
  const { workspace, financialAccountProfile } = defaults;
  const transport = usePostingTransport(subject);
  const setupTransport = useMemo(() => ({
    ...transport,
    load: () => transport.load(undefined, false),
  }), [transport]);
  const editor = usePostingEditor({
    workspaceId: workspace.id,
    financialAccountProfileId: financialAccountProfile.id,
    currency: workspace.functionalCurrency === "USD" ? "USD" : "COP",
    timeZone: workspace.timeZone,
  }, setupTransport);
  const interact = useLocalEntryInteraction();
  const sheet = useRef<BottomSheetModal>(null);
  const dateSheet = useRef<BottomSheetModal>(null);
  const started = useRef(false);
  const presented = useRef(false);
  useEffect(() => {
    if (editor.blockedByPendingPostings) {
      onClose();
      router.push("/drafts");
      return;
    }
    if (editor.posted) {
      sheet.current?.dismiss();
      onClose();
      return;
    }
    if (editor.editable && !started.current) {
      started.current = true;
      editor.setSetup({
        name: "",
        productKind: "bankAccount",
        amount: "0",
        date: defaultAccountingDate(workspace.timeZone),
        target: { kind: "source" },
      });
    }
    if (editor.setup && !presented.current) {
      presented.current = true;
      sheet.current?.present();
    }
  }, [editor, onClose, workspace.timeZone]);
  const setup = editor.setup;
  return (
    <>
      {editor.loading && <ActivityIndicator accessibilityLabel="Loading place setup" />}
      {!setup && !!editor.error && (
        <>
          <Text accessibilityRole="alert" style={ui.error}>{editor.error}</Text>
          <SecondaryButton label="Close place setup" onPress={onClose} />
        </>
      )}
      <AccountSetupForm
        sheetRef={sheet}
        value={setup}
        currency={workspace.functionalCurrency}
        editable={editor.editable}
        busy={editor.busy}
        pending={editor.pending}
        error={editor.error}
        canSubmit={editor.canSubmit}
        onChange={(value) => { interact(); editor.setSetup(value); }}
        onDate={() => { interact(); dateSheet.current?.present(); }}
        onSubmit={() => { interact(); void editor.submit(); }}
        onDismiss={onClose}
      />
      <BottomSheetModal ref={dateSheet} snapPoints={["55%"]} enableDynamicSizing={false}>
        <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xxl }}>
          <Header title="Starting date" />
          {setup && <DateTimePicker
            value={new Date(`${setup.date}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, selected) => {
              interact();
              if (selected) editor.setSetup({ ...setup, date: localDate(selected) });
              if (Platform.OS !== "ios") dateSheet.current?.dismiss();
            }}
          />}
          <SecondaryButton label="Done" onPress={() => dateSheet.current?.dismiss()} />
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
