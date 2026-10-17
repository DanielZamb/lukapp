import type { FunctionReturnType } from "convex/server";
import { Text } from "react-native";
import { api } from "./api";
import { formatActivityAmount } from "./history/format";
import { ListGroup, ListRow, ui } from "../ui/core";

type Row = FunctionReturnType<
  typeof api.accounting.postedHistory
>["page"][number];
export function ActivityRow({ row, onEntry }: { row: Row; onEntry?: (id: string) => void }) {
  return <ListRow
    title={row.title}
    detail={`${row.date} · ${row.detail}${row.reversed ? " · Reversed" : ""}${row.reversesEntryId && row.detail !== "Reversal" ? " · Reversal" : ""}`}
    value={formatActivityAmount(row.amount)}
    onPress={onEntry ? () => onEntry(row.id) : undefined}
  />;
}
export function ActivityRows({ rows, onEntry }: { rows: Row[]; onEntry?: (id: string) => void }) {
  if (!rows.length)
    return <Text style={ui.muted}>No posted activity yet.</Text>;
  return (
    <ListGroup>
      {rows.map((row) => (
        <ActivityRow key={row.id} row={row} onEntry={onEntry} />
      ))}
    </ListGroup>
  );
}
