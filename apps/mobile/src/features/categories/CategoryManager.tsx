import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useFormState, withFields, type AtPress } from "../amount/useAmountState";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Field, Header, ListGroup, ListRow, PrimaryButton, Screen, useUi } from "../../ui/core";
import { useT } from "../../i18n";
import { api } from "../api";
import { DeferredAccountSetup } from "../setup/DeferredAccountSetup";
import { CategorySheet } from "./CategorySheet";
import { categoryFailureMessage, categoryNameKey, defaultCategoryStyle, natureAnswer, natureLabel, type AccountSetupRequest, type Category, type EditableCategory, type NatureAnswer } from "./model";
import { useNatureSuggestion } from "./useNatureSuggestion";

/** What the person has open and answered; Save and Delete act on one read of it at the press. */
type ManagerForm = {
  search: string;
  editor: EditableCategory | null;
  confirmingDelete: boolean;
  accountRequest: AccountSetupRequest | null;
  /** The nature suggested for the name in `key`, as the screen shows it. */
  suggestion: { key: string; suggested: NatureAnswer | null };
};

export function CategoryManager({ workspaceId, subject, profileId, currency, timeZone, initialCategoryId, onBack }: {
  workspaceId: string; subject: string; profileId: string; currency: string; timeZone: string;
  initialCategoryId?: string; onBack: () => void;
}) {
  const ui = useUi();
  const translator = useT();
  const { t } = translator;
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const create = useAction(api.accounting.createUserCategory);
  const update = useAction(api.accounting.updateUserCategory);
  const remove = useAction(api.accounting.deleteUserCategory);
  const interact = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const [form, setForm, readForm] = useFormState<ManagerForm>({
    search: "", editor: null, confirmingDelete: false, accountRequest: null, suggestion: { key: "", suggested: null },
  });
  const change = (patch: Partial<ManagerForm>) => setForm((now) => withFields(now, patch));
  const { search, editor, confirmingDelete, accountRequest } = form;
  const setEditor = (next: (current: EditableCategory | null) => EditableCategory | null) => setForm((now) => ({ ...now, editor: next(now.editor) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const queuedAccount = useRef<AccountSetupRequest | null>(null);
  const saving = useRef(false);
  const sheet = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const openedInitial = useRef(false);
  const nature = useNatureSuggestion(editor?.kind === "custom" ? editor.name : "");
  useEffect(() => { change({ suggestion: { key: nature.key ?? "", suggested: nature.suggested } }); }, [nature.key, nature.suggested]);
  const answerOf = (shown: EditableCategory | AtPress<EditableCategory> | null, suggestion: ManagerForm["suggestion"]) =>
    shown?.kind === "custom" ? natureAnswer(shown, suggestion) : null;
  const answer = answerOf(editor, form.suggestion);
  const open = editor !== null;
  function edit(category: Category) {
    if (saving.current || readForm().accountRequest) return;
    interact(); setError("");
    change({ confirmingDelete: false, editor: { kind: "edit", category, name: category.name, style: category.style } });
  }
  useEffect(() => {
    if (!openedInitial.current && initialCategoryId && categories) {
      openedInitial.current = true;
      const category = categories.find((item) => item.id === initialCategoryId);
      if (category) edit(category);
    }
  }, [initialCategoryId, categories]);
  useEffect(() => {
    if (open) sheet.current?.present();
    else if (presented.current) sheet.current?.dismiss();
    presented.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!saving.current) sheet.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [open]);
  const duplicateOf = (shown: EditableCategory | AtPress<EditableCategory>) => !!categories?.some((category) =>
    (shown.kind !== "edit" || category.id !== shown.category.id) &&
    category.normalizedName === categoryNameKey(shown.name),
  );
  /** Whether a save may be sent; rendering asks with the form, a press with what it reads. */
  const confirmable = (now: ManagerForm | AtPress<ManagerForm>) => {
    const shown = now.editor;
    return !!shown && categories !== undefined && !!shown.name.trim()
      && shown.name.trim().length <= 80 && !duplicateOf(shown) && (shown.kind === "edit" || answerOf(shown, now.suggestion) !== null);
  };
  const duplicate = !!editor && duplicateOf(editor);
  const canConfirm = confirmable(form);
  const filtered = categories?.filter((category) => categoryNameKey(category.name).includes(categoryNameKey(search)));
  async function save(deleting = false) {
    const now = readForm();
    const shown = now.editor;
    if (!shown || saving.current || (!deleting && !confirmable(now))) return;
    if (deleting && (shown.kind !== "edit" || !now.confirmingDelete)) return;
    const answered = answerOf(shown, now.suggestion);
    interact(); saving.current = true; setBusy(true); setError("");
    try {
      if (deleting && shown.kind === "edit") {
        await remove({ workspaceId, categoryId: shown.category.id });
      } else if (shown.kind === "edit") {
        await update({ workspaceId, categoryId: shown.category.id, name: shown.name.trim(), style: shown.style });
      } else if (answered === "stillMine" || answered === "payDebt") {
        queuedAccount.current = { name: shown.name.trim(), style: shown.style, answer: answered };
      } else if (answered === "spend" || answered === "receive") {
        const result = await create({ workspaceId, selection: { kind: "custom", name: shown.name.trim(), answer: answered, style: shown.style } });
        if (result.kind === "accountSetupRequired") queuedAccount.current = {
          name: result.name, answer: result.answer, style: shown.style,
        };
      }
      change({ editor: null, confirmingDelete: false });
    } catch (failure) {
      if (!reportFailure(failure)) setError(categoryFailureMessage(failure, translator));
    } finally {
      saving.current = false; setBusy(false);
    }
  }
  return <Screen>
    <Header title={t("categories.managerTitle")} eyebrow={t("categories.managerEyebrow")} onBack={onBack} />
    <Text style={ui.muted}>{t("categories.managerIntro")}</Text>
    <Field label={t("categories.searchLabel")} accessibilityLabel={t("categories.searchLabel")} value={search}
      onChangeText={(value) => { interact(); change({ search: value }); }} placeholder={t("categories.searchPlaceholder")} />
    {filtered === undefined ? <ActivityIndicator accessibilityLabel={t("categories.loading")} /> : filtered.length > 0 ? <ListGroup>
      {filtered.map((category) =>
        <ListRow key={category.id} title={category.name} value={category.style.emoji}
          detail={t(natureLabel(category.nature))} onPress={() => edit(category)} />)}
    </ListGroup> : <Text style={ui.muted}>{categories?.length === 0
      ? t("categories.managerEmpty") : t("categories.managerNoMatch")}</Text>}
    <PrimaryButton label={t("categories.addCategory")} trailingIcon="add" disabled={categories === undefined || !!accountRequest} onPress={() => {
      interact(); setError("");
      change({ confirmingDelete: false, editor: { kind: "custom", name: "", answer: null, style: defaultCategoryStyle } });
    }} />
    {!editor && !!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {accountRequest && <View style={ui.section}><DeferredAccountSetup request={accountRequest} subject={subject}
      workspaceId={workspaceId} profileId={profileId} currency={currency} timeZone={timeZone}
      onDone={() => change({ accountRequest: null })} /></View>}
    <CategorySheet sheetRef={sheet} search="" options={[]} editor={editor} busy={busy}
      error={duplicate ? t("categories.errorNameConflict") : error} canConfirm={canConfirm}
      answer={answer} suggested={nature.suggested} allowed={nature.allowed}
      onAnswer={(value) => { if (!saving.current) { interact(); setEditor((current) => current?.kind === "custom" ? { ...current, answer: value } : current); } }}
      onSearch={() => {}} onSelect={() => {}} onCreate={() => {}}
      onName={(name) => { if (!saving.current) { interact(); setEditor((current) => current ? { ...current, name, ...(current.kind === "custom" ? { answer: null } : {}) } : current); } }}
      onStyle={(style) => { if (!saving.current) { interact(); setEditor((current) => current ? { ...current, style } : current); } }}
      onConfirm={() => void save()} confirmingDelete={confirmingDelete}
      onDelete={() => { if (saving.current) return; interact(); if (readForm().confirmingDelete) void save(true); else change({ confirmingDelete: true }); }}
      onCancelDelete={() => { interact(); change({ confirmingDelete: false }); }}
      onDismiss={() => {
        if (saving.current) return;
        presented.current = false; change({ editor: null, confirmingDelete: false }); setError("");
        if (queuedAccount.current) { change({ accountRequest: queuedAccount.current }); queuedAccount.current = null; }
      }} />
  </Screen>;
}
