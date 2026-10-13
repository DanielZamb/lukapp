import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, spacing } from "../theme/tokens";
import { PrimaryButton } from "./Buttons";
import { Copy } from "./Copy";
import { Screen } from "./Screen";

export type ConfirmationProps = {
  title: string;
  detail: string;
  action: { label: string; onPress: () => void };
};
export function ConfirmationContent({
  title,
  detail,
}: Pick<ConfirmationProps, "title" | "detail">) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.xl }} accessibilityLiveRegion="polite">
      <Text
        accessible={false}
        style={{
          color: theme.positive,
          fontFamily: font.extrabold,
          fontSize: fontSize.hero,
        }}
      >
        ✓
      </Text>
      <Copy title={title} detail={detail} />
    </View>
  );
}
export function ConfirmationScreen({
  title,
  detail,
  action,
}: ConfirmationProps) {
  return (
    <Screen>
      <View style={{ paddingTop: spacing.section }}>
        <ConfirmationContent title={title} detail={detail} />
      </View>
      <PrimaryButton label={action.label} onPress={action.onPress} />
    </Screen>
  );
}
