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
import {
  createTranslator,
  resolveLanguage,
  type Language,
  type LanguagePreference,
  type Translator,
} from "../../../../src/i18n";
import { readLanguagePreference, writeLanguagePreference } from "./languageStorage";

export type { Language, LanguagePreference, MessageKey, Translator } from "../../../../src/i18n";
export { languageNames, languages } from "../../../../src/i18n";
export * from "../../../../src/i18n/format";

export function deviceLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

type LanguageContextValue = Translator & {
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
};

let active: Translator = createTranslator("en");

/**
 * The translator for code that runs outside React, such as a thrown validation
 * message. Components use `useT()` so they re-render when the language changes.
 */
export function activeTranslator(): Translator {
  return active;
}

const fallback: LanguageContextValue = {
  ...createTranslator("en"),
  preference: "system",
  setPreference: () => {},
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  initialPreference,
  locale,
}: PropsWithChildren<{ initialPreference?: LanguagePreference; locale?: string }>) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(initialPreference ?? "system");
  const userChose = useRef(false);
  useEffect(() => {
    if (initialPreference) return;
    void readLanguagePreference().then((stored) => {
      if (!userChose.current) setPreferenceState(stored);
    }).catch(() => {});
  }, [initialPreference]);
  const setPreference = useCallback((next: LanguagePreference) => {
    userChose.current = true;
    setPreferenceState(next);
    void writeLanguagePreference(next).catch(() => {});
  }, []);
  const language: Language = resolveLanguage(preference, locale ?? deviceLocale());
  const value = useMemo(() => {
    const translator = createTranslator(language);
    active = translator;
    return { ...translator, preference, setPreference };
  }, [language, preference, setPreference]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) ?? fallback;
}

/** `const { t, tn, language } = useT();` */
export function useT(): Translator {
  return useLanguage();
}
