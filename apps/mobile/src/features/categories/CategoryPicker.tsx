import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import { CategorySheet } from "./CategorySheet";
import { useCategoryPicker } from "./useCategoryPicker";
import type { TransactionCategories } from "./transactionSelection";

export type CategoryPickerProps = {
  workspaceId: string;
  direction?: "in" | "out";
  value: TransactionCategories;
  onChange: (value: TransactionCategories) => void;
  visible: boolean;
  onClose: () => void;
};

export function CategoryPicker({
  visible,
  onClose,
  ...selection
}: CategoryPickerProps) {
  const sheet = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const picker = useCategoryPicker({ kind: "posting", ...selection }, onClose);
  const busy = picker.sheet.busy;
  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) sheet.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, busy]);
  useEffect(() => {
    if (visible) sheet.current?.present();
    // Dismissing Gorhom's never-presented modal blocks its first portal mount.
    else if (presented.current) sheet.current?.dismiss();
    presented.current = visible;
  }, [visible]);
  return <CategorySheet {...picker.sheet} sheetRef={sheet} onDismiss={() => {
    presented.current = false;
    picker.sheet.onDismiss();
  }} />;
}
