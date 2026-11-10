import type { FunctionReturnType } from "convex/server";
import { Text } from "react-native";
import { api } from "./api";
import { formatActivityAmount } from "./history/format";
import { ListGroup, ListRow, useUi } from "../ui/core";
import { useT } from "../i18n";

type Row = FunctionReturnType<
  typeof api.accounting.postedHistory
>["page"][number];
export function ActivityRow({ row, onEntry }: { row: Row; onEntry?: (id: string) => void }) {
  const { t } = useT();
  const marks = [
    ...(row.reversed ? [t("posting.activityReversed")] : []),
    ...(row.reversesEntryId && row.detail !== "Reversal" ? [t("posting.activityReversal")] : []),
  ];
  return <ListRow
    title={row.title}
    detail={[row.date, row.detail, ...marks].join(" · ")}
    value={formatActivityAmount(row.amount)}
    onPress={onEntry ? () => onEntry(row.id) : undefined}
  />;
}
export function ActivityRows({ rows, onEntry }: { rows: Row[]; onEntry?: (id: string) => void }) {
  const { t } = useT();
  const ui = useUi();
  if (!rows.length)
    return <Text style={ui.muted}>{t("posting.activityEmpty")}</Text>;
  return (
    <ListGroup>
      {rows.map((row) => (
        <ActivityRow key={row.id} row={row} onEntry={onEntry} />
      ))}
    </ListGroup>
  );
}
