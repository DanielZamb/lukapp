import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Field, Header, ListGroup, ListRow, PrimaryButton, Screen, useUi } from "../../ui/core";
import { api } from "../api";
import { DeferredAccountSetup } from "../setup/DeferredAccountSetup";
import { CategorySheet } from "./CategorySheet";
import { categoryNameKey, defaultCategoryStyle, type AccountSetupRequest, type Category, type EditableCategory } from "./model";
import { useNatureSuggestion } from "./useNatureSuggestion";

function failureMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data && "code" in error.data) {
    switch (error.data.code) {
      case "name_required": return "Enter a category name.";
      case "category_name_too_long": return "Use 80 characters or fewer.";
      case "category_name_conflict": return "You already have a category with that name.";
      case "category_not_found": return "This category is no longer available. Close the editor and choose another.";
    }
  }
  return "Could not save this change. Try again.";
}

export function CategoryManager({ workspaceId, subject, profileId, currency, timeZone, initialCategoryId, onBack }: {
  workspaceId: string; subject: string; profileId: string; currency: string; timeZone: string;
  initialCategoryId?: string; onBack: () => void;
}) {
  const ui = useUi();
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const create = useAction(api.accounting.createUserCategory);
  const update = useAction(api.accounting.updateUserCategory);
  const remove = useAction(api.accounting.deleteUserCategory);
  const interact = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditableCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [accountRequest, setAccountRequest] = useState<AccountSetupRequest | null>(null);
  const queuedAccount = useRef<AccountSetupRequest | null>(null);
  const saving = useRef(false);
  const sheet = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const openedInitial = useRef(false);
  const nature = useNatureSuggestion(editor?.kind === "custom" ? editor.name : "");
  const answer = editor?.kind === "custom" ? editor.answer ?? nature.suggested : null;
  const open = editor !== null;
  function edit(category: Category) {
    if (saving.current || accountRequest) return;
    interact(); setError(""); setConfirmingDelete(false);
    setEditor({ kind: "edit", category, name: category.name, style: category.style });
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
  const duplicate = !!editor && categories?.some((category) =>
    (editor.kind !== "edit" || category.id !== editor.category.id) &&
    category.normalizedName === categoryNameKey(editor.name),
  );
  const canConfirm = !!editor && categories !== undefined && !!editor.name.trim() && editor.name.trim().length <= 80 &&
    !duplicate && (editor.kind === "edit" || answer !== null);
  const filtered = categories?.filter((category) => categoryNameKey(category.name).includes(categoryNameKey(search)));
  async function save(deleting = false) {
    if (!editor || saving.current || (!deleting && !canConfirm)) return;
    if (deleting && editor.kind !== "edit") return;
    interact(); saving.current = true; setBusy(true); setError("");
    try {
      if (deleting && editor.kind === "edit") {
        await remove({ workspaceId, categoryId: editor.category.id });
      } else if (editor.kind === "edit") {
        await update({ workspaceId, categoryId: editor.category.id, name: editor.name.trim(), style: editor.style });
      } else if (answer === "stillMine" || answer === "payDebt") {
        queuedAccount.current = { name: editor.name.trim(), style: editor.style, answer };
      } else if (answer === "spend" || answer === "receive") {
        const result = await create({ workspaceId, selection: { kind: "custom", name: editor.name.trim(), answer, style: editor.style } });
        if (result.kind === "accountSetupRequired") queuedAccount.current = {
          name: result.name, answer: result.answer, style: editor.style,
        };
      }
      setEditor(null); setConfirmingDelete(false);
    } catch (failure) {
      if (!reportFailure(failure)) setError(failureMessage(failure));
    } finally {
      saving.current = false; setBusy(false);
    }
  }
  return <Screen>
    <Header title="Categories" eyebrow="MAKE THEM YOURS" onBack={onBack} />
    <Text style={ui.muted}>Create categories for money in or out. Tap one to change its name and look.</Text>
    <Field label="Search categories" accessibilityLabel="Search categories" value={search}
      onChangeText={(value) => { interact(); setSearch(value); }} placeholder="Search" />
    {filtered === undefined ? <ActivityIndicator accessibilityLabel="Loading categories" /> : filtered.length > 0 ? <ListGroup>
      {filtered.map((category) =>
        <ListRow key={category.id} title={category.name} value={category.style.emoji}
          detail={category.nature === "Income" ? "Money in" : category.nature === "Expense" ? "Money out" : "Money direction not set"} onPress={() => edit(category)} />)}
    </ListGroup> : <Text style={ui.muted}>{categories?.length === 0
      ? "No categories yet. Add one to get started." : "No categories match your search."}</Text>}
    <PrimaryButton label="Add category" trailingIcon="add" disabled={categories === undefined || !!accountRequest} onPress={() => {
      interact(); setError(""); setConfirmingDelete(false);
      setEditor({ kind: "custom", name: "", answer: null, style: defaultCategoryStyle });
    }} />
    {!editor && !!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {accountRequest && <View style={ui.section}><DeferredAccountSetup request={accountRequest} subject={subject}
      workspaceId={workspaceId} profileId={profileId} currency={currency} timeZone={timeZone}
      onDone={() => setAccountRequest(null)} /></View>}
    <CategorySheet sheetRef={sheet} search="" options={[]} editor={editor} busy={busy}
      error={duplicate ? "You already have a category with that name." : error} canConfirm={canConfirm}
      answer={answer} suggested={nature.suggested} allowed={nature.allowed}
      onAnswer={(value) => { if (!saving.current) { interact(); setEditor((current) => current?.kind === "custom" ? { ...current, answer: value } : current); } }}
      onSearch={() => {}} onSelect={() => {}} onCreate={() => {}}
      onName={(name) => { if (!saving.current) { interact(); setEditor((current) => current ? { ...current, name, ...(current.kind === "custom" ? { answer: null } : {}) } : current); } }}
      onStyle={(style) => { if (!saving.current) { interact(); setEditor((current) => current ? { ...current, style } : current); } }}
      onConfirm={() => void save()} confirmingDelete={confirmingDelete}
      onDelete={() => { if (saving.current) return; interact(); if (confirmingDelete) void save(true); else setConfirmingDelete(true); }}
      onCancelDelete={() => { interact(); setConfirmingDelete(false); }}
      onDismiss={() => {
        if (saving.current) return;
        presented.current = false; setEditor(null); setConfirmingDelete(false); setError("");
        if (queuedAccount.current) { setAccountRequest(queuedAccount.current); queuedAccount.current = null; }
      }} />
  </Screen>;
}
