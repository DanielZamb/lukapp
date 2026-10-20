import { useClerk, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { router, Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { BrandLogo } from "../src/ui/Brand";
import {
  AppearanceToggle,
  Header,
  ListGroup,
  ListRow,
  Screen,
  SecondaryButton,
  useUi,
} from "../src/ui/core";

function SettingsContent({
  workspaceId,
  workspaceKind,
  currency,
}: {
  workspaceId: string;
  workspaceKind: string;
  currency: string;
}) {
  const ui = useUi();
  const { signOut } = useClerk();
  const { user } = useUser();
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, {
    workspaceId,
  });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const title = user?.firstName?.trim() || "You";
  const placeCount = profiles?.length ?? 0;
  const financesDetail =
    placeCount === 1
      ? `${workspaceKind} · ${currency} · My money`
      : `${workspaceKind} · ${currency} · ${placeCount} places`;
  const draftCategories =
    categories?.slice(0, 3).map((category) => category.name).join(" · ") ||
    "No categories yet";
  return (
    <Screen>
      <Header title={title} eyebrow="USER & WORKSPACE" onBack={() => router.back()} />
      <View style={ui.section}>
        <Text style={ui.sectionHeading}>Appearance</Text>
        <AppearanceToggle />
      </View>
      <ListGroup>
        <ListRow
          title="My finances"
          detail={profiles ? financesDetail : undefined}
          icon="home-outline"
          onPress={() => router.push("/overview")}
        />
        <ListRow
          title="Categories"
          detail={categories ? draftCategories : undefined}
          icon="pricetag-outline"
          onPress={() => router.push("./categories")}
          isLast
        />
      </ListGroup>
      {!profiles || !categories ? <ActivityIndicator /> : null}
      <SecondaryButton label="Sign out" onPress={() => void signOut()} />
      <View style={{ alignItems: "center", paddingTop: 24 }}>
        <BrandLogo width={112} />
      </View>
    </Screen>
  );
}

export default function Settings() {
  const defaults = usePersonalDefaults();
  if (defaults === undefined) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (defaults === null) {
    return <Redirect href="/" />;
  }
  return (
    <SettingsContent
      workspaceId={defaults.workspace.id}
      workspaceKind={defaults.workspace.kind}
      currency={defaults.workspace.functionalCurrency}
    />
  );
}
