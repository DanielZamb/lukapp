import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { SecondaryButton, theme, ui } from "../../ui/core";
import { radius, spacing, touchTarget } from "../../ui/tokens";
import { CategorySheet } from "./CategorySheet";
import type { CategorySelection } from "./model";
import { useCategoryPicker } from "./useCategoryPicker";

export function SetupCategories({
  selections,
  onChange,
  disabled,
}: {
  selections: CategorySelection[];
  onChange: (selections: CategorySelection[]) => void;
  disabled: boolean;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const picker = useCategoryPicker(
    { kind: "setup", selections, onChange },
    () => sheet.current?.dismiss(),
  );
  return (
    <View style={ui.section}>
      <Text style={ui.label}>1 · CATEGORIES</Text>
      <Text style={ui.body}>Which categories do you spend on?</Text>
      <Text style={ui.muted}>
        Pick suggestions or add your own. They'll be saved when you start
        tracking.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {picker.allPresets?.map((preset) => {
          const selected = selections.some(
            (s) => s.kind === "preset" && s.presetId === preset.id,
          );
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (selected) picker.sheet.onSelect(`preset:${preset.id}`);
                else {
                  picker.sheet.onPreset(preset);
                  sheet.current?.present();
                }
              }}
              style={{
                minHeight: touchTarget,
                padding: spacing.md,
                borderWidth: 2,
                borderColor: selected ? theme.primary : theme.border,
                borderRadius: radius.full,
                justifyContent: "center",
              }}
            >
              <Text style={ui.body}>
                {preset.name}
                {selected ? " ✓" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {picker.options?.map((option) => (
        <View
          key={option.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Text style={[ui.body, { flex: 1, color: theme[option.style.tone] }]}>
            {option.style.emoji} {option.name}
          </Text>
          <SecondaryButton
            label="Restyle"
            disabled={disabled}
            accessibilityLabel={`Restyle ${option.name}`}
            onPress={() => {
              picker.sheet.onRestyle(option.key);
              sheet.current?.present();
            }}
          />
          <SecondaryButton
            label="Remove"
            disabled={disabled}
            accessibilityLabel={`Remove ${option.name}`}
            onPress={() => picker.sheet.onSelect(option.key)}
          />
        </View>
      ))}
      <SecondaryButton
        label="Add your own"
        disabled={disabled}
        onPress={() => {
          picker.sheet.onCreate();
          sheet.current?.present();
        }}
      />
      <Text style={ui.muted}>
        {selections.length
          ? `${selections.length} selected`
          : "You can add categories later, too."}
      </Text>
      <CategorySheet {...picker.sheet} sheetRef={sheet} />
    </View>
  );
}
