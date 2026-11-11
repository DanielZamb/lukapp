import { ActivityIndicator } from "react-native";
import { useT } from "../../i18n";
import { Header, ListGroup, ListRow, Screen } from "../../ui/core";
import type { AlertDestination, AttentionState } from "./model";

export function AlertsScreen({ state, onBack, onOpen }: {
  state: AttentionState;
  onBack: () => void;
  onOpen: (destination: AlertDestination) => void;
}) {
  const { t } = useT();
  return (
    <Screen>
      <Header title={t("home.alertsTitle")} eyebrow={t("home.alertsEyebrow")} onBack={onBack} />
      {state.kind === "loading" ? (
        <ActivityIndicator accessibilityLabel={t("home.alertsLoadingList")} />
      ) : (
        <ListGroup>
          {state.data.rows.length === 0 ? (
            <ListRow title={t("home.alertsEmpty")} detail={t("home.alertsEmptyDetail")}
              icon="checkmark-circle-outline" tone="positive" />
          ) : state.data.rows.map((row) => (
            <ListRow key={row.id} title={row.title} detail={row.detail}
              icon="flag-outline" value={t("home.alertsNow")} tone="warning"
              onPress={() => onOpen(row.destination)} />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
