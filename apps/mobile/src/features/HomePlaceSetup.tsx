import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { PrimaryButton, SecondaryButton, useTheme, useUi } from "../ui/core";
import type { usePersonalDefaults } from "./activity";
import { useLevelNavigation } from "./levelDoor/navigation";
import { EmojiSheet } from "./places/EmojiSheet";
import { kindDetails, placeKinds, type PlaceKind } from "./places/model";
import { AmountField } from "./amount/AmountField";
import { openAmount, type AmountSession } from "./amount/session";
import { usePlaceStyles } from "./places/styles";
import { usePostingEditor } from "./posting/usePostingEditor";
import { usePostingTransport } from "./posting/usePostingTransport";
import { useT, type MessageKey } from "../i18n";
import { defaultAccountingDate } from "./timeZones";

const kindLabels: Record<PlaceKind, MessageKey> = {
  Checking: "home.placeKindChecking", Savings: "home.placeKindSavings",
  DigitalWallet: "home.placeKindDigitalWallet", Cash: "home.placeKindWallet",
};

export function HomePlaceSetup({ defaults, subject, unlocking, onClose }: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
  unlocking: boolean;
  onClose: () => void;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { t } = useT();
  const { workspace, financialAccountProfile } = defaults;
  const transport = usePostingTransport(subject);
  const setupTransport = useMemo(() => ({ ...transport, load: () => transport.load(undefined, false) }), [transport]);
  const editor = usePostingEditor({
    workspaceId: workspace.id, financialAccountProfileId: financialAccountProfile.id,
    currency: workspace.functionalCurrency, timeZone: workspace.timeZone,
  }, setupTransport);
  const interact = useLocalEntryInteraction();
  const sheet = useRef<BottomSheetModal>(null);
  const started = useRef(false);
  const presented = useRef(false);
  const finished = useRef(false);
  const unlockingSave = useRef<boolean | null>(null);
  const { showUnlocked } = useLevelNavigation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlaceKind>("Savings");
  const [emojiChanged, setEmojiChanged] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  useEffect(() => {
    if (finished.current) return;
    if (editor.blockedByPendingPostings) {
      finished.current = true; onClose(); router.push("/drafts"); return;
    }
    if (editor.setupPosted) {
      finished.current = true; sheet.current?.dismiss(); onClose();
      if (unlockingSave.current) showUnlocked({ door: "account", accountName: editor.setupPosted.description });
      return;
    }
    if (editor.editable && !started.current) {
      started.current = true;
      editor.setSetup({ name: t("home.addPlaceDefaultName"), productKind: "savingsAccount", emoji: "🏦",
        amount: openAmount(workspace.functionalCurrency, "0"), date: defaultAccountingDate(workspace.timeZone), target: { kind: "source" } });
    }
    if (editor.setup && !presented.current) {
      presented.current = true; sheet.current?.present();
    }
  }, [editor, onClose, showUnlocked, t, workspace.timeZone, workspace.functionalCurrency]);
  const setup = editor.setup;
  function pickKind(next: PlaceKind) {
    if (!setup || !editor.editable) return;
    interact(); setKind(next);
    editor.setSetup({ ...setup, productKind: kindDetails[next].productKind,
      emoji: emojiChanged ? setup.emoji : kindDetails[next].emoji });
  }
  return <>
    {editor.loading && <ActivityIndicator accessibilityLabel={t("home.addPlaceLoading")} />}
    {!setup && !!editor.error && <>
      <Text accessibilityRole="alert" style={ui.error}>{editor.error}</Text>
      <SecondaryButton label={t("home.addPlaceClose")} onPress={onClose} />
    </>}
    <BottomSheetModal ref={sheet} snapPoints={["80%"]} enableDynamicSizing={false}
      enablePanDownToClose={!editor.busy} onDismiss={onClose}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={editor.busy ? "none" : "close"} />}
      backgroundStyle={styles.sheetSurface} handleIndicatorStyle={{ backgroundColor: theme.ring }}
      keyboardBehavior="interactive" keyboardBlurBehavior="restore">
      {setup && <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
        <View style={styles.field}>
          <Text style={ui.label}>{unlocking ? t("home.addPlaceUnlockEyebrow") : t("home.addPlaceEyebrow")}</Text>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{t("home.addPlaceTitle")}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("home.addPlaceName")}</Text>
          <BottomSheetTextInput accessibilityLabel={t("home.addPlaceNameA11y")} placeholder={t("home.addPlaceNamePlaceholder")} placeholderTextColor={theme.mutedForeground}
            value={name} editable={editor.editable} style={styles.input} onChangeText={(value) => {
              interact(); setName(value); editor.setSetup({ ...setup, name: value.trim() || t("home.addPlaceDefaultName") });
            }} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("home.addPlaceType")}</Text>
          <View style={styles.chips}>{placeKinds.map((entry) => <Pressable key={entry} accessibilityRole="radio"
            accessibilityLabel={t(kindLabels[entry])} accessibilityState={{ selected: kind === entry, disabled: !editor.editable }}
            disabled={!editor.editable} onPress={() => pickKind(entry)} style={[styles.chip, kind === entry && styles.selected]}>
            <Text style={styles.chipText}>{t(kindLabels[entry])}</Text>
          </Pressable>)}</View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("home.addPlaceLook")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("home.addPlaceChooseEmoji")} disabled={!editor.editable}
            onPress={() => { interact(); setEmojiOpen(true); }} style={styles.look}>
            <Text style={styles.lookGlyph}>{setup.emoji}</Text><Text style={ui.muted}>{t("home.addPlaceChange")}</Text>
          </Pressable>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("home.addPlaceBalance")}</Text>
          <AmountField session={setup.amount} editable={editor.editable} inputAccessibilityLabel={t("home.addPlaceBalance")}
            placeholder="0" InputComponent={BottomSheetTextInput} inputStyle={styles.input}
            onChange={(value: AmountSession) => { interact();
              editor.setSetup({ ...setup, amount: value.editor.text.trim() ? value : openAmount(value.currency, "0") });
            }} />
        </View>
        {!!editor.error && <Text accessibilityRole="alert" style={ui.error}>{editor.error}</Text>}
        {editor.pending && <Text style={ui.muted}>{t("home.addPlacePending")}</Text>}
        <PrimaryButton label={editor.pending ? t("home.addPlaceRetry") : t("home.addPlaceSubmit")} trailingIcon="checkmark"
          pending={editor.busy} disabled={!editor.canSubmit} onPress={() => {
            if (!editor.canSubmit) return;
            interact();
            if (!editor.pending) unlockingSave.current = unlocking;
            void editor.submit();
          }} />
      </BottomSheetScrollView>}
    </BottomSheetModal>
    {emojiOpen && setup && <EmojiSheet emoji={setup.emoji ?? kindDetails[kind].emoji}
      onPick={(emoji) => { setEmojiChanged(true); editor.setSetup({ ...setup, emoji }); }}
      onUse={() => {}} onDismiss={() => setEmojiOpen(false)} />}
  </>;
}
