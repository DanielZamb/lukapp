import {
  type BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { ActionBar, EmojiTile, Text, useTheme, useUi } from "../../ui/core";
import { useT, type MessageKey } from "../../i18n";
import { usePickerSheetStyles } from "../../ui/PickerSheet";
import { SearchPicker } from "../../ui/pickers";
import type { PlaceKind } from "./pendingPostingSchema";

const placeKindLabels: Record<PlaceKind, MessageKey> = {
  bankAccount: "places.kindBankAccount",
  savingsAccount: "places.kindSavingsAccount",
  cash: "places.kindCash",
  creditCard: "places.kindCreditCard",
  loan: "places.kindLoan",
};

export function PlaceSheet(props: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  places:
    | Array<{
        id: string;
        name: string;
        emoji?: string;
        productKind?: PlaceKind;
      }>
    | undefined;
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
    <SearchPicker
      sheetRef={props.sheetRef}
      title={props.title}
      eyebrow={t("posting.title").toUpperCase()}
      placeholder={t("posting.placeSearchA11y")}
      search={props.search}
      onSearchChange={props.onSearch}
      busy={props.disabled}
      options={(props.places ?? [])
        .filter((place) => place.id !== props.excludedId)
        .map((place) => ({
          value: place.id,
          label: place.name,
          detail: place.productKind
            ? t(placeKindLabels[place.productKind])
            : undefined,
          disabled: props.disabled,
          leading: (
            <EmojiTile
              emoji={place.emoji ?? "💰"}
              color={theme.primary}
              size={36}
            />
          ),
        }))}
      value={props.selectedId ?? ""}
      onChange={props.onSelect}
      onClose={props.onDismiss}
      onAddRequest={props.onAdd}
      footer={
        <ActionBar
          primary={{
            label: t("common.done"),
            icon: "checkmark",
            disabled: props.disabled,
            onPress: () => props.sheetRef.current?.dismiss(),
          }}
        />
      }

      legacyFooter={null}
      legacyBody={
        <>
          <View style={pickerSheetStyles.search}>
            <Text preset="sheetTitle" style={pickerSheetStyles.title}>
              {props.title}
            </Text>
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
              <Text preset="emoji22">{place.emoji ?? "💰"}</Text>
              <Text preset="body" style={[ui.body, pickerSheetStyles.rowName]}>
                {place.name}
              </Text>
              {place.id === props.selectedId && (
                <Ionicons name="checkmark" size={20} color={theme.primary} />
              )}
            </Pressable>
          ))}
          {visible?.length === 0 && (
            <Text preset="body" style={ui.muted}>
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
            <Text preset="body" style={[ui.body, pickerSheetStyles.rowName]}>
              {t("posting.placeAdd")}
            </Text>
          </Pressable>
        </>
      }
    />
  );
}
