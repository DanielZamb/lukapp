import { isLoaded } from "expo-font";
import { font } from "../../theme/tokens";
import { router } from "expo-router";
import { Screen, Header, Copy, ActionTile, ListGroup, ListRow } from "../../ui";

export default function CorePreview() {
  return (
    <Screen>
      <Header
        title="Core preview"
        back={{ label: "Back to Lukapp", onPress: () => router.back() }}
      />
      <Copy
        title="Inspect the foundation"
        detail="Development only. All examples are UI fixtures. No account is connected and no money moves."
      />
      <ActionTile
        title="Shared controls"
        supporting="Buttons, choices, rows and progress"
        onPress={() => router.push("/core-preview/controls")}
      />
      <ActionTile
        title="Shared activity"
        supporting="Two readers, one subscription"
        onPress={() => router.push("/core-preview/activity")}
      />
      <ActionTile
        title="Keyboard entry"
        supporting="An entry field with no posting action"
        onPress={() => router.push("/core-preview/entry")}
      />
      <ListGroup title="Also inspect">
        <ListRow
          title="Geist font loading"
          supporting={
            Object.values(font).every(isLoaded)
              ? "All five exact families loaded"
              : "Font loading incomplete"
          }
          value={`${Object.values(font).filter(isLoaded).length}/5`}
        />
        <ListRow
          title="Measured targets"
          supporting="Actual native layout bounds"
          onPress={() => router.push("/core-preview/targets")}
        />
        <ListRow
          title="Module ownership"
          supporting="Read and input boundaries"
          onPress={() => router.push("/core-preview/ownership")}
        />
        <ListRow
          title="Confirmation"
          supporting="Calm feedback after the example"
          onPress={() => router.push("/core-preview/confirmation")}
        />
      </ListGroup>
    </Screen>
  );
}
