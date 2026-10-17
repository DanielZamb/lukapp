import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen } from "../src/features/DraftsScreen";
import { footerLabel, periodFromMonthKey } from "../src/features/monthClose/model";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { Screen } from "../src/ui/core";

function Drafts({
  subject,
  workspaceId,
  timeZone,
}: {
  subject: string;
  workspaceId: string;
  timeZone: string;
}) {
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const calendar = useWorkspaceCalendar(timeZone);
  return (
    <DraftsScreen
      items={drafts.items}
      ready={drafts.count !== null}
      error={drafts.error}
      completeLabel={footerLabel(periodFromMonthKey(calendar.month))}
      onBack={() => router.back()}
      onResume={(id) =>
        router.push({ pathname: "/post", params: { draftId: id } })
      }
      onCompleteMonth={() => router.push("/month-close")}
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
      timeZone={defaults.workspace.timeZone}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
