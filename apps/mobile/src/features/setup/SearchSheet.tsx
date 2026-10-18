import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { theme, ui } from "../../ui/core";
import { setupStyles as styles } from "./styles";

export function SetupBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

export function SearchSheet({
  options,
  selected,
  label,
  placeholder,
  onSelect,
  onClose,
}: {
  options: { code: string; name: string }[];
  selected: string | null;
  label: string;
  placeholder: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    sheet.current?.present();
  }, []);
  const needle = query.trim().toLocaleLowerCase();
  const matches = options.filter(({ code, name }) =>
    `${code} ${name}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={["70%"]}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={SetupBackdrop}
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: theme.background }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View style={styles.searchHeader}>
          <BottomSheetTextInput
            accessibilityLabel={label}
            placeholder={placeholder}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            placeholderTextColor={theme.mutedForeground}
            autoCorrect={false}
          />
        </View>
        {matches.map(({ code, name }) => (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityLabel={`${code}, ${name}`}
            accessibilityState={{ checked: code === selected }}
            style={styles.searchRow}
            onPress={() => {
              onSelect(code);
              sheet.current?.dismiss();
            }}
          >
            <Text style={styles.chipText}>{code}</Text>
            <Text style={[ui.muted, { flex: 1 }]}>{name}</Text>
            {selected === code && (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            )}
          </Pressable>
        ))}
        {matches.length === 0 && (
          <Text style={ui.muted}>{`Nothing matches "${query.trim()}".`}</Text>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
