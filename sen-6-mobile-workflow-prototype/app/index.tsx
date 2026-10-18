// Three variants of the level 1 door, switchable via ?variant=, on `/`.
// C is the settled door. First-run stays D. Home starts at level 0.
// Three variants of the Plans budget view, switchable via ?plans=.
// A lands on the August budget destination.

import { useLocalSearchParams } from "expo-router";
import { normalizeDoorVariant } from "../components/level-1-door";
import { VariantEWorkflow } from "../components/variant-e-workflow";

export default function Index() {
  const { variant, plans } = useLocalSearchParams<{
    variant?: string;
    plans?: string;
  }>();
  const doorVariant = normalizeDoorVariant(
    Array.isArray(variant) ? variant[0] : variant,
  );
  const plansParam = Array.isArray(plans) ? plans[0] : plans;
  const openPlans = plansParam != null && plansParam.length > 0;

  return <VariantEWorkflow doorVariant={doorVariant} openPlans={openPlans} />;
}
