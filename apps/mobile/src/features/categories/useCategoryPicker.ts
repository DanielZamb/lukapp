import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, withFields, type ReadAtPress } from "../amount/useAmountState";
import { suggestedCategoryName } from "./suggestedNames";
import { useT } from "../../i18n";
import { api } from "../api";
import { useNatureSuggestion } from "./useNatureSuggestion";
import { defaultCategoryStyle, natureAnswer, natureAnswers, selectionKey } from "./model";
import { needsPrimary, toggleCategory, type TransactionCategories } from "./transactionSelection";
import type {
  AccountSetupRequest,
  Category,
  CategoryNature,
  NatureAnswer,
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
      onAccountSetup?: (request: AccountSetupRequest) => boolean;
      value: TransactionCategories;
      onChange: (value: TransactionCategories, nature: CategoryNature | null) => void;
    }
  | {
      kind: "setup";
      selections: CategorySelection[];
      onChange: (selections: CategorySelection[]) => void;
    };

function searchable(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}
/** What the sheet has open and typed; Save acts on one read of it at the press. */
type PickerForm = {
  search: string;
  editor: CategoryEditor | null;
  replaceSelection: boolean;
  /** The nature suggested for the name in `key`, as the sheet shows it. */
  suggestion: { key: string; suggested: NatureAnswer | null };
};

