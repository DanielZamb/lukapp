import { useState } from "react";
import { Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme, ui } from "../ui/core";
import { SearchSheet } from "./setup/SearchSheet";
import { setupStyles as styles } from "./setup/styles";
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Timezone, ${value}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, { minHeight: 48 }]}
      >
        <Text style={styles.label}>Timezone</Text>
        <Text style={[ui.muted, { flex: 1, textAlign: "right" }]}>
          {timeZoneLabel(value)}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.mutedForeground}
        />
      </Pressable>
      {open && (
        <SearchSheet
          label="Search timezones"
          placeholder="Search timezones"
          selected={value}
          options={orderedTimeZones(deviceTimeZone()).map((code) => ({
            code,
            name: timeZoneLabel(code),
          }))}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
