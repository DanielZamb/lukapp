import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Field, useTheme, useUi } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";
import { categoryNameKey } from "../categories/model";
import { Card, IconTile, NavRow } from "./IntakeParts";
import { useT } from "../../i18n";

export type PickerOption = { id: string; label: string; detail: string; initial: string; likely?: boolean };
type Item = { kind: "heading"; id: string; title: string } | { kind: "option"; option: PickerOption };

/** A full-height searchable list of choices. Picking one closes the list. */
export function IntakeSelectionPicker({ title, eyebrow, searchLabel, guidance, options, disabled, empty, onSelect, onClose }: {
  title: string; eyebrow?: string; searchLabel: string;
  guidance?: string;
  options: PickerOption[]; disabled: boolean; empty: string;
  onSelect(id: string): void; onClose(): void;
}) {
  const { t, tn } = useT();
  const ui = useUi();
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const needle = categoryNameKey(search);
  const items = useMemo(() => {
    const matches = options.filter((option) => categoryNameKey(`${option.label} ${option.detail}`).includes(needle));
    const groups: [string, PickerOption[]][] = needle ? [["", matches]]
      : [[t("inbox.pickerLikely"), matches.filter((option) => option.likely)], [t("inbox.pickerAll"), matches.filter((option) => !option.likely)]];
    const showHeadings = groups.filter(([, rows]) => rows.length).length > 1;
    return { count: matches.length, rows: groups.flatMap(([heading, rows]): Item[] => rows.length ? [
      ...(showHeadings ? [{ kind: "heading" as const, id: heading, title: heading }] : []),
      ...rows.map((option) => ({ kind: "option" as const, option })),
    ] : []) };
  }, [options, needle, t]);
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={ui.screen}>
      <View style={[ui.content, { flex: 1, gap: spacing.lg }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            {eyebrow ? <Text style={ui.label}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" style={[ui.title, { fontSize: 26, lineHeight: 32 }]}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose}
            style={{ width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: "center", justifyContent: "center", backgroundColor: theme.secondary }}>
            <Ionicons name="close" size={22} color={theme.foreground} />
          </Pressable>
        </View>
        {guidance ? <Text style={ui.muted}>{guidance}</Text> : null}
        <Field label={searchLabel} accessibilityLabel={searchLabel} value={search} onChangeText={setSearch}
          placeholder={t("inbox.pickerPlaceholder")} autoCorrect={false} />
        {needle ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{tn("inbox.pickerResults", items.count)}</Text> : null}
        <FlatList data={items.rows} keyExtractor={(item) => item.kind === "heading" ? `heading:${item.id}` : item.option.id} style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
          renderItem={({ item }) => item.kind === "heading"
            ? <Text accessibilityRole="header" style={[ui.sectionHeading, { paddingTop: spacing.md, paddingBottom: spacing.sm }]}>{item.title}</Text>
            : <Card><NavRow last leading={<IconTile letter={item.option.initial} tone="accent" />} title={item.option.label}
                status={item.option.detail} statusLines={1} accessibilityLabel={item.option.label} disabled={disabled}
                onPress={() => { if (!disabled) onSelect(item.option.id); }} /></Card>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={<Text style={ui.muted}>{options.length ? t("inbox.pickerNoMatch") : empty}</Text>} />
      </View>
    </SafeAreaView>
  </Modal>;
}
