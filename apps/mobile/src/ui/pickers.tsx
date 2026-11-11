import { useT } from "../i18n";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetBackdrop, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Keyboard, View } from "react-native";
import { Text } from "./Text";
import { Choice, Group, ValueRow, SecondaryButton } from "./core";
import { Sheet } from "./Sheet";
import { PickerSheet } from "./PickerSheet";
import { IconTile, type IconName } from "./surfaces";
import { useThemeContext } from "./themeContext";
import { textStyle } from "./typography";
import { SheetHeader } from "./SheetHeader";
import { mix } from "./design";
import type { NativeSheetProps, SheetRef } from "./SheetModal";
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
type SearchControl = { search?: never; onSearchChange?: never } | { search: string; onSearchChange: (query: string) => void };
type AddAction = { onAddRequest?: () => void; onAdd?: never } | { onAdd?: () => void; onAddRequest?: never };
export type SearchPickerProps<V extends string> = {
  title: string; eyebrow?: string; placeholder: string; options: readonly { value: V; label: string; detail?: string; leading?: ReactNode; disabled?: boolean }[];
  value: V; onChange: (value: V) => void; onClose: () => void; footer?: ReactNode; legacy?: ReactNode;
  legacyBody?: ReactNode; legacyFooter?: ReactNode; legacyNativeModalProps?: NativeSheetProps; legacyBodyMode?: "scroll" | "native";
  sheetRef?: SheetRef; busy?: boolean; addLabel?: string; onDismiss?: () => void; onPresentedChange?: (presented: boolean) => void;
} & SearchControl & AddAction;

export function SearchPicker<V extends string>({ legacy = null, ...props }: SearchPickerProps<V>) {
  const { layout } = useThemeContext();
  if (layout.tier !== "xxxl" && props.legacyBody === undefined) return legacy;
  return <LargeSearchPicker {...props} />;
}
function LargeSearchPicker<V extends string>({ title, eyebrow, placeholder, options, value, onChange, onClose, footer, sheetRef, busy = false, search, onSearchChange, onAdd, onAddRequest, addLabel = "Add a place", onDismiss, onPresentedChange, legacyBody, legacyFooter, legacyNativeModalProps, legacyBodyMode }: Omit<SearchPickerProps<V>, "legacy">) {
  const { theme, layout } = useThemeContext();
  const { t } = useT();
  const large = layout.tier === "xxxl";
  const [query, setQuery] = useState("");
  const ownRef = useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const modal = sheetRef ?? ownRef;
  const pendingAdd = useRef<(() => void) | null>(null);
  const adding = useRef(false);
  const presented = useRef(false);
  const notifyPresented = (next: boolean) => {
    if (presented.current === next) return;
    presented.current = next;
    onPresentedChange?.(next);
  };
  const close = () => { if (!busy) modal.current?.dismiss(); };
  const add = () => {
    if (busy || adding.current) return;
    adding.current = true;
    onAddRequest?.();
    pendingAdd.current = onAdd ?? null;
    close();
  };
  const dismiss = () => {
    const afterDismiss = pendingAdd.current;
    pendingAdd.current = null;
    adding.current = false;
    notifyPresented(false);
    for (const notify of new Set([!large ? legacyNativeModalProps?.onDismiss : undefined, onClose, onDismiss])) notify?.();
    afterDismiss?.();
  };
  const currentQuery = search ?? query;
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(currentQuery.trim().toLocaleLowerCase()));
  return <PickerSheet sheetRef={modal} presentOnMount={!sheetRef} busy={busy} onDismiss={dismiss} stickyHeader={large ? false : undefined} footer={footer} legacyBody={legacyBody} legacyFooter={legacyFooter} legacyBodyMode={legacyBodyMode}
    nativeModalProps={{ ...(!large && legacyNativeModalProps), onDismiss: undefined, onChange: (...args) => { if (!large) legacyNativeModalProps?.onChange?.(...args); notifyPresented(args[0] >= 0); } }} scrollProps={{ contentContainerStyle: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 32 } }}>
    <SheetHeader title={title} eyebrow={eyebrow} onClose={close} disabled={busy} />
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.ring, backgroundColor: theme.secondary }}>
      <Ionicons name="search-outline" size={22} color={theme.mutedForeground} />
      <BottomSheetTextInput accessibilityLabel={placeholder} value={currentQuery} editable={!busy} onChangeText={text => {
        if (busy) return;
        const next = text.replace(/[\r\n]+/g, " ");
        if (onSearchChange) onSearchChange(next); else setQuery(next);
      }} multiline submitBehavior="submit" returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} placeholder={placeholder} placeholderTextColor={theme.mutedForeground} style={{ flex: 1, minWidth: 0, padding: 0, includeFontPadding: false, textAlignVertical: "center", ...textStyle("xxxl", "body"), color: theme.foreground }} />
    </View>
    <Group pairGap={12}>{filtered.map(option => <Choice key={option.value} label={option.label} detail={option.detail} selected={option.value === value} disabled={busy || option.disabled} leading={option.leading} onPress={() => { if (!busy && !option.disabled) onChange(option.value); }} />)}</Group>
    {filtered.length === 0 ? <Text variant="body" tone="muted">{t("review.historyNoMatchTitle")}</Text> : null}
    {onAdd || onAddRequest ? <SecondaryButton label={addLabel} icon="add" disabled={busy} onPress={add} /> : null}
  </PickerSheet>;
}
