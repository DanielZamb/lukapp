import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetBackdrop, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Keyboard, View } from "react-native";
import { Text } from "./Text";
import { Choice, Group, ValueRow } from "./core";
import { Sheet } from "./Sheet";
import { PickerSheet } from "./PickerSheet";
import { IconTile, type IconName } from "./surfaces";
import { useThemeContext } from "./themeContext";
import { textStyle } from "./typography";
import { SheetHeader } from "./SheetHeader";
import { mix } from "./design";
export { SheetHeader } from "./SheetHeader";

export function ActionSheet({ title, eyebrow, actions, onClose, legacy = null }: {
  title: string; eyebrow?: string; actions: readonly { icon: IconName; label: string; status: string; disabled?: boolean; onPress: () => void }[]; onClose: () => void; legacy?: ReactNode;
}) {
  const { layout, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <Sheet label={title} onClose={onClose} closeLabel={false} nativeModalProps={{ backdropComponent: props => <BottomSheetBackdrop {...props} opacity={1} style={{ backgroundColor: mix("#0b0614", theme.background, 0.46) }} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" /> }} scrollProps={{ contentContainerStyle: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 32 } }}>
    <SheetHeader title={title} eyebrow={eyebrow} onClose={onClose} />
    <Group pairGap={12}>{actions.map(action => <ValueRow key={action.label} title={action.label} leading={<IconTile icon={action.icon} size={36} />} onPress={action.onPress} disabled={action.disabled} accessibilityLabel={`${action.label}, ${action.status}`}><Text variant="status" tone="muted" numberOfLines={1}>{action.status}</Text></ValueRow>)}</Group>
  </Sheet>;
}
export function SearchPicker<V extends string>({ title, eyebrow, placeholder, options, value, onChange, onClose, footer, legacy = null }: {
  title: string; eyebrow?: string; placeholder: string; options: readonly { value: V; label: string; detail?: string; leading?: ReactNode; disabled?: boolean }[];
  value: V; onChange: (value: V) => void; onClose: () => void; footer?: ReactNode; legacy?: ReactNode;
}) {
  const { layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <LargeSearchPicker title={title} eyebrow={eyebrow} placeholder={placeholder} options={options} value={value} onChange={onChange} onClose={onClose} footer={footer} />;
}
function LargeSearchPicker<V extends string>({ title, eyebrow, placeholder, options, value, onChange, onClose, footer }: Omit<Parameters<typeof SearchPicker<V>>[0], "legacy">) {
  const { theme } = useThemeContext();
  const [query, setQuery] = useState("");
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <PickerSheet onDismiss={onClose} stickyHeader={false} footer={footer} scrollProps={{ contentContainerStyle: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 32 } }}>
    <SheetHeader title={title} eyebrow={eyebrow} onClose={onClose} />
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.ring, backgroundColor: theme.secondary }}>
      <Ionicons name="search-outline" size={22} color={theme.mutedForeground} />
      <BottomSheetTextInput accessibilityLabel={placeholder} value={query} onChangeText={text => setQuery(text.replace(/[\r\n]+/g, " "))} multiline submitBehavior="submit" returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} placeholder={placeholder} placeholderTextColor={theme.mutedForeground} style={{ flex: 1, minWidth: 0, padding: 0, includeFontPadding: false, textAlignVertical: "center", ...textStyle("xxxl", "body"), color: theme.foreground }} />
    </View>
    <Group pairGap={12}>{filtered.map(option => <Choice key={option.value} label={option.label} detail={option.detail} selected={option.value === value} disabled={option.disabled} leading={option.leading} onPress={() => onChange(option.value)} />)}</Group>
    {filtered.length === 0 ? <Text variant="body" tone="muted">Nothing matches</Text> : null}
  </PickerSheet>;
}
