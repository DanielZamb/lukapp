import { router } from "expo-router";
import { View } from "react-native";
import {
  Screen,
  Header,
  Copy,
  PrimaryButton,
  SecondaryButton,
  ListGroup,
  ListRow,
} from "../../ui";
import { PostedActivityList } from "../../modules/posted-activity/PostedActivityList";
import { usePostedActivity } from "../../modules/posted-activity/PostedActivityProvider";
import { usePreviewFixture } from "../../dev/PreviewProvider";
import { spacing } from "../../theme/tokens";

function SubscriptionStatus() {
  usePostedActivity();
  const fixture = usePreviewFixture();
  const { starts, stops } = fixture.counts();
  return (
    <ListRow
      title="Subscription lifecycle"
      supporting="Shared fixture transport"
      value={`${starts} started · ${stops} stopped`}
    />
  );
}
export default function ActivityPreview() {
  const fixture = usePreviewFixture();
  usePostedActivity();
  const workspace = fixture.workspace();
  return (
    <Screen>
      <Header
        title="Shared activity"
        back={{ label: "Back to core preview", onPress: () => router.back() }}
      />
      <Copy
        title="UI fixtures only"
        detail="Both lists below read the same source. Updates reach both. Disconnection clears both."
      />
      <PostedActivityList title="Overview reader · up to 4" limit={4} />
      <PostedActivityList title="Account reader · up to 3" limit={3} />
      <ListGroup title="Inspect lifecycle">
        <SubscriptionStatus />
        <ListRow title="Workspace fixture" value={workspace} />
      </ListGroup>
      <View style={{ gap: spacing.md }}>
        <PrimaryButton
          label="Connect fixture"
          onPress={() => fixture.connect(workspace)}
        />
        <SecondaryButton
          label="Update shared fixture"
          onPress={fixture.update}
        />
        <SecondaryButton label="Disconnect fixture" onPress={fixture.offline} />
        <SecondaryButton
          label="Change Workspace fixture"
          onPress={() => {
            const next = workspace === "fixture-a" ? "fixture-b" : "fixture-a";
            fixture.connect(next);
          }}
        />
      </View>
    </Screen>
  );
}
