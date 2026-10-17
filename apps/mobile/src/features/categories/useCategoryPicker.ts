import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useAction, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../api";
import { defaultCategoryStyle, selectionKey } from "./model";
import type {
  CategoryEditor,
  CategoryOption,
  CategoryPreset,
  CategorySelection,
  CategoryStyle,
  NatureAnswer,
} from "./model";

export type CategoryPickerMode =
  | {
      kind: "posting";
      workspaceId: string;
      value: string | null;
      onChange: (id: string | null) => void;
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
  const categories = useQuery(
    api.accounting.listUserCategories,
    mode.kind === "posting" ? { workspaceId: mode.workspaceId } : "skip",
  );
  const presets = useQuery(api.accounting.listCategoryPresets, {
    nature: "Expense",
  });
  const create = useAction(api.accounting.createUserCategory);
  const restyle = useAction(api.accounting.restyleUserCategory);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<CategoryEditor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const suggestion = useQuery(
    api.accounting.suggestCategoryNature,
    editor?.kind === "custom"
      ? {
          name: editor.name,
          ...(mode.kind === "posting" ? { direction: "out" as const } : {}),
        }
      : "skip",
  );
  const effectiveAnswer =
    editor?.kind === "custom"
      ? (editor.answer ?? suggestion?.suggested ?? null)
      : null;
  const options: CategoryOption[] | undefined =
    mode.kind === "posting"
      ? categories
          ?.filter((c) => c.nature === "Expense")
          .map((c) => ({
            key: c.id,
            name: c.name,
            style: c.style,
            selected: c.id === mode.value,
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
    }
  }
  function select(key: string) {
    if (saving.current) return;
    recordInteraction();
    if (mode.kind === "posting") {
      mode.onChange(key);
      onClose();
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
  }
  async function confirm() {
    if (!editor || saving.current) return;
    if (
      editor.kind === "custom" &&
      (!editor.name.trim() ||
        !effectiveAnswer ||
        effectiveAnswer === "stillMine" ||
        effectiveAnswer === "payDebt")
    )
      return;
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
        if (!effectiveAnswer) return;
        selection = {
          kind: "custom",
          name: editor.name.trim(),
          answer: effectiveAnswer,
          style: editor.style,
        };
      }
      if (mode.kind === "posting") {
        const result = await create({
          workspaceId: mode.workspaceId,
          selection,
        });
        if (result.kind === "category") {
          mode.onChange(result.category.id);
          setEditor(null);
          onClose();
        }
      } else {
        const key = selectionKey(selection);
        mode.onChange([
          ...mode.selections.filter((s) => selectionKey(s) !== key),
          selection,
        ]);
        setEditor(null);
      }
    } catch {
      setError(
        "Could not save this category. Your answers are still here. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function name(name: string) {
    recordInteraction();
    setEditor((current) =>
      current?.kind === "custom" ? { ...current, name, answer: null } : current,
    );
  }
  function answer(answer: NatureAnswer) {
    recordInteraction();
    setEditor((current) =>
      current?.kind === "custom" ? { ...current, answer } : current,
    );
  }
  function style(style: CategoryStyle) {
    recordInteraction();
    setEditor((current) => (current ? { ...current, style } : current));
  }
  const includes = (name: string) =>
    searchable(name).includes(searchable(search));
  const allowedAnswers: NatureAnswer[] =
    suggestion?.allowed ??
    (mode.kind === "setup"
      ? ["spend", "receive", "stillMine", "payDebt"]
      : ["spend", "stillMine", "payDebt"]);
  return {
    categories,
    allPresets: presets,
    options,
    sheet: {
      search,
      editor,
      busy,
      error,
      effectiveAnswer,
      allowedAnswers,
      options: options?.filter((o) => includes(o.name)),
      presets: presets?.filter((p) => includes(p.name)),
      canConfirm:
        !!editor &&
        (editor.kind !== "custom" ||
          (!!editor.name.trim() &&
            !!effectiveAnswer &&
            effectiveAnswer !== "stillMine" &&
            effectiveAnswer !== "payDebt")),
      onSearch: (value: string) => {
        recordInteraction();
        setSearch(value);
      },
      onSelect: select,
      onRestyle: editStyle,
      onPreset: preset,
      onCreate: () => {
        recordInteraction();
        setEditor({
          kind: "custom",
          name: search,
          answer: null,
          style: defaultCategoryStyle,
        });
        setError("");
      },
      onName: name,
      onAnswer: answer,
      onStyle: style,
      onConfirm: () => void confirm(),
      onBack: back,
      onNone:
        mode.kind === "posting"
          ? () => {
              mode.onChange(null);
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
