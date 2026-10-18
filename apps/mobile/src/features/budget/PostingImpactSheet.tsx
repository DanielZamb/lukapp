import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { Header, PrimaryButton, SecondaryButton, useUi, useTheme } from "../../ui/core";
import { spacing } from "../../ui/tokens";
import type { PostingBudgetImpact } from "./postingImpact";

export function PostingImpactSheet({
  description,
  hits,
  onContinue,
  onReconsider,
}: {
  description: string;
  hits: PostingBudgetImpact;
  onContinue: () => void;
  onReconsider: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const decided = useRef(false);
  useEffect(() => { sheet.current?.present(); }, []);
  function decide(action: () => void) {
    if (decided.current) return;
    decided.current = true;
    action();
  }
  return (
    <BottomSheetModal
      ref={sheet}
      onDismiss={() => decide(onReconsider)}
      backgroundStyle={{ backgroundColor: theme.background }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
      )}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: spacing.xxl, gap: spacing.xl }}>
        <Header title={description || "Entry"} eyebrow="BUDGET WOULD CROSS" />
        {hits.map((hit, index) => (
          <Text key={hit.category.id} style={[index === 0 ? ui.title : ui.body, { color: theme.danger }]}>
            {hit.category.name} {new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(hit.overMinorUnits / 100)} over
          </Text>
        ))}
        <Text style={ui.muted}>Continue still posts. A budget does not block.</Text>
        <PrimaryButton label="Continue anyway" onPress={() => decide(onContinue)} />
        <SecondaryButton label="Reconsider" onPress={() => decide(onReconsider)} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
