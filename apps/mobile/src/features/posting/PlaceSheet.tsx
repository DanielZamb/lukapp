import {
  type BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { useTheme, useUi } from "../../ui/core";
import { useT } from "../../i18n";
import { PickerSheet, usePickerSheetStyles } from "../../ui/PickerSheet";

export function PlaceSheet(props: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  places: Array<{ id: string; name: string; emoji?: string }> | undefined;
  selectedId: string | null;
  excludedId?: string;
  disabled: boolean;
  onDismiss: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useT();
  const pickerSheetStyles = usePickerSheetStyles();
  const ui = useUi();
  const theme = useTheme();
  const visible = props.places?.filter(
    (place) =>
      place.id !== props.excludedId &&
      `${place.emoji ?? "💰"} ${place.name}`
        .toLowerCase()
        .includes(props.search.trim().toLowerCase()),
  );
  return (
    <PickerSheet sheetRef={props.sheetRef} busy={props.disabled} onDismiss={props.onDismiss}>
      <View style={pickerSheetStyles.search}>
        <Text style={pickerSheetStyles.title}>{props.title}</Text>
        <BottomSheetTextInput
          accessibilityLabel={t("posting.placeSearchA11y")}
          placeholder={t("posting.placeSearch")}
          placeholderTextColor={theme.mutedForeground}
          value={props.search}
          onChangeText={props.onSearch}
          editable={!props.disabled}
          style={[ui.input, pickerSheetStyles.input]}
        />
      </View>
      {visible?.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`${place.emoji ?? "💰"} ${place.name}`}
          accessibilityState={{
            selected: place.id === props.selectedId,
            disabled: props.disabled,
          }}
          disabled={props.disabled}
          style={pickerSheetStyles.row}
          onPress={() => {
            if (!props.disabled) props.onSelect(place.id);
          }}
        >
          <Text style={{ fontSize: 22 }}>{place.emoji ?? "💰"}</Text>
          <Text style={[ui.body, pickerSheetStyles.rowName]}>{place.name}</Text>
          {place.id === props.selectedId && (
            <Ionicons name="checkmark" size={20} color={theme.primary} />
          )}
        </Pressable>
      ))}
      {visible?.length === 0 && (
        <Text style={ui.muted}>
          {props.search.trim() ? t("posting.placeNoMatch", { search: props.search.trim() }) : t("posting.placeNone")}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("posting.placeAdd")}
        disabled={props.disabled}
        onPress={props.onAdd}
        style={pickerSheetStyles.row}
      >
        <View style={pickerSheetStyles.addDisc}>
          <Ionicons name="add" size={20} color={theme.foreground} />
        </View>
        <Text style={[ui.body, pickerSheetStyles.rowName]}>{t("posting.placeAdd")}</Text>
      </Pressable>
    </PickerSheet>
  );
}
