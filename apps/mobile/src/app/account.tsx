import { router, useLocalSearchParams } from "expo-router";
import { usePostedActivity } from "../modules/posted-activity/PostedActivityProvider";
import { accountRows, formatMoney } from "../modules/posted-activity/phone";
import { Screen, Header, Copy, ListGroup, ListRow, PrimaryButton } from "../ui";

export default function Account() {
  const snapshot = usePostedActivity();
  const phone = snapshot.kind === "ready" ? snapshot.phone : undefined;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = id ? phone?.profiles.find(item => item.id === id) : phone?.profiles[0];
  const balance = phone?.balances.find(item => item.financialAccountProfileId === profile?.id);
  return <Screen><Header title={profile?.name ?? "Your account"} back={{ label: "Back home", onPress: () => router.dismissTo("/") }} />
    <Copy title={balance ? formatMoney(balance.balance.currency, balance.balance.minorUnits) : "Loading online"}
      detail={balance?.nature === "Liability" ? "Owed" : "What you have now"} />
    <ListGroup title="Recent entries">{phone && profile && accountRows(phone, profile.id).slice(0, 3).map(row => <ListRow key={row.id} title={row.title} supporting={row.supporting} value={row.signedAmount} />)}</ListGroup>
    <PrimaryButton label="Record an Expense" disabled={!profile} onPress={() => router.push({ pathname: "/expense", params: { account: profile?.id ?? "" } })} />
  </Screen>;
}
