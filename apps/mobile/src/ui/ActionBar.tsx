import { createContext, useContext, type PropsWithChildren, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useTheme, useTier } from "./themeContext";
import { PrimaryButton, SecondaryButton } from "./core";
import { xxxl } from "./tokens";
import type { IconName } from "./surfaces";

export type BarAction = { label: string; onPress: () => void; disabled?: boolean; pending?: boolean; icon?: IconName };
export type SecondaryBarAction = BarAction & { tone?: "danger" };
export type ActionBarProps = {
  primary?: BarAction;
  secondary?: SecondaryBarAction | readonly SecondaryBarAction[];
  status?: ReactNode;
  legacy?: ReactNode;
};
const FooterContext = createContext(false);
export function FooterFrame({ children, onLayout }: PropsWithChildren<{ onLayout?: (event: LayoutChangeEvent) => void }>) {
  const theme = useTheme();
  const framed = useContext(FooterContext);
  if (framed) return children;
  return <FooterContext.Provider value={true}><View onLayout={onLayout} style={{ paddingHorizontal: xxxl.spacing.footerHorizontal, paddingVertical: xxxl.spacing.footerVertical, gap: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.background }}>{children}</View></FooterContext.Provider>;
}
export function ActionBar({ primary, secondary, status, legacy = null }: ActionBarProps) {
  const tier = useTier();
  if (tier !== "xxxl") return legacy;
  const actions = secondary ? (Array.isArray(secondary) ? secondary : [secondary]) : [];
  return <FooterFrame>
    {status ? <View style={{ paddingBottom: 8 }}>{status}</View> : null}
    {primary ? <PrimaryButton {...primary} trailingIcon={primary.icon} /> : null}
    {actions.map((action, index) => <SecondaryButton key={index} {...action} />)}
  </FooterFrame>;
}
