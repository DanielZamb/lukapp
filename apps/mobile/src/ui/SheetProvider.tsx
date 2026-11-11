import type { PropsWithChildren } from "react";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SheetAccessibilityBoundary, SheetAccessibilityProvider } from "./SheetAccessibility";

export function SheetProvider({ children }: PropsWithChildren) {
  return <SheetAccessibilityProvider>
    <BottomSheetModalProvider>
      <SheetAccessibilityBoundary>{children}</SheetAccessibilityBoundary>
    </BottomSheetModalProvider>
  </SheetAccessibilityProvider>;
}
