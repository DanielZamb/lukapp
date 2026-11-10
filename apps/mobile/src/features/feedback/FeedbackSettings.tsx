import Ionicons from "@expo/vector-icons/Ionicons";
import { Switch, Text, View } from "react-native";
import { useT } from "../../i18n";
import { ListGroup, ListRow, useTheme, useUi } from "../../ui/core";
import { useThemeContext } from "../../ui/themeContext";
import { useFeedback } from "./controls";

/** The Settings entries: the report form without shaking, the guide, and the shake switch. */
export function FeedbackSettings() {
  const ui = useUi();
  const { t } = useT();
  const feedback = useFeedback();
  if (!feedback.available) return null;
  return (
    <View style={ui.section}>
      <Text style={ui.sectionHeading}>{t("feedback.settingsHeading")}</Text>
      <ListGroup>
        <ListRow
          title={t("feedback.reportRow")}
          detail={feedback.savedReport ? t("feedback.reportRowSaved") : t("feedback.reportRowDetail")}
          icon="chatbubble-ellipses-outline"
          onPress={feedback.openReport}
        />
        <ListRow
          title={t("feedback.guideRow")}
          icon="help-circle-outline"
          onPress={feedback.openGuide}
        />
        <ShakeRow enabled={feedback.shakeEnabled} onChange={feedback.setShakeEnabled} />
      </ListGroup>
    </View>
  );
}

function ShakeRow({ enabled, onChange, isLast }: { enabled: boolean; onChange: (enabled: boolean) => void; isLast?: boolean }) {
  const { t } = useT();
  const theme = useTheme();
  const { styles } = useThemeContext();
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.rowIcon}>
        <Ionicons name="phone-portrait-outline" size={20} color={theme.foreground} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{t("feedback.shakeRow")}</Text>
          <Text style={styles.rowDetail}>{t("feedback.shakeRowDetail")}</Text>
        </View>
      </View>
      <Switch
        accessibilityLabel={t("feedback.shakeRow")}
        value={enabled}
        onValueChange={onChange}
        trackColor={{ true: theme.primary, false: theme.border }}
      />
    </View>
  );
}
