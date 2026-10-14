import { useRef, useState } from "react";
import { Platform } from "react-native";
import { useRuntime } from "../access/RuntimeProvider";
import { custody } from "../access/native";
import { parseManifest, runLiveScenario } from "./live-scenario";
import { Copy, SecondaryButton } from "../ui";

export function LiveVerification() {
  const { controller, fixture } = useRuntime();
  const [message, setMessage] = useState("Coordinator manifest required. Deployment assertions require independent receipts.");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  if (!__DEV__ || fixture) return null;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const expected = controller.getSnapshot();
    try {
      const response = await fetch("http://127.0.0.1:8114/" + platform + "/manifest");
      if (!response.ok) throw new Error("Manifest unavailable");
      const manifest = parseManifest(await response.json(), platform);
      const receipt = await runLiveScenario(manifest, { controller, fixture, platform, native: () => custody.state() });
      const saved = await fetch("http://127.0.0.1:8114/" + platform + "/receipt", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receipt),
      });
      if (controller.getSnapshot() === expected) setMessage(saved.ok ? "Scenario " + receipt.scenarioId + " · " + receipt.status + " · assertions recorded" : "Scenario finished; receipt transport unavailable");
    } catch {
      if (controller.getSnapshot() === expected) setMessage("Verification stopped. Check the approved manifest and current online admission.");
    } finally { running.current = false; setBusy(false); }
  };
  return <>
    <Copy title="Real-provider public requests" detail="Development only. Explicitly runs the coordinator's approved financial scenario using this app's Clerk client, native key and normal public API." />
    <SecondaryButton label="Run approved public scenario" disabled={busy} onPress={() => { void run(); }} />
    <Copy title="Scenario status" detail={message} />
  </>;
}
