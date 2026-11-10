import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Choice, Header, PrimaryButton, SecondaryButton, useUi, useTheme } from "../../ui/core";
import { useT } from "../../i18n";
import { spacing } from "../../ui/tokens";
import type { BudgetCategory } from "./model";
import type { AmountIssue } from "./useBudgetEditor";

export type BudgetEditorSheetProps = {
  title: string;
  monthLabel: string;
  currency: string;
  policyCopy: string;
  categories: BudgetCategory[] | undefined;
  categoryId: string | null;
  categoryFixed: boolean;
  search: string;
  amount: string;
  amountIssue: AmountIssue | null;
  busy: boolean;
  pending: boolean;
  editable: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  error: string;
  onSearch: (value: string) => void;
  onCategory: (id: string) => void;
  onAmount: (value: string) => void;
  onSave: () => void;
  onDismiss: () => void;
};

// Mounted for one editor lifetime so late acknowledgements cannot affect a newer sheet.
export function BudgetEditorSheet(props: BudgetEditorSheetProps) {
  const ui = useUi();
  const theme = useTheme();
  const { t, locale } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => { sheet.current?.present(); }, []);
  const selected = props.categories?.find((category) => category.id === props.categoryId);
  const categories = props.categories?.filter((category) =>
    category.name.toLocaleLowerCase().includes(props.search.trim().toLocaleLowerCase()));
  return (
    <BottomSheetModal ref={sheet} snapPoints={["92%"]} enableDynamicSizing={false}
      enablePanDownToClose={props.canDismiss} enableContentPanningGesture={props.canDismiss}
      onDismiss={() => { if (active.current) props.onDismiss(); }} backgroundStyle={{ backgroundColor: theme.background }}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xxl, gap: spacing.xl }}>
        <Header title={props.title} eyebrow={props.monthLabel.toLocaleUpperCase(locale)} />
        <Text style={ui.label}>{t("budget.categoryEyebrow")}</Text>
        {props.categoryFixed ? <Text style={ui.title}>{selected?.emoji} {selected?.name}</Text> : (
          <>
            <BottomSheetTextInput accessibilityLabel={t("budget.searchA11y")} placeholder={t("budget.searchPlaceholder")}
              placeholderTextColor={theme.mutedForeground} value={props.search} onChangeText={props.onSearch}
              editable={props.editable} style={ui.input} />
            {categories === undefined ? <ActivityIndicator /> : categories.length ? (
              categories.map((category) => (
                <Choice
                  key={category.id}
                  label={`${category.emoji} ${category.name}`}
                  selected={category.id === props.categoryId}
                  onPress={() => {
                    if (props.editable) props.onCategory(category.id);
                  }}
                />
              ))
            ) : <Text style={ui.muted}>{t("budget.noCategories")}</Text>}
          </>
        )}
        <Text style={ui.label}>{t("budget.limitIn", { currency: props.currency })}</Text>
        <BottomSheetTextInput accessibilityLabel={t("budget.limitInA11y", { currency: props.currency })} keyboardType="decimal-pad"
          placeholder="0" placeholderTextColor={theme.mutedForeground} value={props.amount}
          onChangeText={props.onAmount} editable={props.editable} style={[ui.input, ui.hero]} />
        <Text style={ui.muted}>{props.policyCopy}</Text>
        {props.editable && (props.amountIssue === "zero" || props.amountIssue === "notPositive")
          && <Text accessibilityRole="alert" style={ui.error}>{t("lifecycle.limitNotPositive")}</Text>}
        {!!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>}
        <PrimaryButton label={props.busy ? t("budget.saving") : props.pending ? t("budget.retrySave") : t("budget.saveBudget")} disabled={!props.canSubmit} onPress={props.onSave} />
        {props.canDismiss && <SecondaryButton label={t("common.cancel")} onPress={() => sheet.current?.dismiss()} />}
        <View style={{ height: spacing.xxl }} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
