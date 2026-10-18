import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Choice, Field, useUi } from "../ui/core";
import { spacing } from "../ui/tokens";
import {
  deviceTimeZone,
  filterTimeZones,
  orderedTimeZones,
  timeZoneLabel,
} from "./timeZones";

export function TimeZonePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (timeZone: string) => void;
  disabled?: boolean;
}) {
  const ui = useUi();
  const [query, setQuery] = useState("");
  const zones = useMemo(
    () => filterTimeZones(orderedTimeZones(deviceTimeZone()), query),
    [query],
  );
  return (
    <View style={ui.section}>
      <Text style={ui.label}>3 · TIMEZONE</Text>
      <Field
        label="Search timezones"
        helperText="Dates and months use this timezone."
        accessibilityLabel="Search timezones"
        value={query}
        onChangeText={setQuery}
        editable={!disabled}
        InputComponent={BottomSheetTextInput}
      />
      <View style={{ gap: spacing.sm }}>
        {zones.map((zone) => (
          <Choice
            key={zone}
            label={timeZoneLabel(zone)}
            detail={zone}
            selected={value === zone}
            onPress={() => {
              if (!disabled) onChange(zone);
            }}
          />
        ))}
      </View>
    </View>
  );
}
