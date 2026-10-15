import { router } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { useRuntime, useAccess } from "../access/RuntimeProvider";
import { usePostedActivity } from "../modules/posted-activity/PostedActivityProvider";
import { formatMoney } from "../modules/posted-activity/phone";
import { Screen, Copy, Header, PrimaryButton, ActionTile } from "../ui";

export default function Index() {
  const { controller } = useRuntime();
  const access = useAccess();
  const posted = usePostedActivity();
  const [setup, setSetup] = useState<"loading" | "required" | "complete">("loading");
  useEffect(() => {
    let stopped = false;
    void controller.execute(async (proof, rpc) => rpc.query(api.accounting.firstRunStatus,
      await proof("accounting.firstRunStatus", { now: Date.now() })))
      .then(result => {
        if (stopped) return;
        if (result.kind !== "required" && access.kind === "provisioning") {
          controller.workspace(result.workspace.id);
          void controller.admit();
          return;
        }
        setSetup(result.kind === "required" ? "required" : "complete");
      })
      .catch(() => {});
    return () => { stopped = true; };
  }, [controller, access]);
  if (setup === "loading") return <Screen><Copy title="Loading your money" /></Screen>;
  if (setup === "required") return <Screen><Header title="Lukapp" /><Copy title="Let's start with what you have" detail="Four short answers, then you're ready to track." />
    <PrimaryButton label="Get started" onPress={() => router.push("/setup")} />
  </Screen>;
  const first = posted.kind === "ready" ? posted.phone?.balances[0] : undefined;
  return (
    <Screen>
      <Header title="Lukapp" action={{ label: "User and Workspace", icon: "○", onPress: () => router.push("/user") }} />
      <Copy
        title="This month"
        detail={first ? "What you have now · " + formatMoney(first.balance.currency, first.balance.minorUnits) : "Your money is loading online."}
      />
      <ActionTile title={first ? formatMoney(first.balance.currency, first.balance.minorUnits) : "Your money"} supporting="What would you like to do?" onPress={() => router.push("/money")} />
      <ActionTile title="Drafts" supporting="Input saved on this device" onPress={() => router.push("/drafts")} />
      <ActionTile title="Transactions" supporting="See your recent entries" onPress={() => router.push("/account")} />
    </Screen>
  );
}
