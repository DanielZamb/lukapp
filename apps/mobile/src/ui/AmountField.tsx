import { View } from "react-native";
import { Text } from "./Text";
import { TextInput, type TextInputProps } from "./TextInput";
import { useReflowStyles } from "./reflow";
import { TintCard } from "./surfaces";
import { AmountDirection } from "./summaries";
import { useThemeContext } from "./themeContext";

export type AmountFieldProps = Omit<TextInputProps, "preset"> & {
  currency: string; legacyCurrency?: string; direction?: "in" | "out"; directionLabel?: string;
};
export function AmountField({ currency, legacyCurrency = currency, direction, directionLabel, style, ...inputProps }: AmountFieldProps) {
  const { layout, theme } = useThemeContext();
  const flow = useReflowStyles();
  const large = layout.tier === "xxxl";
  const input = <TextInput {...inputProps} preset="amountInput" style={[
    { minHeight: 64, padding: 0 }, flow.flex(1, 0), large && { color: theme.foreground, flex: 0 }, style,
  ]} />;
  if (!large) return <View style={[flow.row("center", "stretch"), { gap: 8, minHeight: 72 }]}>
    <Text preset="amountCurrency" tone="muted">{legacyCurrency}</Text>{input}
  </View>;
  return <TintCard focused>
    <Text variant="label" tone="primary">{currency}</Text>
    {input}
    {direction ? <AmountDirection direction={direction} label={directionLabel} /> : directionLabel ? <AmountDirection direction="transfer" label={directionLabel} /> : null}
  </TintCard>;
}
