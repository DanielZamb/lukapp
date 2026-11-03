import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Choice, Field, Header, SecondaryButton, useUi } from "../../ui/core";
import { categoryNameKey } from "../categories/model";

export function IntakeSelectionPicker({ title, searchLabel, options, selected, disabled, empty, onSelect, onClose, footer }: {
  title: string; searchLabel: string;
  options: { id: string; label: string; detail: string }[];
  selected: string | null; disabled: boolean; empty: string;
  onSelect(id: string): void; onClose(): void; footer?: ReactNode;
}) {
  const ui = useUi();
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const needle = categoryNameKey(search);
    return options.filter((option) => categoryNameKey(`${option.label} ${option.detail}`).includes(needle));
  }, [options, search]);
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={ui.screen}>
      <View style={[ui.content, { flex: 1 }]}>
        <Header title={title} onBack={onClose} />
        <Field label={searchLabel} accessibilityLabel={searchLabel} value={search} onChangeText={setSearch} placeholder="Search" autoCorrect={false} />
        <Text accessibilityLiveRegion="polite" style={ui.muted}>{matches.length} results</Text>
        <FlatList data={matches} keyExtractor={(item) => item.id} style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
          renderItem={({ item }) => <Choice label={item.label} detail={item.detail} selected={selected === item.id} disabled={disabled}
            onPress={() => { if (!disabled) onSelect(item.id); }} />}
          ListEmptyComponent={<Text style={ui.muted}>{options.length ? "No results match your search." : empty}</Text>} />
        {footer}
        <SecondaryButton label="Cancel selection" onPress={onClose} />
      </View>
    </SafeAreaView>
  </Modal>;
}
