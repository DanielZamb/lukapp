import { toMajorUnits } from "../money";
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
import { spacing } from "../../ui/tokens";
import type { PostingBudgetImpact } from "./postingImpact";
import { Sheet } from "../../ui/Sheet";

export function PostingImpactSheet({
  description,
  currency,
  hits,
  categoryColors,
  onContinue,
  onReconsider,
}: {
  description: string;
  currency: string;
  hits: PostingBudgetImpact;
  categoryColors?: Record<string, ComponentProps<typeof EmojiTile>["color"]>;
  onContinue: () => void;
  onReconsider: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const decided = useRef(false);
  useEffect(() => {
    sheet.current?.present();
  }, []);
  function decide(action: () => void) {
    if (decided.current) return;
    decided.current = true;
    action();
  }
  return (
    <Sheet
      sheetRef={sheet}
      label="Budget would cross"
      tall
      closeLabel={false}
      onDismiss={() => decide(onReconsider)}
      footer={
        <ActionBar
          primary={{
            label: "Post anyway",
            icon: "checkmark",
            onPress: () => decide(onContinue),
          }}
          secondary={{
            label: "Reconsider",
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
              title={description || "Entry"}
              eyebrow="BUDGET WOULD CROSS"
            />
            {hits.map((hit, index) => (
              <Text
                preset={index === 0 ? "impactAmount" : "body"}
                key={`${hit.category.id}-${index}`}
                tone="danger"
              >
                {hit.category.name}{" "}
                {new Intl.NumberFormat("en", {
                  notation: "compact",
                  maximumFractionDigits: 2,
                }).format(toMajorUnits(hit.overMinorUnits, currency))}
                {" over"}
              </Text>
            ))}
            <Text preset="body" style={ui.muted}>
              Continue still posts. A budget does not block.
            </Text>
            <PrimaryButton
              label="Continue anyway"
              onPress={() => decide(onContinue)}
            />
            <SecondaryButton
              label="Reconsider"
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
      <Text variant="section">{description || "Entry"}</Text>
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
              {new Intl.NumberFormat("en", {
                notation: "compact",
                maximumFractionDigits: 2,
              }).format(toMajorUnits(hit.overMinorUnits, currency))}{" "}
              over
            </Text>
          </View>
        ))}
      </View>
      <Text variant="body" tone="muted">
        Posting still works. A budget never blocks.
      </Text>
    </Sheet>
  );
}
