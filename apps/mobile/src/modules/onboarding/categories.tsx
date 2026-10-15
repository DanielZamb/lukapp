import { useInteraction } from "../../ui/Interaction";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Input } from "../../ui/Input";
import { SecondaryButton } from "../../ui";
import { useTheme } from "../../theme/ThemeProvider";
import { font, fontSize, spacing, touchTarget } from "../../theme/tokens";
import type { FinancialArgs } from "../../../../../src/access/client";

export type SetupCategory = FinancialArgs<"completeFirstRun">["categories"][number];
export const starterSpend: SetupCategory[] = [
  ["groceries", "Groceries"], ["restaurants", "Restaurants"], ["fuel", "Fuel"], ["rentPaid", "Rent"],
  ["health", "Health"], ["transport", "Transport"], ["education", "Education"], ["entertainment", "Entertainment"],
  ["lifeInsurance", "Life insurance"], ["vehicleInsurance", "Car insurance"],
].map(([concept, name]) => {
  if (!concept || !name) throw new Error("Starter category invalid");
  return { name, selection: { kind: "preset", concept } };
});
export function SpendCategoryPicker({ value, onChange }: { value: SetupCategory[]; onChange: (categories: SetupCategory[]) => void }) {
  const theme = useTheme();
  const interact = useInteraction();
  const [custom, setCustom] = useState("");
  const all = [...starterSpend, ...value.filter(c => c.selection.kind === "custom")];
  return <View style={{ gap: spacing.md }}>
    {all.map(category => {
      const selected = value.some(c => c.name === category.name);
      return <Pressable key={category.name} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
        accessibilityLabel={category.name} onPress={() => { interact(); onChange(selected ? value.filter(c => c.name !== category.name) : [...value, category]); }}
        style={{ minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <Text style={{ color: theme.primary, fontSize: fontSize.title }}>{selected ? "☑" : "□"}</Text>
        <Text style={{ color: theme.foreground, fontFamily: font.regular, fontSize: fontSize.body }}>{category.name}</Text>
      </Pressable>;
    })}
    <Input accessibilityLabel="Custom spend category" placeholder="A spend category of your own" value={custom} onChangeText={setCustom} />
    <SecondaryButton label="Add spend category" disabled={!custom.trim() || value.some(c => c.name.toLowerCase() === custom.trim().toLowerCase())}
      onPress={() => { onChange([...value, { name: custom.trim(), selection: { kind: "custom", answer: "Expense", confirmation: "answered" } }]); setCustom(""); }} />
  </View>;
}
