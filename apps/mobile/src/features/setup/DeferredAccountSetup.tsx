import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../../i18n";
import { PrimaryButton, SecondaryButton, useUi } from "../../ui/core";
import type { AccountSetupRequest } from "../categories/model";
import { AccountSetupForm } from "../posting/AccountSetupForm";
import { usePostingEditor } from "../posting/usePostingEditor";
import { usePostingTransport } from "../posting/usePostingTransport";
import { defaultAccountingDate } from "../timeZones";
import { openAmount } from "../amount/session";

export function DeferredAccountSetup({ request, subject, workspaceId, profileId, currency, timeZone, onDone }: {
  request: AccountSetupRequest;
  subject: string;
  workspaceId: string;
  profileId: string;
  currency: string;
  timeZone: string;
  onDone: () => void;
}) {
  const ui = useUi();
  const { t } = useT();
  const transport = usePostingTransport(subject);
  const isolated = useMemo(() => ({ ...transport, load: () => transport.load(undefined, false) }), [transport]);
  const editor = usePostingEditor({ workspaceId, financialAccountProfileId: profileId,
    currency, timeZone }, isolated);
  const sheet = useRef<BottomSheetModal>(null);
  const started = useRef(false);
  const presented = useRef(false);
  const done = useRef(false);
  const submitted = useRef(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (editor.setupPosted && !done.current) {
      done.current = true;
      sheet.current?.dismiss();
      onDone();
      return;
    }
    if (editor.editable && !started.current) {
      started.current = true;
      editor.setSetup({ name: request.name, emoji: request.style.emoji,
        productKind: request.answer === "payDebt" ? null : "bankAccount",
        amount: openAmount(currency, "0"), date: defaultAccountingDate(timeZone), target: { kind: "source" } });
    }
    if (editor.setup && !presented.current) {
      presented.current = true;
      sheet.current?.present();
    }
  }, [editor, onDone, request, timeZone, currency]);
  function finish() {
    if (done.current || submitted.current || editor.loading) return;
    done.current = true;
    sheet.current?.dismiss();
    onDone();
  }
  return <View style={ui.section}>
    <Text style={ui.body}>{t("setup.deferredAdd", { name: request.name })}</Text>
    {editor.blockedByPendingPostings && <Text accessibilityRole="alert" style={ui.error}>{t("setup.deferredBlocked")}</Text>}
    {closed && <PrimaryButton label={t("setup.deferredContinue")} onPress={() => { setClosed(false); sheet.current?.present(); }} />}
    {!submitted.current && !editor.pending && !editor.busy && !editor.loading &&
      <SecondaryButton label={t("setup.deferredLater")} onPress={finish} />}
    <AccountSetupForm sheetRef={sheet} value={editor.setup} currency={currency}
      editable={editor.editable} busy={editor.busy} pending={editor.pending} error={editor.error}
      canSubmit={editor.canSubmit} onChange={editor.setSetup} onSubmit={() => {
        if (!editor.canSubmit) return;
        submitted.current = true;
        void editor.submit();
      }}
      onDismiss={() => { if (!done.current) setClosed(true); }} />
  </View>;
}
