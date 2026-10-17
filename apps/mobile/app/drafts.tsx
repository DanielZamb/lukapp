import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen } from "../src/features/DraftsScreen";
import { footerLabel, monthKey } from "../src/features/monthClose/model";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { Screen } from "../src/ui/core";

function Drafts({
  subject,
  workspaceId,
  currentPeriod,
}: {
  subject: string;
  workspaceId: string;
  currentPeriod: { year: number; month: number };
}) {
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const period = { year: currentPeriod.year, month: currentPeriod.month };
  return (
    <DraftsScreen
      items={drafts.items}
      ready={drafts.count !== null}
      error={drafts.error}
      completeLabel={footerLabel(period)}
      onBack={() => router.back()}
      onResume={(id) =>
        router.push({ pathname: "/post", params: { draftId: id } })
      }
      onCompleteMonth={() =>
        router.push({ pathname: "/month-close", params: { month: monthKey(period) } })
      }
    />
  );
}

export default function DraftsRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  return defaults && userId ? (
    <Drafts
      subject={userId}
      workspaceId={defaults.workspace.id}
      currentPeriod={defaults.workspace.currentAccountingPeriod}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
