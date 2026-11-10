import { useAction, useQuery } from "convex/react";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePersonalDefaults, usePostedActivity, useRecentActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatActivityAmount } from "../src/features/history/format";
import { formatMoney } from "../src/features/money";
import { EmojiSheet } from "../src/features/places/EmojiSheet";
import { accountEmoji, accountKinds, placeTitle, trackingDate } from "../src/features/places/model";
import { RenameSheet } from "../src/features/places/RenameSheet";
import { usePlaceStyles } from "../src/features/places/styles";
import { everyPlace, refusalMessage, refusalOf, type UndoOperation } from "../src/features/placeEnding/model";
import { UndoStatusCard, useUndoStatus } from "../src/features/placeEnding/UndoStatus";
import { useFrozenCommand } from "../src/features/useFrozenCommand";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import { formatLongDate, useT } from "../src/i18n";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../src/ui/core";

function Account({ workspaceId, profileId, defaultProfileId, timeZone }: {
  workspaceId: string;
  profileId: string;
  defaultProfileId: string;
  timeZone: string;
}) {
  const styles = usePlaceStyles();
  const ui = useUi();
  const theme = useTheme();
  const activity = usePostedActivity(workspaceId, timeZone, "all");
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId, ...everyPlace });
  const recent = useRecentActivity(workspaceId, 3, profileId);
  const translator = useT();
  const { t, language } = translator;
  const changeLook = useAction(api.accounting.changeAccountLook);
  const reportFailure = useDeviceAccessFailure();
  const [aborted, setAborted] = useState<UndoOperation | null>(null);
  const abort = useFrozenCommand({ send: useAction(api.accounting.abortUndoPlace), reportFailure,
    onDone: (receipt: { operation: UndoOperation }) => setAborted(receipt.operation) });
  const rename = useAction(api.accounting.renameAccount);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const account = activity?.accounts.find((a) => a.financialAccountProfileId === profileId);
  const profile = profiles?.find((item) => item.id === profileId);
  const status = profile?.status;
  const endedOn = profile?.endedAt === undefined ? null : formatLongDate(language, profile.endedAt, timeZone);
  const open = status === "open";
  const openCount = profiles?.filter((profile) => profile.status === "open").length ?? 0;
  const undo = useUndoStatus(workspaceId, profileId, status === "undoing" || status === "undone");
  const title = account ? placeTitle(account.name, open ? openCount : 0, t) : "";
  const ready = activity !== undefined && profiles !== undefined;
  return <Screen contentStyle={styles.page}>
    <Header titleStyle={styles.pageTitle} title={title} eyebrow={t("places.accountEyebrow")} onBack={() => router.back()} />
    {posted && <Text accessibilityRole="alert" style={ui.body}>{t("places.accountPosted")}</Text>}
    {account && ready ? <>
      <View style={styles.hero}>
        {open ? <Pressable accessibilityRole="button" accessibilityLabel={t("places.accountChangeLook")} onPress={() => setEmoji(accountEmoji(account))}>
          <Text style={styles.heroEmoji}>{accountEmoji(account)}</Text>
        </Pressable> : <Text style={styles.heroEmoji}>{accountEmoji(account)}</Text>}
        <Text style={styles.muted}>{t("places.accountBalance")}</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.detailAmount}>
          {formatMoney(account.balance, { hideZeroDecimals: true })}
        </Text>
        {open && profileId === defaultProfileId && openCount > 1 &&
          <Text style={[styles.badge, { alignSelf: "flex-start" }]}>{t("workspace.defaultBadge")}</Text>}
      </View>
      {aborted && open && <UndoStatusCard operation={aborted} name={account.name} timeZone={timeZone} />}
      {endedOn && <Text style={ui.title}>{t(status === "closed" ? "placeEnding.closedOn" : "placeEnding.undoneOn", { date: endedOn })}</Text>}
      {status === "closed" && <Text style={ui.body}>{t("placeEnding.accountClosed")}</Text>}
      {(status === "undoing" || status === "undone") && (undo ? <UndoStatusCard operation={undo} name={account.name} timeZone={timeZone}
        abort={{ busy: abort.busy, uncertain: abort.state.name === "uncertain",
          error: abort.state.name === "uncertain" ? t("placeEnding.abortUncertain")
            : abort.state.name === "open" && abort.state.refusal ? abortRefusal(abort.state.refusal.code, translator) : "",
          onAbort: () => { void abort.submit(() => ({ workspaceId, operationId: undo.id })); } }} />
        : undo === undefined ? <ActivityIndicator accessibilityLabel={t("placeEnding.loading")} /> : null)}
      {status === "undone" && <Text style={ui.body}>{t("placeEnding.accountUndone")}</Text>}
      {status === "undoing" && <Text style={ui.body}>{t("placeEnding.accountUndoing")}</Text>}
      <PrimaryButton label={t("places.accountSeeHistory")} trailingIcon="receipt-outline"
        onPress={() => router.push({ pathname: "/history", params: { profileId } })} />
      <ListGroup>
        <ListRow title={t("planning.nameRow")} value={title} onPress={open ? () => setRenaming(true) : undefined} />
        <ListRow title={t("places.accountType")} value={t(accountKinds[account.productKind])} />
        <ListRow title={t("places.accountCurrency")} value={account.balance.currency} />
        <ListRow title={t("places.accountTracking")} value={trackingDate(account.trackingFrom, translator)} />
      </ListGroup>
      <Text style={ui.title}>{t("places.accountRecent")}</Text>
      {recent ? <ListGroup>
        {recent.page.length === 0 ? <ListRow title={t("places.accountNoActivity")} detail={t("places.accountNoActivityDetail")} />
          : recent.page.slice(0, 3).map((row) => <ListRow key={row.id} title={row.title} detail={row.date}
            value={row.reversed ? t("places.accountReversed") : formatActivityAmount(row.amount)}
            valueStyle={{ color: row.reversed ? theme.mutedForeground : row.amount.minorUnits > 0 ? theme.primary : theme.foreground }} />)}
      </ListGroup> : <ActivityIndicator accessibilityLabel={t("places.accountLoadingRecent")} />}
      {open && <SecondaryButton label={t("placeEnding.endAction")}
        onPress={() => router.push({ pathname: "/place-ending", params: { profileId } })} />}
      {open && emoji !== null && <EmojiSheet emoji={emoji} onPick={setEmoji} onDismiss={() => setEmoji(null)}
        onUse={async () => { await changeLook({ workspaceId, financialAccountProfileId: profileId, emoji }); }} />}
      {open && renaming && <RenameSheet rename={rename} onDismiss={() => setRenaming(false)}
        seed={{ workspaceId, profileId, storedName: account.name, initialName: title }} />}
    </> : ready ? <Text style={ui.muted}>{t("places.accountNotFound")}</Text> : <ActivityIndicator accessibilityLabel={t("places.accountLoading")} />}
  </Screen>;
}
function abortRefusal(code: string, translator: ReturnType<typeof useT>) {
  return code === "place_undo_abort_forbidden" ? translator.t("placeEnding.abortForbidden")
    : refusalMessage({ code, blocker: null }, "undo", translator);
}

export default function AccountRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? <Account key={profileId ?? defaults.financialAccountProfile.id} workspaceId={defaults.workspace.id}
    profileId={profileId ?? defaults.financialAccountProfile.id} defaultProfileId={defaults.financialAccountProfile.id}
    timeZone={defaults.workspace.timeZone} />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
