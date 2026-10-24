import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { View } from "react-native";

type SheetAccessibility = {
  presented: ReadonlySet<symbol>;
  setPresented: (id: symbol, open: boolean) => void;
};
const empty: SheetAccessibility = { presented: new Set(), setPresented: () => {} };
const Context = createContext(empty);

export function SheetAccessibilityProvider({ children }: PropsWithChildren) {
  const [presented, setPresentedState] = useState<ReadonlySet<symbol>>(new Set());
  const setPresented = useCallback((id: symbol, open: boolean) => {
    setPresentedState((previous) => {
      if (previous.has(id) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ presented, setPresented }), [presented, setPresented]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSheetAccessibility() {
  return useContext(Context);
}

export function SheetAccessibilityBoundary({ children }: PropsWithChildren) {
  const hidden = useSheetAccessibility().presented.size > 0;
  return <View style={{ flex: 1 }} accessibilityElementsHidden={hidden || undefined}
    importantForAccessibility={hidden ? "no-hide-descendants" : undefined}>{children}</View>;
}
