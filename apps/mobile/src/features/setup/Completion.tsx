import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import { PrimaryButton, Screen, useTheme, useUi } from "../../ui/core";
import { font, spacing } from "../../ui/tokens";
import { LookChip } from "../categories/LookChip";
import { formatMoney } from "../money";
import { currencyName } from "./currencies";
import type { SetupSummary } from "./model";
import { useSetupStyles } from "./styles";

export function SetupCompletion({
  summary,
  onHome,
}: {
  summary: SetupSummary;
  onHome: () => void;
}) {
  const theme = useTheme();
  const ui = useUi();
  const styles = useSetupStyles();
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <View style={{ gap: spacing.xl }}>
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: theme.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="checkmark"
            size={32}
            color={theme.primaryForeground}
          />
        </View>
        <Text style={[ui.hero, { fontSize: 32, fontFamily: font.extrabold }]}>
          {"You're set"}
        </Text>
        <View style={styles.wrap}>
          {summary.categories.slice(0, 6).map((category) => (
            <LookChip key={category.name} category={category} />
          ))}
        </View>
        <Text style={[ui.muted, { lineHeight: 24 }]}>
          {currencyName(summary.currency)}, starting from{" "}
          {formatMoney(
            {
              currency: summary.currency,
              minorUnits: summary.startingMinorUnits,
            },
            { hideZeroDecimals: true },
          )}
          . Tracking{" "}
          {summary.categories
            .slice(0, 3)
            .map(({ name }) => name)
            .join(", ")}
          {summary.categories.length > 3
            ? ` and ${summary.categories.length - 3} more`
            : ""}
          .{" "}
          {summary.purchaseAlertsConsent
            ? "Purchase alerts can become drafts."
            : "You will add drafts yourself."}
          {summary.wantsBudgets ? " Budgets stay one door away." : ""}
        </Text>
        <PrimaryButton
          label="Go to home"
          trailingIcon="home-outline"
          onPress={onHome}
        />
      </View>
    </Screen>
  );
}
