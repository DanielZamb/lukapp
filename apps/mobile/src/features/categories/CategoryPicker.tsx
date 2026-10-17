import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { CategorySheet } from "./CategorySheet";
import { useCategoryPicker } from "./useCategoryPicker";

export type CategoryPickerProps = {
  workspaceId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  visible: boolean;
  onClose: () => void;
};

export function CategoryPicker({
  visible,
  onClose,
  ...selection
}: CategoryPickerProps) {
  const sheet = useRef<BottomSheetModal>(null);
  const picker = useCategoryPicker({ kind: "posting", ...selection }, onClose);
  useEffect(() => {
    if (visible) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [visible]);
  return <CategorySheet {...picker.sheet} sheetRef={sheet} />;
}
