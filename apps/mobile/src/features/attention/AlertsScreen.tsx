import { ActivityIndicator } from "react-native";
import { Header, ListGroup, ListRow, Screen } from "../../ui/core";
import type { AlertDestination, AttentionState } from "./model";

export function AlertsScreen({ state, onBack, onOpen }: {
  state: AttentionState;
  onBack: () => void;
  onOpen: (destination: AlertDestination) => void;
}) {
  return (
    <Screen>
      <Header title="Alerts" eyebrow="WHAT NEEDS ATTENTION" onBack={onBack} />
      {state.kind === "loading" ? (
        <ActivityIndicator accessibilityLabel="Loading alerts" />
      ) : (
        <ListGroup>
          {state.data.rows.length === 0 ? (
            <ListRow title="Nothing crossed a line" detail="Limits are still holding"
              icon="checkmark-circle-outline" tone="positive" />
          ) : state.data.rows.map((row) => (
            <ListRow key={row.id} title={row.title} detail={row.detail}
              icon="flag-outline" value="Now" tone="warning"
              onPress={() => onOpen(row.destination)} />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
