import type { FunctionReturnType } from "convex/server";
import { Text } from "react-native";
import { api } from "./api";
import { formatMoney } from "./money";
import { ListGroup, ListRow, ui } from "../ui/core";

type Row = FunctionReturnType<
  typeof api.accounting.postedActivity
>["rows"][number];
export function ActivityRows({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return <Text style={ui.muted}>No posted activity yet.</Text>;
  return (
    <ListGroup>
      {rows.map((row) => (
        <ListRow
          key={row.id}
          title={row.title}
          detail={`${row.date} · ${row.detail}${row.reversed ? " · Reversed" : ""}`}
          value={formatMoney(row.amount)}
        />
      ))}
    </ListGroup>
  );
}
