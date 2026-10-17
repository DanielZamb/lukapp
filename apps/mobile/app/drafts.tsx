import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen } from "../src/features/DraftsScreen";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { Screen } from "../src/ui/core";

function Drafts({
  subject,
  workspaceId,
}: {
  subject: string;
  workspaceId: string;
}) {
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  return (
    <DraftsScreen
      items={drafts.items}
      ready={drafts.count !== null}
      error={drafts.error}
      onBack={() => router.back()}
      onResume={(id) =>
        router.push({ pathname: "/post", params: { draftId: id } })
      }
    />
  );
}

export default function DraftsRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  return defaults && userId ? (
    <Drafts subject={userId} workspaceId={defaults.workspace.id} />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
