import { useClerk, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { router, Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { placeTitle } from "../src/features/places/model";
import { useT } from "../src/i18n";
import { BrandLogo } from "../src/ui/Brand";
import {
  AppearanceToggle,
  LanguageToggle,
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
  const { t, tn } = useT();
  const { signOut } = useClerk();
  const { user } = useUser();
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, {
    workspaceId,
  });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const title = user?.firstName?.trim() || t("settings.fallbackName");
  const placeCount = profiles?.length ?? 0;
  const financesDetail =
    profiles?.length === 1
      ? `${workspaceKind} · ${currency} · ${placeTitle(profiles[0].name, 1, t)}`
      : `${workspaceKind} · ${currency} · ${tn("settings.places", placeCount)}`;
  const draftCategories =
    categories?.slice(0, 3).map((category) => category.name).join(" · ") ||
    t("settings.noCategories");
  return (
    <Screen>
      <Header title={title} eyebrow={t("settings.eyebrow")} onBack={() => router.back()} />
      <View style={ui.section}>
        <Text style={ui.sectionHeading}>{t("settings.appearance")}</Text>
        <AppearanceToggle />
      </View>
      <View style={ui.section}>
        <Text style={ui.sectionHeading}>{t("settings.language")}</Text>
        <LanguageToggle />
      </View>
      <ListGroup>
        <ListRow
          title={t("settings.myFinances")}
          detail={profiles ? financesDetail : undefined}
          icon="home-outline"
          onPress={() => router.push("/overview")}
        />
        <ListRow
          title={t("settings.categories")}
          detail={categories ? draftCategories : undefined}
          icon="pricetag-outline"
          onPress={() => router.push("./categories")}
        />
        <ListRow
          title={t("settings.intake")}
          detail={t("settings.intakeDetail")}
          icon="notifications-outline"
          onPress={() => router.push("/intake")}
          isLast
        />
      </ListGroup>
      {!profiles || !categories ? <ActivityIndicator /> : null}
      <SecondaryButton label={t("settings.signOut")} onPress={() => void signOut()} />
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
