import * as Crypto from "expo-crypto";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { ActivityIndicator } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Screen, useTheme, useThemeMode } from "../../ui/core";
import { categoryColor } from "../categories/appearance";
import { api } from "../api";
import { usePostedActivity } from "../activity";
import { experienceLevel } from "../levelDoor/model";
import { useT } from "../../i18n";
import { amountOfMinorUnits } from "../amount/session";
import { BudgetBoard, type BoardNotice } from "./BudgetBoard";
import { BudgetCreation } from "./BudgetCreation";
import { BudgetEditorSheet } from "./BudgetEditorSheet";
import { BudgetLimitSheet } from "./BudgetLimitSheet";
import { monthLabel, type BudgetCategory } from "./model";
import { useBudgetEditor, useSendLimitCommand, type BudgetEditorSeed } from "./useBudgetEditor";

type Receipt = FunctionReturnType<typeof api.budget.setCategoryLimit>;
type Outcome = { kind: "saved" } | { kind: "removed"; revisionId: string } | null;

function outcomeOf({ revision }: Receipt): Outcome {
  return revision.kind === "remove" ? { kind: "removed", revisionId: revision.id } : { kind: "saved" };
}

export function Budget({ workspaceId, timeZone, onBack, initialCategoryId }: { workspaceId: string; timeZone: string; initialCategoryId?: string; onBack: () => void }) {
  const theme = useTheme();
  const mode = useThemeMode();
  const { t } = useT();
  const calendar = useWorkspaceCalendar(timeZone);
  const [editor, setEditor] = useState<{ key: string; seed: BudgetEditorSeed; categories: BudgetCategory[] } | null>(null);
  const [creation, setCreation] = useState<{ key: string; seed: BudgetEditorSeed; categories: BudgetCategory[] } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [refreshKey, refresh] = useState(Crypto.randomUUID);
  useEffect(() => { refresh(Crypto.randomUUID()); }, [calendar.month]);
  const board = useQuery(api.budget.evaluate, { workspaceId, refreshKey, month: calendar.month });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const shortcutOpened = useRef(false);
  useEffect(() => {
    if (!board || !initialCategoryId || shortcutOpened.current) return;
    shortcutOpened.current = true;
    const category = board.availableCategories.find(
      (item) => item.id === initialCategoryId,
    );
    if (category)
      setEditor({
        key: Crypto.randomUUID(),
        seed: {
          workspaceId,
          currency: board.currency,
          month: board.currentMonth,
          jar: null,
          initialCategoryId,
          removedLimits: board.removedLimits,
        },
        categories: board.availableCategories,
      });
  }, [board, initialCategoryId, workspaceId]);
  const activity = usePostedActivity(workspaceId, timeZone);
  const interact = useLocalEntryInteraction();
  if (!board || !categories || !activity) return <Screen><ActivityIndicator accessibilityLabel={t("budget.loading")} /></Screen>;
  const categoryColors = new Map(categories.map((category) => [category.id, categoryColor(category.style, mode)]));
  if (creation) return <BudgetCreation key={creation.key} seed={creation.seed} categories={creation.categories}
    unlocking={activity.accounts.length === 1 && experienceLevel(activity.accounts.length, board.jars.length) === 0}
    categoryColors={categoryColors}
    onClose={() => { setCreation(null); refresh(Crypto.randomUUID()); }}
    onSaved={() => { setCreation(null); refresh(Crypto.randomUUID()); setOutcome({ kind: "saved" }); }} />;
  const removal = outcome?.kind === "removed"
    ? board.removedLimits.find((removed) => removed.revisionId === outcome.revisionId && removed.effectiveMonth === board.month)
    : undefined;
  const removedName = removal && board.availableCategories.find((category) => category.id === removal.categoryId)?.name;
  const notice: BoardNotice = outcome?.kind === "saved" ? outcome : removedName ? { kind: "removed", name: removedName } : null;
  return (
    <>
      <BudgetBoard month={board.month} currency={board.currency} jars={board.jars} notice={notice}
        categoryColors={categoryColors}
        canAdd={board.availableCategories.length > 0} onBack={onBack}
        onAdd={() => {
          if (board.month !== board.currentMonth) return;
          interact(); setOutcome(null);
          setCreation({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: null, removedLimits: board.removedLimits },
            categories: board.availableCategories });
        }}
        onEdit={(jar) => {
          if (board.month !== board.currentMonth) return;
          const current = board.jars.find((item) => item.category.id === jar.category.id);
          if (!current) return;
          interact(); setOutcome(null);
          setEditor({ key: Crypto.randomUUID(), seed: { workspaceId, currency: board.currency, month: board.currentMonth, jar: current, removedLimits: board.removedLimits },
            categories: [current.category] });
        }} />
      {editor && <Editor key={editor.key} seed={editor.seed} categories={editor.categories}
        color={categoryColors.get(editor.seed.jar?.category.id ?? "") ?? theme.primary}
        onClose={() => { setEditor(null); refresh(Crypto.randomUUID()); }}
        onSaved={(receipt) => { setEditor(null); refresh(Crypto.randomUUID()); setOutcome(outcomeOf(receipt)); }} />}
    </>
  );
}

function Editor({ seed, categories, color, onClose, onSaved }: {
  seed: BudgetEditorSeed; categories: BudgetCategory[]; color: string; onClose: () => void; onSaved: (receipt: Receipt) => void;
}) {
  const send = useSendLimitCommand();
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const { t, language } = useT();
  const editor = useBudgetEditor(seed, { send, reportFailure, newKey: Crypto.randomUUID, onSaved });
  const [year, month] = seed.month.split("-").map(Number);
  const previousMonth = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
  const previous = useQuery(api.accounting.categoryTotals, seed.jar ? { workspaceId: seed.workspaceId, month: previousMonth } : "skip");
  if (seed.jar) return <BudgetLimitSheet month={seed.month} currency={seed.currency} jar={seed.jar} color={color}
    previousMonth={previousMonth}
    previousSpendMinorUnits={previous ? previous.categories.find((category) => category.categoryId === editor.categoryId)?.minorUnits ?? 0 : undefined}
    {...editor}
    onLimit={(minorUnits) => { interact(); editor.onAmount(amountOfMinorUnits(seed.currency, minorUnits)); }}
    onAmount={(value) => { interact(); editor.onAmount(value); }}
    onResetAmount={() => { interact(); editor.onResetAmount(); }}
    onSave={() => { interact(); void editor.submit(); }}
    onSpendNothing={() => { interact(); void editor.spendNothing(); }}
    onRemove={() => { interact(); void editor.remove(); }} onDismiss={onClose} />;
  return <BudgetEditorSheet title={t("budget.addTitle")}
    monthLabel={monthLabel(seed.month, "monthYear", language)} currency={seed.currency} categories={categories}
    categoryFixed={false}
    policyCopy={t("budget.policy")}
    {...editor}
    onCategory={(id) => { interact(); editor.onCategory(id); }}
    onSearch={(value) => { interact(); editor.onSearch(value); }}
    onAmount={(value) => { interact(); editor.onAmount(value); }}
    onSave={() => { interact(); void editor.submit(); }} onDismiss={onClose} />;
}
