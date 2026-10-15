import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useRuntime } from "../access/RuntimeProvider";
import type { UserAction } from "../access/controller";
import { custody } from "../access/native";
import { parseManifest, runLiveScenario } from "./live-scenario";
import { Copy, SecondaryButton } from "../ui";

export function LiveVerification() {
  const { controller, fixture } = useRuntime();
  const [message, setMessage] = useState("Coordinator manifest required. Deployment assertions require independent receipts.");
  const [busy, setBusy] = useState(false);
  const running = useRef<UserAction | null>(null);
  useEffect(() => () => { running.current?.cancel(); running.current = null; }, [controller]);
  if (!__DEV__ || fixture) return null;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const run = async () => {
    if (running.current) return;
    let action: UserAction;
    try { action = controller.beginUserAction(); }
    catch { setMessage("Verification needs current online admission."); return; }
    running.current = action;
    setBusy(true);
    try {
      const response = await fetch("http://127.0.0.1:8114/" + platform + "/manifest", { signal: action.signal });
      action.assertCurrent();
      if (!response.ok) throw new Error("Manifest unavailable");
      const manifest = parseManifest(await response.json(), platform);
      action.assertCurrent();
      const receipt = await runLiveScenario(manifest, { action, fixture, platform, native: () => custody.state() });
      action.assertCurrent();
      const saved = await fetch("http://127.0.0.1:8114/" + platform + "/receipt", {
        signal: action.signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receipt),
      });
      action.assertCurrent();
      if (running.current === action && !action.signal.aborted) setMessage(saved.ok ? "Scenario " + receipt.scenarioId + " · " + receipt.status + " · assertions recorded" : "Scenario finished; receipt transport unavailable");
    } catch {
      if (running.current === action && !action.signal.aborted) setMessage("Verification stopped. Check the approved manifest and current online admission.");
    } finally { if (running.current === action) { running.current = null; setBusy(false); } action.cancel(); }
  };
  return <>
    <Copy title="Real-provider public requests" detail="Development only. Explicitly runs the coordinator's approved financial scenario using this app's Clerk client, native key and normal public API." />
    <SecondaryButton label="Run approved public scenario" disabled={busy} onPress={() => { void run(); }} />
    <Copy title="Scenario status" detail={message} />
  </>;
}
