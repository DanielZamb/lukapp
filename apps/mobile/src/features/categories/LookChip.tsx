import { Text, View } from "react-native";
import { useTheme } from "../../ui/core";
import { useSetupStyles } from "../setup/styles";
import type { SetupCategory } from "../setup/model";
import { categoryColor } from "./looks";

export function LookChip({
  category,
}: {
  category: Pick<SetupCategory, "name" | "style">;
}) {
  const theme = useTheme();
  const styles = useSetupStyles();
  const color = categoryColor(category.style) ?? theme.primary;
  return (
    <View
      style={[
        styles.chip,
        { borderWidth: 2, borderColor: color, backgroundColor: `${color}24` },
      ]}
    >
      <Text style={{ fontSize: 17 }}>{category.style.emoji}</Text>
      <Text style={styles.chipText}>{category.name}</Text>
    </View>
  );
}
