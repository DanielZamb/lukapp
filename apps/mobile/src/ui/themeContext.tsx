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
import { Platform, useWindowDimensions } from "react-native";
import { defaultLayout, readableLayout, type ReadableLayout } from "./layout";
import { controls, themes, type Theme, type ThemeMode } from "./tokens";
import { createCoreStyles, createUiStyles, type CoreStyles, type UiStyles } from "./styles";
import { readThemeMode, writeThemeMode } from "./themeModeStorage";
import { effectiveFontScale, readTextSize, writeTextSize, type StoredTextSize, type TextSizePreference } from "./textSize";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: Theme;
  ui: UiStyles;
  styles: CoreStyles;
  layout: ReadableLayout;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
/** `fontScale` is the text size drawn for; `systemScale` is the phone's own, which the platform applies by itself. */
const NativeTextContext = createContext({ fontScale: 1, systemScale: 1, nonlinearAndroid: false });
export function useNativeTextMetrics() { return useContext(NativeTextContext); }

type TextSizeValue = StoredTextSize & { loaded: boolean; choose: (preference: TextSizePreference) => void };
const TextSizeContext = createContext<TextSizeValue>({ preference: "phone", asked: true, loaded: true, choose: () => {} });
/** The app's own text size: the stored choice, whether the first-run question was answered, and how to change it. */
export function useTextSize() { return useContext(TextSizeContext); }

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
  const { width, fontScale: systemScale } = useWindowDimensions();
  const [stored, setStored] = useState<StoredTextSize & { loaded: boolean }>({ preference: "phone", asked: false, loaded: false });
  const chose = useRef(false);
  useEffect(() => {
    void readTextSize().then((value) => { if (!chose.current) setStored({ ...value, loaded: true }); })
      .catch(() => { if (!chose.current) setStored((now) => ({ ...now, loaded: true })); });
  }, []);
  const choose = useCallback((preference: TextSizePreference) => {
    chose.current = true;
    setStored({ preference, asked: true, loaded: true });
    void writeTextSize(preference).catch(() => {});
  }, []);
  const fontScale = effectiveFontScale(systemScale, stored.preference);
  const layout = useMemo(() => readableLayout({ width, fontScale }), [width, fontScale]);
  const metrics = useMemo(() => ({ fontScale, systemScale, nonlinearAndroid: Platform.OS === "android" && Number(Platform.Version) >= 34 }), [fontScale, systemScale]);
  const textSize = useMemo(() => ({ ...stored, choose }), [stored, choose]);
  return <TextSizeContext.Provider value={textSize}><NativeTextContext.Provider value={metrics}>
    <ThemeProvider layout={layout}>{children}</ThemeProvider>
  </NativeTextContext.Provider></TextSizeContext.Provider>;
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
