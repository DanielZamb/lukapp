import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { Header, PrimaryButton, SecondaryButton, useUi, useTheme } from "../../ui/core";
import { useT } from "../../i18n";
import { compactMoney } from "../amount/compact";
import { font, spacing } from "../../ui/tokens";
import type { Shown } from "../confirmation";
import type { PostingBudgetImpact } from "./postingImpact";

/** What a Budget warning shows: the entry's description and how far each jar goes over. */
export type ImpactView = Readonly<{ description: string; hits: PostingBudgetImpact }>;

/** The Budget warning before posting. Its two answers hand back the warning they were shown on. */
export function PostingImpactSheet<S extends ImpactView>({
  shown,
  currency,
  onContinue,
  onReconsider,
}: {
  shown: Shown<S>;
  currency: string;
  onContinue: (shown: Shown<S>) => void;
  onReconsider: (shown: Shown<S>) => void;
}) {
  const { description, hits } = shown.snapshot;
  const ui = useUi();
  const theme = useTheme();
  const { t, language } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const decided = useRef(false);
  useEffect(() => { sheet.current?.present(); }, []);
  function decide(action: (shown: Shown<S>) => void) {
    if (decided.current) return;
    decided.current = true;
    action(shown);
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
              amount: compactMoney(hit.overMinorUnits, currency, language, "budget") })}
          </Text>
        ))}
        <Text style={ui.muted}>{t("budget.impactBody")}</Text>
        <PrimaryButton label={t("budget.impactContinue")} onPress={() => decide(onContinue)} />
        <SecondaryButton label={t("budget.impactReconsider")} onPress={() => decide(onReconsider)} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
