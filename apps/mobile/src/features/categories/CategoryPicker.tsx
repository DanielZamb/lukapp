import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
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
  const presented = useRef(false);
  const accountRequest = useRef<AccountSetupRequest | null>(null);
  const picker = useCategoryPicker({ kind: "posting", ...selection,
    onAccountSetup: onAccountSetup ? (request) => { accountRequest.current = request; return true; } : undefined,
  }, () => sheet.current?.dismiss());
  useEffect(() => {
    if (visible && !presented.current) {
      presented.current = true;
      sheet.current?.present();
    }
    else if (!visible && presented.current) sheet.current?.dismiss();
  }, [visible]);
  return <CategorySheet {...picker.sheet} sheetRef={sheet} onDismiss={() => {
    if (!presented.current) return;
    presented.current = false;
    picker.sheet.onBack();
    onClose();
    const request = accountRequest.current;
    accountRequest.current = null;
    if (request) onAccountSetup?.(request);
  }} />;
}
