import { router } from "expo-router";
import { Screen, Header, Copy, ListGroup, ListRow } from "../../ui";
import { moduleOwnership } from "../../modules/ownership";

export default function OwnershipPreview() {
  return (
    <Screen>
      <Header
        title="Module ownership"
        back={{ label: "Back to core preview", onPress: () => router.back() }}
      />
      <Copy
        title="One owner per concept"
        detail="These are integration boundaries. Later-unit owners have no working store in this foundation."
      />
      <ListGroup title="Owner boundaries">
        {Object.entries(moduleOwnership).map(([id, owner]) => (
          <ListRow
            key={id}
            title={owner.label}
            supporting={owner.boundary}
            value={owner.status === "foundation" ? "Core" : "Later"}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
