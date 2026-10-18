import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text } from "react-native";
import { Header, theme, ui } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";

export function PlaceSheet(props: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  places: Array<{ id: string; name: string; emoji?: string }> | undefined;
  selectedId: string | null;
  excludedId?: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const visible = props.places?.filter(
    (place) =>
      place.id !== props.excludedId &&
      `${place.emoji ?? "💰"} ${place.name}`
        .toLowerCase()
        .includes(props.search.trim().toLowerCase()),
  );
  return (
    <BottomSheetModal
      ref={props.sheetRef}
      snapPoints={["65%"]}
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: theme.background }}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xxl, gap: spacing.lg }}
      >
        <Header title={props.title} />
        <BottomSheetTextInput
          accessibilityLabel="Search places"
          placeholder="Search places"
          value={props.search}
          onChangeText={props.onSearch}
          editable={!props.disabled}
          style={ui.input}
        />
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
            style={{
              minHeight: 64,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.lg,
            }}
            onPress={() => {
              if (!props.disabled) props.onSelect(place.id);
            }}
          >
            <Text style={{ fontSize: 22 }}>{place.emoji ?? "💰"}</Text>
            <Text style={[ui.body, { flex: 1 }]}>{place.name}</Text>
            {place.id === props.selectedId && (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            )}
          </Pressable>
        ))}
        {visible?.length === 0 && (
          <Text style={ui.muted}>No places found.</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a place"
          disabled={props.disabled}
          onPress={props.onAdd}
          style={{
            minHeight: touchTarget,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.lg,
          }}
        >
          <Ionicons name="add" size={24} color={theme.foreground} />
          <Text style={ui.body}>Add a place</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
