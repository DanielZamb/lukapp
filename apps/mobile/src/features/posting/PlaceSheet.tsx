import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import { Text } from "react-native";
import { Choice, Header, SecondaryButton, theme, ui } from "../../ui/core";
import { spacing } from "../../ui/tokens";

export function PlaceSheet(props: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  places: Array<{ id: string; name: string }> | undefined;
  selectedId: string | null;
  excludedId?: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const visible = props.places?.filter(
    (place) =>
      place.id !== props.excludedId &&
      place.name.toLocaleLowerCase().includes(props.search.toLocaleLowerCase()),
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
          <Choice
            key={place.id}
            label={place.name}
            selected={place.id === props.selectedId}
            onPress={() => {
              if (!props.disabled) props.onSelect(place.id);
            }}
          />
        ))}
        {visible?.length === 0 && (
          <Text style={ui.muted}>No places found.</Text>
        )}
        <SecondaryButton
          label="Add place"
          disabled={props.disabled}
          onPress={props.onAdd}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
