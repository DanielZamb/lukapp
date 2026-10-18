import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { PrimaryButton, theme, ui } from "../../ui/core";
import { styles } from "./styles";

export const placeEmojis = ["💰", "🏦", "👛", "💳", "🏠", "💼", "🪙", "🐷", "✨", "🚗"];
export function EmojiSheet({ emoji, onPick, onUse, onDismiss }: {
  emoji: string;
  onPick: (emoji: string) => void;
  onUse: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  useEffect(() => { sheet.current?.present(); }, []);
  async function useEmoji() {
    if (saving.current) return;
    saving.current = true;
    interact(); setBusy(true); setError("");
    try { await onUse(); sheet.current?.dismiss(); }
    catch (error) {
      if (!reportFailure(error)) setError("Could not save this look. Try again.");
    } finally { saving.current = false; setBusy(false); }
  }
  return <BottomSheetModal ref={sheet} stackBehavior="push" enablePanDownToClose={!busy} onDismiss={onDismiss}
    backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={busy ? "none" : "close"} />}
    backgroundStyle={styles.sheetSurface} handleIndicatorStyle={{ backgroundColor: theme.ring }}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore">
    <BottomSheetView style={styles.sheetBody}>
      <Text accessibilityRole="header" style={styles.sheetTitle}>Look</Text>
      <View style={styles.chips}>
        {placeEmojis.map((entry) => <Pressable key={entry} accessibilityRole="radio" accessibilityLabel={entry}
          accessibilityState={{ selected: emoji === entry, disabled: busy }} disabled={busy}
          onPress={() => { interact(); onPick(entry); }} style={[styles.emojiChip, emoji === entry && styles.selected]}>
          <Text style={styles.glyph}>{entry}</Text>
        </Pressable>)}
      </View>
      <BottomSheetTextInput accessibilityLabel="Custom emoji" value={placeEmojis.includes(emoji) ? "" : emoji}
        editable={!busy} onChangeText={(value) => { interact(); const next = [...value][0]; if (next) onPick(next); }}
        placeholder="Or type your own" placeholderTextColor={theme.mutedForeground} style={styles.input} />
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <PrimaryButton label="Use this" trailingIcon="checkmark" pending={busy} onPress={() => { void useEmoji(); }} />
    </BottomSheetView>
  </BottomSheetModal>;
}
