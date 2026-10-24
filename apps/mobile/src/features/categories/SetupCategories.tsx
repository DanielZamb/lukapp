import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useTheme, useThemeMode, useUi } from "../../ui/core";
import { useSetupStyles } from "../setup/styles";
import type { SetupCategory } from "../setup/model";
import type { AccountSetupRequest, CategoryStyle } from "./model";
import { categoryColor, starterCategories } from "./looks";
import { RestyleSheet, type RestyleTarget } from "./SetupRestyleSheet";

export function SetupCategories({
  selections,
  onChange,
  onAccountSetup,
  disabled,
}: {
  selections: SetupCategory[];
  onChange: (selections: SetupCategory[]) => void;
  disabled: boolean;
  onAccountSetup: (request: AccountSetupRequest) => void;
}) {
  const theme = useTheme();
  const mode = useThemeMode();
  const ui = useUi();
  const styles = useSetupStyles();
  const recordInteraction = useLocalEntryInteraction();
  const [target, setTarget] = useState<RestyleTarget | null>(null);
  const [looks, setLooks] = useState<Record<string, CategoryStyle>>({});
  const names: SetupCategory[] = [
    ...starterCategories.map(
      (category): SetupCategory => ({ ...category, source: "starter" }),
    ),
    ...selections.filter((category) => category.source === "custom"),
  ];
  function commit(category: SetupCategory) {
    recordInteraction();
    setLooks((current) => ({ ...current, [category.name]: category.style }));
    if (target?.kind === "create") onChange([...selections, category]);
    else
      onChange(
        selections.map((item) =>
          target?.kind === "edit" && item.name === target.category.name ? category : item,
        ),
      );
  }
  return (
    <View style={styles.board}>
      <View style={styles.row}>
        <Text style={styles.label}>Your categories</Text>
        <Text style={ui.muted}>{selections.length} selected</Text>
      </View>
      <View style={styles.wrap}>
        {names.map((original) => {
          const category = {
            ...original,
            style: looks[original.name] ?? original.style,
          };
          const selected = selections.some(
            (item) => item.name === category.name,
          );
          const color = categoryColor(category.style, mode) ?? theme.primary;
          return (
            <Pressable
              key={category.name}
              accessibilityRole="checkbox"
              accessibilityLabel={category.name}
              accessibilityHint="Long press to edit"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => {
                recordInteraction();
                if (selected)
                  onChange(
                    selections.filter((item) => item.name !== category.name),
                  );
                else onChange([...selections, category]);
              }}
              onLongPress={() => {
                recordInteraction();
                setTarget({ kind: "edit", category });
              }}
              style={[
                styles.chip,
                selected && {
                  borderWidth: 2,
                  borderColor: color,
                  backgroundColor: `${color}24`,
                },
              ]}
            >
              <Text style={{ fontSize: 17 }}>{category.style.emoji}</Text>
              <Text style={styles.chipText}>{category.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add your own category"
          disabled={disabled}
          onPress={() => {
            recordInteraction();
            setTarget({ kind: "create" });
          }}
          style={[styles.chip, styles.own]}
        >
          <Ionicons name="add" size={18} color={theme.foreground} />
          <Text style={styles.chipText}>Your own</Text>
        </Pressable>
      </View>
      <Text style={ui.muted}>Tap to pick. Hold one to edit it.</Text>
      {target && (
        <RestyleSheet
          target={target}
          names={names.map(({ name }) => name)}
          onCommit={commit}
          onAccountSetup={onAccountSetup}
          onClose={() => setTarget(null)}
          onDelete={target.kind === "edit" && target.category.source === "custom" ? () => {
            recordInteraction();
            onChange(selections.filter((item) => item.name !== target.category.name));
          } : undefined}
        />
      )}
    </View>
  );
}
