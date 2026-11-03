import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import { CategorySheet } from "./CategorySheet";
import { useCategoryPicker } from "./useCategoryPicker";
import type { AccountSetupRequest, CategoryNature } from "./model";
import type { TransactionCategories } from "./transactionSelection";

export type CategoryPickerProps = {
  workspaceId: string;
  onAccountSetup?: (request: AccountSetupRequest) => boolean;
  value: TransactionCategories;
  onChange: (value: TransactionCategories, nature: CategoryNature | null) => void;
  visible: boolean;
  onClose: () => void;
};

export function CategoryPicker({
  visible,
  onClose,
  onAccountSetup,
  ...selection
}: CategoryPickerProps) {
  const sheet = useRef<BottomSheetModal>(null);
  const presentation = useRef<"hidden" | "opening" | "open" | "closing">("hidden");
  const accountRequest = useRef<AccountSetupRequest | null>(null);
  function close() {
    const current = presentation.current;
    if (current === "hidden" || current === "closing") return;
    presentation.current = "closing";
    if (current === "open") sheet.current?.dismiss();
  }
  const picker = useCategoryPicker({ kind: "posting", ...selection,
    onAccountSetup: onAccountSetup ? (request) => { accountRequest.current = request; return true; } : undefined,
  }, close);
  const busy = picker.sheet.busy;
  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) close();
      return true;
    });
    return () => subscription.remove();
  }, [visible, busy]);
  useEffect(() => {
    if (visible && presentation.current === "hidden") {
      presentation.current = "opening";
      sheet.current?.present();
    }
    else if (!visible) close();
  }, [visible]);
  return <CategorySheet {...picker.sheet} sheetRef={sheet} onPresented={() => {
    if (presentation.current === "closing") sheet.current?.dismiss();
    else if (presentation.current === "opening") presentation.current = "open";
  }} onDismiss={() => {
    if (presentation.current === "hidden") return;
    presentation.current = "hidden";
    picker.sheet.onBack();
    onClose();
    const request = accountRequest.current;
    accountRequest.current = null;
    if (request) onAccountSetup?.(request);
  }} />;
}