export function useCategoryPicker(
  mode: CategoryPickerMode,
  onClose: () => void,
) {
  const translator = useT();
  const { t } = translator;
  const recordInteraction = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const categories = useQuery(
    api.accounting.listUserCategories,
    mode.kind === "posting" ? { workspaceId: mode.workspaceId } : "skip",
  );
  const serverPresets = useQuery(api.accounting.listCategoryPresets, mode.kind === "setup" ? { nature: "Expense" } : {});
  const presets = useMemo(
    () => serverPresets?.map((preset) => ({ ...preset, name: suggestedCategoryName(translator, preset.id, preset.name) })),
    [serverPresets, translator],
  );
  const create = useAction(api.accounting.createUserCategory);
  const restyle = useAction(api.accounting.restyleUserCategory);
  const [form, setForm, readForm] = useFormState<PickerForm>({
    search: "", editor: null, replaceSelection: false, suggestion: { key: "", suggested: null },
  });
  const change = (patch: Partial<PickerForm>) => setForm((now) => withFields(now, patch));
  const setEditor = (next: CategoryEditor | null | ((current: CategoryEditor | null) => CategoryEditor | null)) =>
    setForm((now) => ({ ...now, editor: typeof next === "function" ? next(now.editor) : next }));
  const { search, editor, replaceSelection } = form;
  const nature = useNatureSuggestion(editor?.kind === "custom" ? editor.name : "");
  useEffect(() => { change({ suggestion: { key: nature.key ?? "", suggested: nature.suggested } }); }, [nature.key, nature.suggested]);
  const answerOf = (now: PickerForm | ReadAtPress<PickerForm>) => now.editor?.kind === "custom" ? natureAnswer(now.editor, now.suggestion) : null;
  const answer = answerOf(form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const saving = useRef(false);
  const knownOptions: CategoryOption[] | undefined =
    mode.kind === "posting"
      ? categories
          ?.filter((c) => c.nature === "Income" || c.nature === "Expense")
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
              ? (s.name ?? presets?.find((p) => p.id === s.presetId)?.name ?? t("categories.pickerTitle"))
              : s.name,
          style: s.style,
          selected: true,
        }));
  const options = mode.kind === "posting" && knownOptions && categories
    ? [...knownOptions, ...mode.value.ids.filter((id) => !categories.some((category) => category.id === id))
      .map((id) => ({ key: id, name: t("categories.unavailableCategory"), style: defaultCategoryStyle, selected: true }))]
    : knownOptions;
  function back() {
    if (!saving.current) {
      change({ editor: null, replaceSelection: false });
      setError("");
    }
  }
  function togglePostingCategory(value: TransactionCategories, category: Pick<Category, "id" | "nature">) {
    const switchingNature = !value.ids.includes(category.id) && categories?.some(
      (selected) => value.ids.includes(selected.id) && selected.nature !== category.nature,
    );
    return toggleCategory(switchingNature ? { ids: [], primaryId: null } : value, category.id);
  }
  function select(key: string) {
    if (saving.current) return;
    recordInteraction();
    if (mode.kind === "posting") {
      const category = categories?.find((category) => category.id === key);
      const next = category ? togglePostingCategory(mode.value, category) : toggleCategory(mode.value, key);
      if (!next) { setLimitReached(true); return; }
      mode.onChange({ ...next, primaryId: needsPrimary(next.ids, categories ?? []) ? next.primaryId : null },
        categories?.find((category) => next.ids.includes(category.id))?.nature ?? null);
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
    change({ editor: { kind: "preset", preset, style: defaultCategoryStyle }, replaceSelection: false });
    setError("");
  }
  const existingNames = mode.kind === "posting"
    ? categories?.map((category) => category.name)
    : options?.map((option) => option.name);
  /** Whether the open editor may be saved; rendering asks with the form, a press with what it reads. */
  const confirmable = (now: PickerForm | ReadAtPress<PickerForm>) => {
    const shown = now.editor;
    const answered = answerOf(now);
    return !!shown && (shown.kind === "restyle" || (
      existingNames !== undefined &&
      (shown.kind === "preset" || (
        !!shown.name.trim() && answered !== null && natureAnswers.includes(answered) && !existingNames.some((name) =>
          searchable(name.trim().replace(/\s+/g, " ")) === searchable(shown.name.trim().replace(/\s+/g, " ")),
        )
      ))
    ));
  };
  const canConfirm = confirmable(form);
  async function confirm() {
    const now = readForm();
    const editor = now.editor;
    const answer = answerOf(now);
    if (!editor || saving.current || !confirmable(now)) return;
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
          ...(translator.language !== "en" && suggestedCategoryName(translator, editor.preset.id, "") === editor.preset.name
            ? { name: editor.preset.name } : {}),
        };
      else {
        if (!answer) return;
        if (answer === "stillMine" || answer === "payDebt") {
          if (mode.kind !== "posting" || !mode.onAccountSetup?.({ name: editor.name.trim(), answer, style: editor.style })) {
            setError(t("categories.errorAccountSetupUnavailable"));
            return;
          }
          setEditor(null);
          onClose();
          return;
        }
        selection = {
          kind: "custom",
          name: editor.name.trim(),
          answer,
          style: editor.style,
        };
      }
      if (mode.kind === "posting") {
        const result = await create({
          workspaceId: mode.workspaceId,
          selection,
        });
        if (result.kind === "category") {
          const next = now.replaceSelection
            ? { ids: [result.category.id], primaryId: null }
            : mode.value.ids.includes(result.category.id)
              ? mode.value
              : togglePostingCategory(mode.value, result.category);
          if (next) {
            mode.onChange(next, result.category.nature ?? null);
            setLimitReached(false);
          } else setLimitReached(true);
          change({ editor: null, replaceSelection: false });
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
      setError(t("categories.errorSaveCategory"));
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
  function style(style: CategoryStyle) {
    recordInteraction();
    setEditor((current) => (current ? { ...current, style } : current));
  }
  const needle = searchable(search.trim());
  return {
    categories,
    allPresets: presets,
    options,
    sheet: {
      search,
      editor,
      busy,
      error,
      options: options?.filter((o) => searchable(o.name).includes(needle)),
      presets: presets?.filter((p) => searchable(p.name).includes(needle)),
      canConfirm,
      answer,
      suggested: nature.suggested,
      allowed: nature.allowed,
      onAnswer: (value: NatureAnswer) => {
        if (saving.current || !natureAnswers.includes(value)) return;
        recordInteraction();
        setEditor((current) => current?.kind === "custom" ? { ...current, answer: value } : current);
      },
      onSearch: (value: string) => {
        recordInteraction();
        change({ search: value });
      },
      onSelect: select,
      onRestyle: editStyle,
      onPreset: preset,
      onCreate: () => {
        recordInteraction();
        const now = readForm();
        change({
          replaceSelection: mode.kind === "posting" && mode.value.ids.length >= 3,
          editor: { kind: "custom", name: now.search, answer: null, style: defaultCategoryStyle },
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
        change({ replaceSelection: true, editor: { kind: "custom", name: readForm().search, answer: null, style: defaultCategoryStyle } });
        setError("");
      },
      primaryOptions: mode.kind === "posting" && categories && needsPrimary(mode.value.ids, categories)
        ? options?.filter((option) => option.selected)
        : undefined,
      primaryId: mode.kind === "posting" ? mode.value.primaryId : null,
      onPrimary: (id: string) => {
        recordInteraction();
        if (mode.kind === "posting" && mode.value.ids.includes(id))
          mode.onChange({ ...mode.value, primaryId: id }, categories?.find((category) => category.id === id)?.nature ?? null);
      },
      onDone: mode.kind === "posting" ? onClose : undefined,
      onNone:
        mode.kind === "posting"
          ? () => {
              mode.onChange({ ids: [], primaryId: null }, null);
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
