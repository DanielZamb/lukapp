import { Copy, ListGroup, ListRow } from "../../ui";
import { usePostedActivity } from "./PostedActivityProvider";

export function PostedActivityList({
  title,
  limit,
}: {
  title: string;
  limit: number;
}) {
  const activity = usePostedActivity();
  switch (activity.kind) {
    case "loading":
      return <Copy title={title} detail="Loading activity…" />;
    case "unavailable":
      return (
        <Copy
          title={title}
          detail="Activity is unavailable. Connect to a Workspace to see it."
        />
      );
    case "failed":
      return <Copy title={title} detail={activity.message} />;
    case "ready":
      return (
        <ListGroup title={title}>
          {activity.rows.length === 0 ? (
            <Copy title="No activity yet" />
          ) : (
            activity.rows
              .slice(0, limit)
              .map((row) => (
                <ListRow
                  key={row.id}
                  title={row.title}
                  supporting={row.supporting}
                  value={row.signedAmount}
                />
              ))
          )}
        </ListGroup>
      );
  }
}
