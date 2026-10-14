import { useState } from "react";
import { router } from "expo-router";
import { useAccess, useRuntime } from "../access/RuntimeProvider";
import { custody } from "../access/native";
import { draftStore } from "../modules/local-entry-drafts/store";
import { candidateStore } from "../modules/notification-intake/store";
import { today } from "../modules/local-entry-drafts/money";
import { LiveVerification } from "../dev/LiveVerification";
import { Copy, Header, Screen, SecondaryButton } from "../ui";

export default function NativeProof() {
  const { fixture } = useRuntime();
  const access = useAccess();
  const [result, setResult] = useState("");
  if (!__DEV__ || access.kind !== "ready") return null;
  if (!fixture) return <Screen><Header title="Development public verification" back={{ label: "Back", onPress: () => router.back() }} /><LiveVerification /></Screen>;
  const generation = access.contact.generation;
  const workspaceId = access.workspaceId;
  const drafts = draftStore(custody, generation, workspaceId);
  const candidates = candidateStore(custody, generation, workspaceId);
  const probe = (work: () => Promise<string>) => { void work().then(setResult).catch(() => setResult("Native boundary refused the operation")); };
  return <Screen><Header title="Controlled native verification" back={{ label: "Back", onPress: () => router.back() }} />
    <Copy title="Synthetic device-only input" detail="Development fixture only. These records never post or upload and exercise the real encrypted native store." />
    <SecondaryButton label="Seed separate native input owners" onPress={() => probe(async () => {
      await drafts.put({ kind: "expense", id: "f03-retention-draft", workspaceId, stage: "editing", amount: "1", date: today(), profileId: "", description: "F03 native retention probe" });
      await custody.inputPut("candidate", "f03-retention-candidate", JSON.stringify({ kind: "candidate", id: "f03-retention-candidate", workspaceId, stage: "review", description: "Synthetic Candidate foundation probe" }), generation);
      return "Seeded one Draft and one distinct Candidate in native encryption";
    })} />
    <SecondaryButton label="Read native input owner counts" onPress={() => probe(async () => {
      const [draftRows, candidateRows] = await Promise.all([drafts.list(), candidates.list()]);
      return "Native Drafts: " + draftRows.length + " · Native Candidates: " + candidateRows.length;
    })} />
    <SecondaryButton label="Attempt expired ID renewal" onPress={() => probe(async () => {
      await drafts.put({ kind: "expense", id: "f03-retention-draft", workspaceId, stage: "editing", amount: "1", date: today(), profileId: "", description: "F03 native retention probe" });
      return "ID remains within its original native expiry";
    })} />
    <SecondaryButton label="Reject stale mode initialization" onPress={() => probe(async () => {
      try { await custody.initialize("live", generation - 1); return "FAIL: stale mode initialization succeeded"; }
      catch { return "Native mode stayed isolated after stale initialization"; }
    })} />
    <SecondaryButton label="Interrupt wipe after durable marker" onPress={() => { void custody.beginWipe("fixture"); }} />
    <SecondaryButton label="Remove installation key to test loss" onPress={() => { void custody.deleteKey(); }} />
    <Copy title="Native result" detail={result || "Choose an explicit probe."} />
  </Screen>;
}
