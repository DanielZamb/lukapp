import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { PrimaryButton, useTheme, useUi } from "../../ui/core";
import { usePlaceStyles } from "./styles";

export const placeEmojis = ["💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗"];
export function EmojiSheet({ emoji, onPick, onUse, onDismiss }: {
  emoji: string;
  onPick: (emoji: string) => void;
  onUse: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { t } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [failed, setFailed] = useState(false);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  useEffect(() => { sheet.current?.present(); }, []);
  async function useEmoji() {
    if (saving.current) return;
    saving.current = true;
    interact(); setBusy(true); setFailed(false);
    try { await onUse(); sheet.current?.dismiss(); }
    catch (error) {
      if (!reportFailure(error)) setFailed(true);
    } finally { saving.current = false; setBusy(false); }
  }
  return <BottomSheetModal ref={sheet} stackBehavior="push" enablePanDownToClose={!busy} onDismiss={onDismiss}
    backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={busy ? "none" : "close"} />}
    backgroundStyle={styles.sheetSurface} handleIndicatorStyle={{ backgroundColor: theme.ring }}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore">
    <BottomSheetView style={styles.sheetBody}>
      <Text accessibilityRole="header" style={styles.sheetTitle}>{t("places.lookTitle")}</Text>
      <View style={styles.chips}>
        {placeEmojis.map((entry) => <Pressable key={entry} accessibilityRole="radio" accessibilityLabel={entry}
          accessibilityState={{ selected: emoji === entry, disabled: busy }} disabled={busy}
          onPress={() => { interact(); onPick(entry); }} style={[styles.emojiChip, emoji === entry && styles.selected]}>
          <Text style={styles.glyph}>{entry}</Text>
        </Pressable>)}
      </View>
      <BottomSheetTextInput accessibilityLabel={t("places.lookCustomA11y")} value={placeEmojis.includes(emoji) ? "" : emoji}
        editable={!busy} onChangeText={(value) => { interact(); const next = [...value][0]; if (next) onPick(next); }}
        placeholder={t("places.lookPlaceholder")} placeholderTextColor={theme.mutedForeground} style={styles.input} />
      {failed && <Text accessibilityRole="alert" style={ui.error}>{t("places.lookFailed")}</Text>}
      <PrimaryButton label={t("places.lookUse")} trailingIcon="checkmark" pending={busy} onPress={() => { void useEmoji(); }} />
    </BottomSheetView>
  </BottomSheetModal>;
}
