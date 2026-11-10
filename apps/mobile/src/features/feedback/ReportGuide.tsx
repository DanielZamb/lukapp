import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";
import { useT, type MessageKey } from "../../i18n";
import { Header, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import type { DestinationState } from "./report";

type Step = { icon: ComponentProps<typeof Ionicons>["name"]; title: MessageKey; body: MessageKey };

function steps(destination: DestinationState): Step[] {
  const audience: MessageKey =
    typeof destination !== "object" || !destination.configured
      ? "feedback.guideAudienceUnknown"
      : destination.audience === "public"
        ? "feedback.guideAudiencePublic"
        : "feedback.guideAudiencePrivate";
  return [
    { icon: "phone-portrait-outline", title: "feedback.guideShakeTitle", body: "feedback.guideShakeBody" },
    { icon: "eye-outline", title: "feedback.guideReviewTitle", body: "feedback.guideReviewBody" },
    { icon: "paper-plane-outline", title: "feedback.guideSendTitle", body: "feedback.guideSendBody" },
    { icon: "people-outline", title: "feedback.guideAudienceTitle", body: audience },
    { icon: "settings-outline", title: "feedback.guideSettingsTitle", body: "feedback.guideSettingsBody" },
  ];
}

export const guideStepCount = 5;

export function ReportGuide({
  step,
  destination,
  onStep,
  onBack,
  onTryIt,
}: {
  step: number;
  destination: DestinationState;
  onStep: (step: number) => void;
  onBack: () => void;
  onTryIt: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const { t } = useT();
  const all = steps(destination);
  const current = all[Math.min(step, all.length - 1)];
  const last = step >= all.length - 1;
  const repository = typeof destination === "object" ? destination.repository : "";
  return (
    <Screen>
      <Header
        title={t("feedback.guideTitle")}
        eyebrow={t("feedback.guideStep", { step: step + 1, total: all.length })}
        onBack={onBack}
      />
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: theme.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={current.icon} size={30} color={theme.foreground} />
      </View>
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={ui.title}>{t(current.title)}</Text>
        <Text style={ui.body}>{t(current.body, { repository })}</Text>
      </View>
      <View style={{ gap: spacing.md }}>
        {last ? (
          <>
            <PrimaryButton label={t("feedback.tryIt")} trailingIcon="play-outline" onPress={onTryIt} />
            <SecondaryButton label={t("common.done")} onPress={onBack} />
          </>
        ) : (
          <>
            <PrimaryButton label={t("feedback.next")} onPress={() => onStep(step + 1)} />
            <SecondaryButton label={t("feedback.skip")} onPress={onBack} />
          </>
        )}
        {step > 0 ? <SecondaryButton label={t("common.back")} onPress={() => onStep(step - 1)} /> : null}
      </View>
    </Screen>
  );
}
