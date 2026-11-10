import { Text, View } from "react-native";
import { useThemeMode } from "../../ui/core";
import { useSetupStyles } from "../setup/styles";
import type { SetupCategory } from "../setup/model";
import { categoryColor, categoryOutline } from "./appearance";

export function LookChip({
  category,
}: {
  category: Pick<SetupCategory, "name" | "style">;
}) {
  const mode = useThemeMode();
  const styles = useSetupStyles();
  const color = categoryColor(category.style, mode);
  return (
    <View
      style={[
        styles.chip,
        { borderWidth: 2, borderColor: categoryOutline(color, mode), backgroundColor: `${color}24` },
      ]}
    >
      <Text style={{ fontSize: 17 }}>{category.style.emoji}</Text>
      <Text style={styles.chipText}>{category.name}</Text>
    </View>
  );
}
