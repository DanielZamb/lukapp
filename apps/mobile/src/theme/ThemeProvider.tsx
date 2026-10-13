import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { themes } from "./tokens";
import type { Theme } from "./tokens";

const ThemeContext = createContext<Theme>(themes.light);

export function ThemeProvider({ children }: PropsWithChildren) {
  const mode = useColorScheme() === "dark" ? "dark" : "light";
  return <ThemeContext value={themes[mode]}>{children}</ThemeContext>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
