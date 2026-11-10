import { toMajorUnits } from "../money";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { Header, PrimaryButton, SecondaryButton, useUi, useTheme } from "../../ui/core";
import { formatCompactNumber, useT } from "../../i18n";
import { font, spacing } from "../../ui/tokens";
import type { PostingBudgetImpact } from "./postingImpact";

export function PostingImpactSheet({
  description,
  currency,
  hits,
  onContinue,
  onReconsider,
}: {
  description: string;
  currency: string;
  hits: PostingBudgetImpact;
  onContinue: () => void;
  onReconsider: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const { t, language } = useT();
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
        <Header title={description || t("budget.impactEntry")} eyebrow={t("budget.impactEyebrow")} />
        {hits.map((hit, index) => (
          <Text key={`${hit.category.id}-${index}`} style={[index === 0 ? { fontSize: 36, fontFamily: font.extrabold } : ui.body, { color: theme.danger }]}>
            {t("budget.impactOver", { name: hit.category.name,
              amount: formatCompactNumber(language, toMajorUnits(hit.overMinorUnits, currency)) })}
          </Text>
        ))}
        <Text style={ui.muted}>{t("budget.impactBody")}</Text>
        <PrimaryButton label={t("budget.impactContinue")} onPress={() => decide(onContinue)} />
        <SecondaryButton label={t("budget.impactReconsider")} onPress={() => decide(onReconsider)} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
