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
import { useWindowDimensions } from "react-native";
import { defaultLayout, readableLayout, type ReadableLayout } from "./layout";
import { controls, themes, type Theme, type ThemeMode } from "./tokens";
import { createCoreStyles, createUiStyles, type CoreStyles, type UiStyles } from "./styles";
import { SheetAccessibilityProvider } from "./SheetAccessibility";
import { readThemeMode, writeThemeMode } from "./themeModeStorage";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: Theme;
  ui: UiStyles;
  styles: CoreStyles;
  layout: ReadableLayout;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const fallbackTheme = themes.light;
const fallbackBundle: ThemeContextValue = {
  mode: "light",
  theme: fallbackTheme,
  ui: createUiStyles(fallbackTheme),
  styles: createCoreStyles(fallbackTheme),
  layout: defaultLayout,
  setMode: () => {},
};

export function ResponsiveThemeProvider({ children }: PropsWithChildren) {
  const { width, fontScale } = useWindowDimensions();
  const layout = useMemo(() => readableLayout({ width, fontScale }), [width, fontScale]);
  return <ThemeProvider layout={layout}>{children}</ThemeProvider>;
}

export function ThemeProvider({ children, layout = defaultLayout }: PropsWithChildren<{ layout?: ReadableLayout }>) {
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
  const ui = useMemo(() => createUiStyles(theme, layout), [theme, layout]);
  const styles = useMemo(() => createCoreStyles(theme, layout), [theme, layout]);
  const value = useMemo(
    () => ({ mode, theme, ui, styles, layout, setMode }),
    [mode, theme, ui, styles, layout, setMode],
  );
  return <ThemeContext.Provider value={value}><SheetAccessibilityProvider>{children}</SheetAccessibilityProvider></ThemeContext.Provider>;
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

export function useReadableLayout() {
  return useThemeContext().layout;
}

export function useThemeMode() {
  return useThemeContext().mode;
}

export function useSetThemeMode() {
  return useThemeContext().setMode;
}

export function useTier() {
  return useReadableLayout().tier;
}

export function useControls() {
  return controls[useTier()];
}
