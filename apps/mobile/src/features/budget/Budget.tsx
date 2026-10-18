import * as Crypto from "expo-crypto";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { ActivityIndicator } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Screen, theme } from "../../ui/core";
import { api } from "../api";
import { formatMoney } from "../money";
import { BudgetBoard } from "./BudgetBoard";
import { BudgetCreation } from "./BudgetCreation";
import { BudgetEditorSheet } from "./BudgetEditorSheet";
import { BudgetLimitSheet } from "./BudgetLimitSheet";
import { monthLabel, type BudgetCategory } from "./model";
import { useBudgetEditor, type BudgetEditorSeed } from "./useBudgetEditor";

export function Budget({ workspaceId, timeZone, onBack }: { workspaceId: string; timeZone: string; onBack: () => void }) {
  const calendar = useWorkspaceCalendar(timeZone);
  const [editor, setEditor] = useState<{ key: string; seed: BudgetEditorSeed; categories: BudgetCategory[] } | null>(null);
  const [creation, setCreation] = useState<{ key: string; seed: BudgetEditorSeed; categories: BudgetCategory[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshKey, refresh] = useState(Crypto.randomUUID);
  useEffect(() => { refresh(Crypto.randomUUID()); }, [calendar.month]);
  const board = useQuery(api.budget.evaluate, { workspaceId, refreshKey, month: calendar.month });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const interact = useLocalEntryInteraction();
  if (!board || !categories) return <Screen><ActivityIndicator accessibilityLabel="Loading Budget" /></Screen>;
  if (creation) return <BudgetCreation key={creation.key} seed={creation.seed} categories={creation.categories}
    categoryColors={new Map(categories.map((category) => [category.id, theme[category.style.tone]]))}
    onClose={() => { setCreation(null); refresh(Crypto.randomUUID()); }}
    onSaved={() => { setCreation(null); refresh(Crypto.randomUUID()); setSaved(true); }} />;
  return (
    <>
      <BudgetBoard month={board.month} currency={board.currency} jars={board.jars} saved={saved}
        categoryColors={new Map(categories.map((category) => [category.id, theme[category.style.tone]]))}
        canAdd={board.availableCategories.length > 0} onBack={onBack}
        onAdd={() => {
          if (board.month !== board.currentMonth) return;
          interact(); setSaved(false);
          setCreation({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: null }, categories: board.availableCategories });
        }}
        onEdit={(jar) => {
          if (board.month !== board.currentMonth) return;
          const current = board.jars.find((item) => item.category.id === jar.category.id);
          if (!current) return;
          interact(); setSaved(false);
          setEditor({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: current }, categories: [current.category] });
        }} />
      {editor && <Editor key={editor.key} seed={editor.seed} categories={editor.categories}
        color={theme[categories.find((category) => category.id === editor.seed.jar?.category.id)?.style.tone ?? "primary"]}
        onClose={() => { setEditor(null); refresh(Crypto.randomUUID()); }}
        onSaved={() => { setEditor(null); refresh(Crypto.randomUUID()); setSaved(true); }} />}
    </>
  );
}

function Editor({ seed, categories, color, onClose, onSaved }: {
  seed: BudgetEditorSeed; categories: BudgetCategory[]; color: string; onClose: () => void; onSaved: () => void;
}) {
  const save = useAction(api.budget.setCategoryLimit);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const editor = useBudgetEditor(seed, { save, reportFailure, newKey: Crypto.randomUUID, onSaved });
  const [year, month] = seed.month.split("-").map(Number);
  const previousMonth = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
  const previous = useQuery(api.accounting.categoryTotals, seed.jar ? { workspaceId: seed.workspaceId, month: previousMonth } : "skip");
  if (seed.jar) return <BudgetLimitSheet month={seed.month} currency={seed.currency} jar={seed.jar} color={color}
    previousMonth={previousMonth}
    previousSpendMinorUnits={previous ? previous.categories.find((category) => category.categoryId === editor.categoryId)?.minorUnits ?? 0 : undefined}
    {...editor}
    onLimit={(minorUnits) => { interact(); editor.onAmount(formatMoney({ currency: seed.currency, minorUnits }).replace(`${seed.currency} `, "")); }}
    onSave={() => { interact(); void editor.submit(); }} onDismiss={onClose} />;
  return <BudgetEditorSheet title="Add Budget"
    monthLabel={monthLabel(seed.month)} currency={seed.currency} categories={categories}
    categoryFixed={false}
    policyCopy="Repeats each month. Changes apply to this month and future months. Past months keep their limits. Unspent money does not roll over."
    {...editor}
    onCategory={(id) => { interact(); editor.onCategory(id); }}
    onSearch={(value) => { interact(); editor.onSearch(value); }}
    onAmount={(value) => { interact(); editor.onAmount(value); }}
    onSave={() => { interact(); void editor.submit(); }} onDismiss={onClose} />;
}
