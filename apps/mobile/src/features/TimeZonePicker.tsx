import { useState } from "react";
import { Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useT } from "../i18n";
import { useTheme, useUi } from "../ui/core";
import { SearchSheet } from "./setup/SearchSheet";
import { useSetupStyles } from "./setup/styles";
import { deviceTimeZone, orderedTimeZones, timeZoneLabel } from "./timeZones";

export function TimeZonePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (timeZone: string) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const ui = useUi();
  const translator = useT();
  const { t } = translator;
  const styles = useSetupStyles();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("setup.timeZoneA11y", { zone: value })}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, { minHeight: 48 }]}
      >
        <Text style={styles.label}>{t("setup.timeZone")}</Text>
        <Text style={[ui.muted, { flex: 1, textAlign: "right" }]}>
          {timeZoneLabel(value, translator)}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.mutedForeground}
        />
      </Pressable>
      {open && (
        <SearchSheet
          label={t("setup.searchTimeZones")}
          placeholder={t("setup.searchTimeZones")}
          selected={value}
          options={orderedTimeZones(deviceTimeZone()).map((code) => ({
            code,
            name: timeZoneLabel(code, translator),
          }))}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
