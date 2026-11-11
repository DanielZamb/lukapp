import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef, type ComponentProps } from "react";
import { View } from "react-native";
import {
  ActionBar,
  EmojiTile,
  Header,
  PrimaryButton,
  SecondaryButton,
  Text,
  useUi,
  useTheme,
} from "../../ui/core";
import { useT } from "../../i18n";
import { compactMoney } from "../amount/compact";
import { spacing } from "../../ui/tokens";
import type { Shown } from "../confirmation";
import type { PostingBudgetImpact } from "./postingImpact";
import { Sheet } from "../../ui/Sheet";

/** What a Budget warning shows: the entry's description and how far each jar goes over. */
export type ImpactView = Readonly<{ description: string; hits: PostingBudgetImpact }>;

/** The Budget warning before posting. Its two answers hand back the warning they were shown on. */
export function PostingImpactSheet<S extends ImpactView>({
  shown,
  currency,
  categoryColors,
  onContinue,
  onReconsider,
}: {
  shown: Shown<S>;
  currency: string;
  categoryColors?: Record<string, ComponentProps<typeof EmojiTile>["color"]>;
  onContinue: (shown: Shown<S>) => void;
  onReconsider: (shown: Shown<S>) => void;
}) {
  const { description, hits } = shown.snapshot;
  const ui = useUi();
  const theme = useTheme();
  const { t, language } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const decided = useRef(false);
  useEffect(() => {
    sheet.current?.present();
  }, []);
  function decide(action: (shown: Shown<S>) => void) {
    if (decided.current) return;
    decided.current = true;
    action(shown);
  }
  const over = (minorUnits: number) => compactMoney(minorUnits, currency, language, "budget");
  return (
    <Sheet
      sheetRef={sheet}
      label={t("budget.impactTitle")}
      closeLabel={false}
      onDismiss={() => decide(onReconsider)}
      footer={
        <ActionBar
          primary={{
            label: t("budget.impactPostAnyway"),
            icon: "checkmark",
            onPress: () => decide(onContinue),
          }}
          secondary={{
            label: t("budget.impactReconsider"),
            onPress: () => decide(onReconsider),
          }}
        />
      }
      legacyFooter={null}
      legacyBody={
        <>
          <BottomSheetScrollView
            contentContainerStyle={{ padding: spacing.xxl, gap: spacing.xl }}
          >
            <Header
              title={description || t("budget.impactEntry")}
              eyebrow={t("budget.impactEyebrow")}
            />
            {hits.map((hit, index) => (
              <Text
                preset={index === 0 ? "impactAmount" : "body"}
                key={`${hit.category.id}-${index}`}
                tone="danger"
              >
                {t("budget.impactOver", { name: hit.category.name, amount: over(hit.overMinorUnits) })}
              </Text>
            ))}
            <Text preset="body" style={ui.muted}>
              {t("budget.impactBody")}
            </Text>
            <PrimaryButton
              label={t("budget.impactContinue")}
              onPress={() => decide(onContinue)}
            />
            <SecondaryButton
              label={t("budget.impactReconsider")}
              onPress={() => decide(onReconsider)}
            />
          </BottomSheetScrollView>
        </>
      }
      legacyNativeModalProps={{
        backgroundStyle: { backgroundColor: theme.background },
        backdropComponent: (props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        ),
      }}
    >
      <Text variant="section" accessibilityRole="header">{t("budget.impactTitle")}</Text>
      <Text variant="section">{description || t("budget.impactEntry")}</Text>
      <View style={{ gap: spacing.xxl }}>
        {hits.map((hit, index) => (
          <View key={`${hit.category.id}-${index}`} style={{ gap: spacing.md }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <EmojiTile
                emoji={hit.category.emoji}
                color={categoryColors?.[hit.category.id] ?? theme.primary}
                size={36}
              />
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {hit.category.name}
              </Text>
            </View>
            <Text variant="screen" tone="danger">
              {t("budget.impactOverAmount", { amount: over(hit.overMinorUnits) })}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="body" tone="muted">
        {t("budget.impactBodyLarge")}
      </Text>
    </Sheet>
  );
}
