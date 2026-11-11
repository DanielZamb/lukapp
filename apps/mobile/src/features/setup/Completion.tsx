import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import { useT, formatList } from "../../i18n";
import { PrimaryButton, SecondaryButton, Screen, useTheme, useUi } from "../../ui/core";
import { font, spacing } from "../../ui/tokens";
import { LookChip } from "../categories/LookChip";
import { FeedbackIntroCard } from "../feedback/FeedbackIntroCard";
import { formatMoney } from "../money";
import { currencyName } from "./currencies";
import type { SetupSummary } from "./model";
import { useSetupStyles } from "./styles";

export function SetupCompletion({
  summary,
  onHome,
  onNotificationSetup,
}: {
  summary: SetupSummary;
  onHome: () => void;
  onNotificationSetup: () => void;
}) {
  const theme = useTheme();
  const ui = useUi();
  const styles = useSetupStyles();
  const translator = useT();
  const { t, tn } = translator;
  const extra = summary.categories.length - 3;
  const shown = summary.categories.slice(0, 3).map(({ name }) => name);
  const names = extra > 0 ? shown.join(", ") : formatList(translator.language, shown);
  const amount = formatMoney(
    { currency: summary.currency, minorUnits: summary.startingMinorUnits },
    { hideZeroDecimals: true },
  );
  const recap = [
    t("setup.doneStart", { currency: currencyName(summary.currency, translator), amount }),
    extra > 0 ? tn("setup.doneTrackingMore", extra, { names }) : t("setup.doneTracking", { names }),
    summary.purchaseAlertsConsent ? t("setup.doneAlerts") : t("setup.doneManual"),
    ...(summary.wantsBudgets ? [t("setup.doneBudgets")] : []),
  ].join(" ");
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
          {t("setup.doneTitle")}
        </Text>
        <View style={styles.wrap}>
          {summary.categories.slice(0, 6).map((category) => (
            <LookChip key={category.name} category={category} />
          ))}
        </View>
        <Text style={[ui.muted, { lineHeight: 24 }]}>{recap}</Text>
        {summary.purchaseAlertsConsent ? <SecondaryButton label={t("setup.doneIntake")} onPress={onNotificationSetup} /> : null}
        <FeedbackIntroCard placement="completion" />
        <PrimaryButton
          label={t("setup.doneHome")}
          trailingIcon="home-outline"
          onPress={onHome}
        />
      </View>
    </Screen>
  );
}
