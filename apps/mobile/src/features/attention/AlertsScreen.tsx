import { ActivityIndicator, Text } from "react-native";
import { Header, ListGroup, ListRow, Screen, SecondaryButton, useUi } from "../../ui/core";
import { updatesDetail, type AlertDestination, type AttentionState } from "./model";

export function AlertsScreen({ state, onBack, onOpen, onRetry }: {
  state: AttentionState;
  onBack: () => void;
  onOpen: (destination: AlertDestination) => void;
  onRetry: () => void;
}) {
  const ui = useUi();
  return (
    <Screen>
      <Header title="Alerts" eyebrow={updatesDetail(state).toUpperCase()} onBack={onBack} />
      {state.kind === "loading" ? (
        <ActivityIndicator accessibilityLabel="Loading alerts" />
      ) : state.kind === "error" ? (
        <>
          <Text accessibilityRole="alert" style={ui.error}>{state.message}</Text>
          <SecondaryButton label="Try again" onPress={onRetry} />
        </>
      ) : state.rows.length === 0 ? (
        <>
          <Text style={ui.title}>Nothing needs attention</Text>
          <Text style={ui.muted}>Your Drafts, Candidates, Recovery, and month review are clear.</Text>
        </>
      ) : (
        <ListGroup>
          {state.rows.map((row) => (
            <ListRow key={row.id} title={row.title} detail={row.detail}
              onPress={() => onOpen(row.destination)} />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
