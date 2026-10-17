import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Screen } from "../../ui/core";
import { api } from "../api";
import { BudgetBoard } from "./BudgetBoard";
import { BudgetEditorSheet } from "./BudgetEditorSheet";
import { monthLabel, shiftMonth, type BudgetCategory } from "./model";
import { useBudgetEditor, type BudgetEditorSeed } from "./useBudgetEditor";

export function Budget({ workspaceId, onBack }: { workspaceId: string; onBack: () => void }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<{ key: string; seed: BudgetEditorSeed; categories: BudgetCategory[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshKey, refresh] = useState(Crypto.randomUUID);
  const board = useQuery(api.budget.evaluate, { workspaceId, refreshKey, ...(month ? { month } : {}) });
  const interact = useLocalEntryInteraction();
  if (!board) return <Screen><ActivityIndicator accessibilityLabel="Loading Budget" /></Screen>;
  return (
    <>
      <BudgetBoard month={board.month} currency={board.currency} jars={board.jars} saved={saved}
        canEdit={board.month === board.currentMonth} onBack={onBack}
        onMonth={(offset) => { interact(); setMonth(shiftMonth(board.month, offset)); setSaved(false); }}
        onCurrentMonth={() => { interact(); setMonth(undefined); refresh(Crypto.randomUUID()); setSaved(false); }}
        onAdd={() => {
          if (board.month !== board.currentMonth) return;
          interact(); setSaved(false);
          setEditor({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: null }, categories: board.availableCategories });
        }}
        onEdit={(jar) => {
          if (board.month !== board.currentMonth) return;
          const current = board.jars.find((item) => item.category.id === jar.category.id);
          if (!current) return;
          interact(); setSaved(false);
          setEditor({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: current }, categories: [current.category] });
        }} />
      {editor && <Editor key={editor.key} seed={editor.seed} categories={editor.categories}
        onClose={() => { setEditor(null); refresh(Crypto.randomUUID()); }}
        onSaved={() => { setEditor(null); refresh(Crypto.randomUUID()); setSaved(true); }} />}
    </>
  );
}

function Editor({ seed, categories, onClose, onSaved }: {
  seed: BudgetEditorSeed; categories: BudgetCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const save = useAction(api.budget.setCategoryLimit);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const editor = useBudgetEditor(seed, { save, reportFailure, newKey: Crypto.randomUUID, onSaved });
  return <BudgetEditorSheet title={seed.jar ? "Edit Budget" : "Add Budget"}
    monthLabel={monthLabel(seed.month)} currency={seed.currency} categories={categories}
    categoryFixed={!!seed.jar}
    policyCopy="Repeats each month. Changes apply to this month and future months. Past months keep their limits. Unspent money does not roll over."
    {...editor}
    onCategory={(id) => { interact(); editor.onCategory(id); }}
    onSearch={(value) => { interact(); editor.onSearch(value); }}
    onAmount={(value) => { interact(); editor.onAmount(value); }}
    onSave={() => { interact(); void editor.submit(); }} onDismiss={onClose} />;
}
