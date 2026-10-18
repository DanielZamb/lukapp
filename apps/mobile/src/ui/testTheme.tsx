import { createElement, type ReactElement } from "react";
import { ThemeProvider } from "./themeContext";

export function withThemeProvider(node: ReactElement) {
  return createElement(ThemeProvider, null, node);
}
