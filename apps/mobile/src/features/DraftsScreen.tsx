import { ActivityIndicator, Text } from "react-native";
import { Header, ListGroup, ListRow, Screen, SecondaryButton, ui } from "../ui/core";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";

export function DraftsScreen({
  items,
  ready,
  error,
  completeLabel,
  onBack,
  onResume,
  onCompleteMonth,
}: {
  items: DraftListItem[];
  ready: boolean;
  error: string;
  completeLabel: string;
  onBack: () => void;
  onResume: (id: LocalEntryDraftId) => void;
  onCompleteMonth: () => void;
}) {
  return (
    <Screen>
      <Header title="Drafts" eyebrow="ON THIS DEVICE" onBack={onBack} />
      {error ? (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      ) : null}
      {!ready ? (
        <ActivityIndicator accessibilityLabel="Loading drafts" />
      ) : items.length === 0 ? (
        <>
          <Text style={ui.title}>No Drafts to review</Text>
          <Text style={ui.muted}>The Drafts destination remains available.</Text>
        </>
      ) : (
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={item.description.trim() || "Incomplete draft"}
              detail={`${item.status === "posting" ? "Retry posting · " : ""}Expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.expiresAt))}`}
              onPress={() => onResume(item.id)}
            />
          ))}
        </ListGroup>
      )}
      <SecondaryButton label={completeLabel} onPress={onCompleteMonth} />
    </Screen>
  );
}
