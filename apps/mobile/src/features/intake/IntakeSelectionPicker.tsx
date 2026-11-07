import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Field, Group, Presentation, SheetHeader, Text, TextInput, useTheme, useUi } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";
import { categoryNameKey } from "../categories/model";
import { AppTile, Card, NavRow } from "./IntakeParts";

export type PickerOption = { id: string; label: string; detail: string; initial: string; likely?: boolean };
type Item = { kind: "heading"; id: string; title: string } | { kind: "option"; option: PickerOption };
/** XXXL lists rows in cards of at most two (D4 `pair`). */
type PairedItem = { kind: "heading"; id: string; title: string } | { kind: "pair"; options: PickerOption[] };

/** A full-height searchable list of choices. Picking one closes the list. */
export function IntakeSelectionPicker({ title, eyebrow, searchLabel, guidance, options, disabled, empty, onSelect, onClose }: {
  title: string; eyebrow?: string; searchLabel: string;
  guidance?: string;
  options: PickerOption[]; disabled: boolean; empty: string;
  onSelect(id: string): void; onClose(): void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const needle = categoryNameKey(search);
  const items = useMemo(() => {
    const matches = options.filter((option) => categoryNameKey(`${option.label} ${option.detail}`).includes(needle));
    const groups: [string, PickerOption[]][] = needle ? [["", matches]]
      : [["Likely bank apps", matches.filter((option) => option.likely)], ["All apps", matches.filter((option) => !option.likely)]];
    const showHeadings = groups.filter(([, rows]) => rows.length).length > 1;
    const heading = (title: string) => showHeadings ? [{ kind: "heading" as const, id: title, title }] : [];
    return { count: matches.length,
      rows: groups.flatMap(([title, rows]): Item[] => rows.length ? [...heading(title), ...rows.map((option) => ({ kind: "option" as const, option }))] : []),
      pairs: groups.flatMap(([title, rows]): PairedItem[] => rows.length ? [...heading(title),
        ...Array.from({ length: Math.ceil(rows.length / 2) }, (_, index) => ({ kind: "pair" as const, options: rows.slice(index * 2, index * 2 + 2) }))] : []),
    };
  }, [options, needle]);
  const row = (option: PickerOption, last?: boolean) => <NavRow key={option.id} last={last} leading={<AppTile packageName={option.id} label={option.label} />}
    title={option.label} status={option.detail} statusLines={1} accessibilityLabel={option.label} disabled={disabled}
    onPress={() => { if (!disabled) onSelect(option.id); }} />;
  const noMatch = <Text preset="body" tone="muted">{options.length ? "No apps match your search." : empty}</Text>;
  const list = { keyboardShouldPersistTaps: "handled", keyboardDismissMode: "on-drag", initialNumToRender: 12, maxToRenderPerBatch: 12, windowSize: 5, style: { flex: 1 } } as const;
  const legacyHead = <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
      {eyebrow ? <Text variant="label" tone="muted">{eyebrow}</Text> : null}
      <Text accessibilityRole="header" preset="pickerTitle" tone="default">{title}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
      style={{ width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: "center", justifyContent: "center", backgroundColor: theme.secondary }}>
      <Ionicons name="close" size={22} color={theme.foreground} />
    </Pressable>
  </View>;
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={ui.screen}>
      <View style={[ui.content, { flex: 1, gap: spacing.lg }]}>
        <SheetHeader title={title} eyebrow={eyebrow} onClose={onClose} legacy={legacyHead} />
        {guidance ? <Text preset="body" tone="muted">{guidance}</Text> : null}
        <Presentation legacy={<Field label={searchLabel} accessibilityLabel={searchLabel} value={search} onChangeText={setSearch}
          placeholder="Search by name" autoCorrect={false} />}>
          <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.ring, backgroundColor: theme.secondary }}>
            <Ionicons name="search-outline" size={22} color={theme.mutedForeground} />
            <TextInput preset="body" accessibilityLabel={searchLabel} value={search} onChangeText={setSearch} placeholder={searchLabel}
              placeholderTextColor={theme.mutedForeground} autoCorrect={false} returnKeyType="search"
              style={{ flex: 1, minWidth: 0, padding: 0, color: theme.foreground }} />
          </View>
        </Presentation>
        {needle ? <Text accessibilityLiveRegion="polite" preset="body" tone="muted">{items.count === 1 ? "1 result" : `${items.count} results`}</Text> : null}
        <Presentation legacy={<FlatList data={items.rows} keyExtractor={(item) => item.kind === "heading" ? `heading:${item.id}` : item.option.id} {...list}
          renderItem={({ item }) => item.kind === "heading"
            ? <Text accessibilityRole="header" variant="section" style={{ paddingTop: spacing.md, paddingBottom: spacing.sm }}>{item.title}</Text>
            : <Card>{row(item.option, true)}</Card>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={noMatch} />}>
          <FlatList data={items.pairs} keyExtractor={(item) => item.kind === "heading" ? `heading:${item.id}` : item.options[0]?.id ?? ""} {...list}
            renderItem={({ item }) => item.kind === "heading"
              ? <Text accessibilityRole="header" variant="section" style={{ paddingTop: 20 }}>{item.title}</Text>
              : <Group>{item.options.map((option) => row(option))}</Group>}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={noMatch} />
        </Presentation>
      </View>
    </SafeAreaView>
  </Modal>;
}
