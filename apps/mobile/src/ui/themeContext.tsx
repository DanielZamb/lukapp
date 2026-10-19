import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { themes, type Theme, type ThemeMode } from "./tokens";
import { createCoreStyles, createUiStyles, type CoreStyles, type UiStyles } from "./styles";
import { readThemeMode, writeThemeMode } from "./themeModeStorage";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: Theme;
  ui: UiStyles;
  styles: CoreStyles;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const fallbackTheme = themes.light;
const fallbackBundle: ThemeContextValue = {
  mode: "light",
  theme: fallbackTheme,
  ui: createUiStyles(fallbackTheme),
  styles: createCoreStyles(fallbackTheme),
  setMode: () => {},
};

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const userChoseMode = useRef(false);
  useEffect(() => {
    void readThemeMode().then((storedMode) => {
      if (!userChoseMode.current) setModeState(storedMode);
    });
  }, []);
  const setMode = useCallback((next: ThemeMode) => {
    userChoseMode.current = true;
    setModeState(next);
    void writeThemeMode(next);
  }, []);
  const theme = themes[mode];
  const ui = useMemo(() => createUiStyles(theme), [theme]);
  const styles = useMemo(() => createCoreStyles(theme), [theme]);
  const value = useMemo(
    () => ({ mode, theme, ui, styles, setMode }),
    [mode, theme, ui, styles, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  return useContext(ThemeContext) ?? fallbackBundle;
}

export function useTheme() {
  return useThemeContext().theme;
}

export function useUi() {
  return useThemeContext().ui;
}

export function useThemeMode() {
  return useThemeContext().mode;
}

export function useSetThemeMode() {
  return useThemeContext().setMode;
}
