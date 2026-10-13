import { router } from "expo-router";
import { Screen, Header, Copy, ListGroup, ListRow } from "../../ui";
import { useTargetMeasurements } from "../../dev/target-inspection";

export default function TargetsPreview() {
  const targets = useTargetMeasurements();
  return (
    <Screen>
      <Header
        title="Measured targets"
        back={{ label: "Back to core preview", onPress: () => router.back() }}
      />
      <Copy
        title={
          targets.every((target) => target.passes)
            ? "All measured targets meet 48 points"
            : "A target is below 48 points"
        }
        detail="Actual native layout bounds from the visited preview routes. Hit slop is additional and does not count here."
      />
      <ListGroup title={`${targets.length} native targets measured`}>
        {targets.map((target) => (
          <ListRow
            key={target.label}
            title={target.label}
            supporting={target.passes ? "Pass" : "Below minimum"}
            value={`${target.width.toFixed(0)} × ${target.height.toFixed(0)} pt`}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
