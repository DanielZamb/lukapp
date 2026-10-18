import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Choice, Field, Header, Screen, theme, ui } from "../../ui/core";
import { api } from "../api";
import { useLevelNavigation } from "../levelDoor/navigation";
import { BudgetComposer, limitSuggestions } from "./BudgetComposer";
import type { BudgetCategory } from "./model";
import { useBudgetEditor, type BudgetEditorSeed } from "./useBudgetEditor";

export function BudgetCreation({ seed, categories, categoryColors, unlocking, onClose, onSaved }: {
  seed: BudgetEditorSeed;
  categories: BudgetCategory[];
  categoryColors: ReadonlyMap<string, string>;
  unlocking: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useAction(api.budget.setCategoryLimit);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const navigation = useLevelNavigation();
  const unlockingSave = useRef<boolean | null>(null);
  const editor = useBudgetEditor(seed, {
    save: (request) => { unlockingSave.current ??= unlocking; return save(request); },
    reportFailure, newKey: Crypto.randomUUID,
    onSaved: ({ revision }) => {
      onSaved();
      const category = categories.find((item) => item.id === revision.categoryId);
      if (unlockingSave.current && category) navigation.showUnlocked({
        door: "budget", category: category.name, emoji: category.emoji,
        color: categoryColors.get(category.id) ?? theme.primary, currency: seed.currency,
        limitMinorUnits: revision.limitMinorUnits,
      });
      else navigation.home();
    },
  });
  const totals = useQuery(api.accounting.categoryTotals, { workspaceId: seed.workspaceId, month: seed.month });
  const selected = categories.find((category) => category.id === editor.categoryId);
  const initializedCategory = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!selected || !totals || initializedCategory.current === selected.id) return;
    const spent = totals.categories.find((category) => category.categoryId === selected.id)?.minorUnits ?? 0;
    editor.onAmount(String((limitSuggestions(spent)[1] ?? 40_000_000) / 100));
    initializedCategory.current = selected.id;
  }, [selected, totals, editor.onAmount]);
  const matches = categories.filter((category) => category.name.toLocaleLowerCase().includes(editor.search.trim().toLocaleLowerCase()));
  if (!selected) return (
    <Screen>
      <Header title="Choose a category" eyebrow="BUDGET" onBack={onClose} />
      <Field label="Category" accessibilityLabel="Search Budget categories" placeholder="Search categories"
        value={editor.search} onChangeText={(value) => { interact(); editor.onSearch(value); }} />
      {matches.map((category) => <Choice key={category.id} label={`${category.emoji} ${category.name}`} selected={false}
          onPress={() => { interact(); editor.onCategory(category.id); }} />)}
      {!categories.length && <Text style={ui.muted}>No categories available. Add an expense category from Post money first.</Text>}
      {!!categories.length && !matches.length && <Text style={ui.muted}>No matching categories.</Text>}
    </Screen>
  );
  if (!totals) return <Screen>
    <Header title={`Limit for ${selected.name}`} eyebrow="BUDGET" onBack={onClose} />
    <ActivityIndicator accessibilityLabel="Loading category spending" />
  </Screen>;
  return <BudgetComposer category={selected} currency={seed.currency}
    spentMinorUnits={totals.categories.find((category) => category.categoryId === selected.id)?.minorUnits ?? 0}
    color={categoryColors.get(selected.id) ?? theme.primary} {...editor}
    onAmount={(value) => { interact(); editor.onAmount(value); }}
    onSave={() => { interact(); void editor.submit(); }} onBack={onClose} />;
}
