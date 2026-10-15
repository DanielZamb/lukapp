import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useAccess } from "../access/RuntimeProvider";
import { custody } from "../access/native";
import { draftStore, accountSetupStore } from "../modules/local-entry-drafts/store";
import type { ExpenseDraft } from "../modules/local-entry-drafts/store";
import type { AccountSetupDraft } from "../modules/local-entry-drafts/account-setup";
import { Header, Copy, ListGroup, ListRow, PrimaryButton, Screen } from "../ui";

export default function Drafts() {
  const access = useAccess();
  const [drafts, setDrafts] = useState<ExpenseDraft[] | null>(null);
  const [setups, setSetups] = useState<AccountSetupDraft[]>([]);
  useEffect(() => {
    if (access.kind !== "ready") return;
    let stopped = false;
    void Promise.all([draftStore(custody, access.contact.generation, access.workspaceId).list(),
      accountSetupStore(custody, access.contact.generation, access.workspaceId).list()])
      .then(([items, saved]) => { if (!stopped) { setDrafts(items); setSetups(saved); } })
      .catch(() => custody.lock());
    return () => { stopped = true; };
  }, [access]);
  return <Screen><Header title="Drafts" back={{ label: "Back home", onPress: () => router.dismissTo("/") }} />
    <Copy title={drafts?.length || setups.length ? "Saved on this device" : drafts ? "No Drafts waiting" : "Loading Drafts"}
      detail="Drafts expire within 15 days. They post only when you choose Post online." />
    <ListGroup title="Manual Expenses">{drafts?.map(draft => <ListRow key={draft.id}
      title={draft.stage === "editing" ? draft.description || "Unfinished Expense" : draft.request.description}
      supporting={draft.stage === "editing" ? draft.date : draft.request.accountingDate} value={draft.stage === "editing" ? draft.amount : "Ready to retry"}
      onPress={() => router.push({ pathname: "/expense", params: { id: draft.id } })} />)}</ListGroup>
    {setups.length > 0 && <ListGroup title="Saved account setups">{setups.map(setup => <ListRow key={setup.id}
      title={setup.request.name} supporting={setup.request.accountingDate} value="Ready to retry"
      onPress={() => router.push({ pathname: "/account-setup", params: { id: setup.id, household: setup.target.kind === "household" ? "1" : "0" } })} />)}</ListGroup>}
    <PrimaryButton label="Record an Expense" onPress={() => router.push("/expense")} />
  </Screen>;
}
