import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useAction, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../api";
import { defaultCategoryStyle, selectionKey } from "./model";
import { needsPrimary, toggleCategory, type TransactionCategories } from "./transactionSelection";
import type {
  CategoryEditor,
  CategoryOption,
  CategoryPreset,
  CategorySelection,
  CategoryStyle,
} from "./model";

export type CategoryPickerMode =
  | {
      kind: "posting";
      workspaceId: string;
      direction?: "in" | "out";
      value: TransactionCategories;
      onChange: (value: TransactionCategories) => void;
    }
  | {
      kind: "setup";
      selections: CategorySelection[];
      onChange: (selections: CategorySelection[]) => void;
    };

function searchable(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}
export function useCategoryPicker(
  mode: CategoryPickerMode,
  onClose: () => void,
) {
  const recordInteraction = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const categories = useQuery(
    api.accounting.listUserCategories,
    mode.kind === "posting" ? { workspaceId: mode.workspaceId } : "skip",
  );
  const presets = useQuery(api.accounting.listCategoryPresets, {
    nature: mode.kind === "posting" && mode.direction === "in" ? "Income" : "Expense",
  });
  const create = useAction(api.accounting.createUserCategory);
  const restyle = useAction(api.accounting.restyleUserCategory);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<CategoryEditor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [replaceSelection, setReplaceSelection] = useState(false);
  const saving = useRef(false);
  const options: CategoryOption[] | undefined =
    mode.kind === "posting"
      ? categories
          ?.filter((c) => c.nature === (mode.direction === "in" ? "Income" : "Expense"))
          .map((c) => ({
            key: c.id,
            name: c.name,
            style: c.style,
            selected: mode.value.ids.includes(c.id),
          }))
      : mode.selections.map((s) => ({
          key: selectionKey(s),
          name:
            s.kind === "preset"
              ? (presets?.find((p) => p.id === s.presetId)?.name ?? "Category")
              : s.name,
          style: s.style,
          selected: true,
        }));
  function back() {
    if (!saving.current) {
      setEditor(null);
      setError("");
      setReplaceSelection(false);
    }
  }
  function select(key: string) {
    if (saving.current) return;
    recordInteraction();
    if (mode.kind === "posting") {
      const next = toggleCategory(mode.value, key);
      if (!next) { setLimitReached(true); return; }
      mode.onChange({ ...next, primaryId: needsPrimary(next.ids, categories ?? []) ? next.primaryId : null });
      setLimitReached(false);
    } else
      mode.onChange(mode.selections.filter((s) => selectionKey(s) !== key));
  }
  function editStyle(key: string) {
    recordInteraction();
    const option = options?.find((o) => o.key === key);
    if (option) {
      setEditor({ kind: "restyle", option, style: option.style });
      setError("");
    }
  }
  function preset(preset: CategoryPreset) {
    recordInteraction();
    setEditor({ kind: "preset", preset, style: defaultCategoryStyle });
    setError("");
    setReplaceSelection(false);
  }
  const existingNames = mode.kind === "posting"
    ? categories?.map((category) => category.name)
    : options?.map((option) => option.name);
  const categoryCount = mode.kind === "posting" ? categories?.length : mode.selections.length;
  const canConfirm = !!editor && (editor.kind === "restyle" || (
    existingNames !== undefined && categoryCount !== undefined && categoryCount < 12 &&
    (editor.kind === "preset" || (
      !!editor.name.trim() && !existingNames.some((name) =>
        searchable(name.trim().replace(/\s+/g, " ")) === searchable(editor.name.trim().replace(/\s+/g, " ")),
      )
    ))
  ));
  async function confirm() {
    if (!editor || saving.current || !canConfirm) return;
    recordInteraction();
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (editor.kind === "restyle") {
        if (mode.kind === "posting")
          await restyle({
            workspaceId: mode.workspaceId,
            categoryId: editor.option.key,
            style: editor.style,
          });
        else
          mode.onChange(
            mode.selections.map((s) =>
              selectionKey(s) === editor.option.key
                ? { ...s, style: editor.style }
                : s,
            ),
          );
        setEditor(null);
        return;
      }
      let selection: CategorySelection;
      if (editor.kind === "preset")
        selection = {
          kind: "preset",
          presetId: editor.preset.id,
          style: editor.style,
        };
      else {
        selection = {
          kind: "custom",
          name: editor.name.trim(),
          answer: mode.kind === "posting" && mode.direction === "in" ? "receive" : "spend",
          style: editor.style,
        };
      }
      if (mode.kind === "posting") {
        const result = await create({
          workspaceId: mode.workspaceId,
          selection,
        });
        if (result.kind === "category") {
          const next = replaceSelection
            ? { ids: [result.category.id], primaryId: null }
            : mode.value.ids.includes(result.category.id)
              ? mode.value
              : toggleCategory(mode.value, result.category.id);
          if (next) {
            mode.onChange(next);
            setLimitReached(false);
          } else setLimitReached(true);
          setEditor(null);
          setReplaceSelection(false);
          onClose();
        }
      } else {
        const key = selectionKey(selection);
        mode.onChange([
          ...mode.selections.filter((s) => selectionKey(s) !== key),
          selection,
        ]);
        setEditor(null);
        onClose();
      }
    } catch (error) {
      if (reportFailure(error)) return;
      setError(
        "Could not save this category. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function name(name: string) {
    recordInteraction();
    setEditor((current) =>
      current?.kind === "custom" ? { ...current, name } : current,
    );
  }
  function style(style: CategoryStyle) {
    recordInteraction();
    setEditor((current) => (current ? { ...current, style } : current));
  }
  const includes = (name: string) =>
    searchable(name).includes(searchable(search.trim()));
  return {
    categories,
    allPresets: presets,
    options,
    sheet: {
      search,
      editor,
      busy,
      error,
      options: options?.filter((o) => includes(o.name)),
      presets: presets?.filter((p) => includes(p.name)),
      canConfirm,
      onSearch: (value: string) => {
        recordInteraction();
        setSearch(value);
      },
      onSelect: select,
      onRestyle: editStyle,
      onPreset: preset,
      onCreate: () => {
        recordInteraction();
        setReplaceSelection(mode.kind === "posting" && mode.value.ids.length >= 3);
        setEditor({
          kind: "custom",
          name: search,
          style: defaultCategoryStyle,
        });
        setError("");
      },
      onName: name,
      onStyle: style,
      onConfirm: () => void confirm(),
      onBack: back,
      selectionCount: mode.kind === "posting" ? mode.value.ids.length : undefined,
      limitReached,
      replacingSelection: replaceSelection,
      onCreateEncompassing: () => {
        recordInteraction();
        setReplaceSelection(true);
        setEditor({ kind: "custom", name: search, style: defaultCategoryStyle });
        setError("");
      },
      primaryOptions: mode.kind === "posting" && categories && needsPrimary(mode.value.ids, categories)
        ? options?.filter((option) => option.selected)
        : undefined,
      primaryId: mode.kind === "posting" ? mode.value.primaryId : null,
      onPrimary: (id: string) => {
        recordInteraction();
        if (mode.kind === "posting" && mode.value.ids.includes(id))
          mode.onChange({ ...mode.value, primaryId: id });
      },
      onDone: mode.kind === "posting" ? onClose : undefined,
      onNone:
        mode.kind === "posting"
          ? () => {
              mode.onChange({ ids: [], primaryId: null });
              setLimitReached(false);
              onClose();
            }
          : undefined,
      onDismiss: () => {
        back();
        onClose();
      },
    },
  };
}
