import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { TextInput, type TextInputProps } from "./TextInput";
import { useReflowStyles } from "./reflow";
import { TintCard } from "./surfaces";
import { AmountDirection } from "./summaries";
import { useThemeContext } from "./themeContext";

export type AmountFieldProps = Omit<TextInputProps, "preset"> & {
  currency: string; legacyCurrency?: string; direction?: "in" | "out"; directionLabel?: string;
  /** An amount input of the caller's own, shown in place of the plain text input. */
  children?: ReactNode;
};
type Frame = Pick<AmountFieldProps, "currency" | "legacyCurrency" | "direction" | "directionLabel"> & { children: ReactNode };
/** The amount surround (currency, card and direction) around a caller's own amount input. */
export function AmountFrame(props: Frame) {
  return <AmountField {...props} />;
}
export function AmountField({ currency, legacyCurrency = currency, direction, directionLabel, style, children, ...inputProps }: AmountFieldProps) {
  const { layout, theme } = useThemeContext();
  const flow = useReflowStyles();
  const large = layout.tier === "xxxl";
  const input = children !== undefined ? <View style={[flow.flex(1, 0), { minWidth: 0 }, large && { flex: 0 }]}>{children}</View> : <TextInput {...inputProps} preset="amountInput" style={[
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
