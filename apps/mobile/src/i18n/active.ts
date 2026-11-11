import { createTranslator, type Translator } from "../../../../src/i18n";

let active: Translator = createTranslator("en");

/**
 * The translator for code that runs outside React, such as a thrown validation
 * message. Components use `useT()` so they re-render when the language changes.
 * Kept free of React so plain modules can import it.
 */
export function activeTranslator(): Translator {
  return active;
}

export function setActiveTranslator(translator: Translator) {
  active = translator;
}
