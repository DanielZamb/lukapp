import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../i18n";
import { SecondaryButton, useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { useFeedback } from "./controls";

/**
 * Teaches shake to report once per phone. On the setup completion step it
 * counts as seen as soon as it shows; on Home it stays until dismissed.
 */
export function FeedbackIntroCard({ placement }: { placement: "completion" | "home" }) {
  const ui = useUi();
  const theme = useTheme();
  const { t } = useT();
  const feedback = useFeedback();
  const visible = feedback.available && (placement === "completion" || feedback.guideSeen === false);
  const { markGuideSeen } = feedback;
  useEffect(() => {
    if (visible && placement === "completion") markGuideSeen();
  }, [visible, placement, markGuideSeen]);
  if (!visible) return null;
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: theme.secondary,
      }}
    >
      <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
        <Ionicons name="phone-portrait-outline" size={24} color={theme.foreground} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text accessibilityRole="header" style={[ui.body, { fontFamily: font.semibold }]}>
            {t("feedback.introTitle")}
          </Text>
          <Text style={ui.muted}>{t("feedback.introBody")}</Text>
        </View>
        {placement === "home" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("feedback.notNow")}
            onPress={feedback.markGuideSeen}
            hitSlop={spacing.md}
            style={{ minWidth: touchTarget, minHeight: touchTarget, alignItems: "center", justifyContent: "center", marginTop: -spacing.md, marginRight: -spacing.md }}
          >
            <Ionicons name="close" size={22} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <SecondaryButton
        label={t("feedback.introShow")}
        onPress={() => {
          feedback.markGuideSeen();
          feedback.openGuide();
        }}
      />
    </View>
  );
}
