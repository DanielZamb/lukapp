import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Header, ListGroup, PrimaryButton, SecondaryButton, theme, ui } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";
import type { BudgetCategory } from "./model";

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
        <Header title={props.title} eyebrow={props.monthLabel.toUpperCase()} />
        <Text style={ui.label}>CATEGORY</Text>
        {props.categoryFixed ? <Text style={ui.title}>{selected?.emoji} {selected?.name}</Text> : (
          <>
            <BottomSheetTextInput accessibilityLabel="Search Budget categories" placeholder="Search categories"
              placeholderTextColor={theme.mutedForeground} value={props.search} onChangeText={props.onSearch}
              editable={props.editable} style={ui.input} />
            {categories === undefined ? <ActivityIndicator /> : categories.length ? (
              <ListGroup>
                {categories.map((category) => (
                  <Pressable key={category.id} accessibilityRole="radio"
                    accessibilityState={{ checked: category.id === props.categoryId, disabled: !props.editable }}
                    disabled={!props.editable} onPress={() => props.onCategory(category.id)}
                    style={{ minHeight: touchTarget, padding: spacing.lg, flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={ui.body}>{category.emoji} {category.name}</Text>
                    <Text style={ui.body}>{category.id === props.categoryId ? "●" : "○"}</Text>
                  </Pressable>
                ))}
              </ListGroup>
            ) : <Text style={ui.muted}>No categories available. Add an expense category from Post money first.</Text>}
          </>
        )}
        <Text style={ui.label}>LIMIT IN {props.currency}</Text>
        <BottomSheetTextInput accessibilityLabel={`Budget limit in ${props.currency}`} keyboardType="decimal-pad"
          placeholder="0" placeholderTextColor={theme.mutedForeground} value={props.amount}
          onChangeText={props.onAmount} editable={props.editable} style={[ui.input, ui.hero]} />
        <Text style={ui.muted}>{props.policyCopy}</Text>
        {!!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>}
        <PrimaryButton label={props.busy ? "Saving…" : props.pending ? "Retry save" : "Save Budget"} disabled={!props.canSubmit} onPress={props.onSave} />
        {props.canDismiss && <SecondaryButton label="Cancel" onPress={() => sheet.current?.dismiss()} />}
        <View style={{ height: spacing.xxl }} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
