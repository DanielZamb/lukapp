// PROTOTYPE: notification-first review. The person sees the notification
// itself with the suggestion highlighted inside it, and starts a normal local
// Draft from it. Nothing posts from here; Post still reviews everything.
//
// Two variants to compare on a real phone:
//   A · Fields first   the notification on top, suggested fields below to edit
//   B · Tap the text   the notification is the editor: tap amounts and words
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Choice, Field, Header, PrimaryButton, Screen, SecondaryButton, useTheme, useThemeMode, useUi } from "../../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../../ui/tokens";
import { api } from "../../api";
import { formatAmount, parseMoney } from "../../money";
import { calendarDate } from "../../timeZones";
import { useLocalEntryDrafts } from "../../useLocalEntryDrafts";
import { IntakeContext } from "../IntakeProvider";
import { ActionBar, AlertLine, Card, IconTile, Muted, NavRow, SectionHeading } from "../IntakeParts";
import { appInitial, productKindLabel } from "../appCatalog";
import { useT } from "../../../i18n";
import { arrivalText } from "./arrivalText";
import corpus from "../suggestSamples.json";
import { pieces, suggest, type Direction, type Mention, type Suggestion } from "../suggest";

type Arrival = {
  id: string; source: "phone" | "sample" | "pasted"; app: string; at: number; title: string; text: string;
  sourceSelectionId?: string; today?: string;
};
type Props = { subject: string; workspaceId: string; currency: string; timeZone: string; defaultProfileId: string; onBack(): void };

const time = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const money = (minor: number, currency: string) => `$${formatAmount(minor, currency, { hideZeroDecimals: true })}`;

function summary(suggestion: Suggestion, currency: string) {
  if (suggestion.sensitive) return { line: "Hidden · looks like a security code", tone: undefined };
  if (!suggestion.amount) return { line: "No amount found", tone: undefined };
  const sign = suggestion.direction?.value === "in" ? "+" : suggestion.direction?.value === "out" ? "−" : "";
  const who = suggestion.counterparty ? ` · ${suggestion.counterparty.value}` : "";
  return { line: `${sign}${money(suggestion.amount.minor, suggestion.amount.currency ?? currency)}${who}`,
    tone: suggestion.confidence === "ready" ? "positive" as const : "warning" as const };
}

export function NotificationFirst(props: Props) {
  const ui = useUi();
  const service = useContext(IntakeContext);
  const snapshot = service?.getSnapshot();
  const diagnostics = snapshot?.status && "epoch" in snapshot.status && snapshot.status.diagnostics?.enabled === true;
  const [phone, setPhone] = useState<Arrival[] | null>(null);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");
  const [open, setOpen] = useState<Arrival | null>(null);
  const [showSamples, setShowSamples] = useState(!diagnostics);

  useEffect(() => {
    if (!service || !diagnostics) return;
    let current = true;
    void (async () => {
      try {
        const list = await service.listDiagnostics();
        const labels = new Map((await service.listSources().catch(() => [])).map((source) => [source.packageName, source.label]));
        const rows: Arrival[] = [];
        for (const record of list.records) {
          const detail = await service.readDiagnostic(record.id);
          if (!detail) continue;
          const { title, text } = arrivalText(detail.snapshot);
          rows.push({ id: record.id, source: "phone", app: labels.get(record.packageName) ?? record.packageName, at: record.notificationAt,
            title, text, sourceSelectionId: record.sourceSelectionId,
            today: `${record.parser.outcome}${record.parser.reasons.length ? ` · ${record.parser.reasons.join(", ")}` : ""}` });
        }
        if (current) setPhone(rows.sort((a, b) => b.at - a.at));
      } catch {
        if (current) setError("Couldn't read the beta diagnostics store. Unlock and refresh intake, or try the samples.");
      }
    })();
    return () => { current = false; };
  }, [service, diagnostics]);

  const samples = useMemo<Arrival[]>(() => corpus.samples.map((sample, index) => ({
    id: sample.id, source: "sample", app: sample.appLabel, at: Date.now() - index * 3_600_000, title: sample.title, text: sample.text,
  })), []);

  if (open) return <Composer {...props} arrival={open} onBack={() => setOpen(null)} />;

  const row = (arrival: Arrival, index: number, all: Arrival[]) => {
    const result = summary(suggest(arrival), props.currency);
    return <NavRow key={arrival.id} last={index === all.length - 1} leading={<IconTile letter={appInitial(arrival.app)} tone="accent" />}
      title={arrival.app} status={`${result.line}${arrival.today ? `\nToday's parser: ${arrival.today}` : ""}`} statusTone={result.tone}
      accessibilityLabel={`${arrival.app}, ${result.line}`} onPress={() => setOpen(arrival)} />;
  };

  return <Screen>
    <Header title="Notification first" eyebrow="PROTOTYPE" onBack={props.onBack} />
    <Muted>Start from the notification itself. Lukapp only suggests; you pick the amount and words, then finish in Post as a normal Draft.</Muted>
    <View style={ui.section}>
      <SectionHeading title="Paste a notification" meta="From any app or SMS. Nothing is saved until you start a Draft." />
      <TextInput accessibilityLabel="Notification text" value={pasted} onChangeText={setPasted} multiline placeholder="Compraste $45.900 en RAPPI…"
        style={[ui.input, { minHeight: 96, textAlignVertical: "top", borderWidth: 1, borderRadius: radius.md, padding: spacing.md }]} />
      <SecondaryButton label="Review pasted text" disabled={!pasted.trim()} onPress={() => setOpen({ id: "pasted", source: "pasted", app: "Pasted text", at: Date.now(), title: "", text: pasted })} />
    </View>
    {diagnostics ? <View style={ui.section}>
      <SectionHeading title="On this phone" meta="Last 24 hours from the beta diagnostics store, including ones today's parser dropped." />
      {error ? <AlertLine>{error}</AlertLine> : !phone ? <ActivityIndicator accessibilityLabel="Reading notifications" />
        : !phone.length ? <Muted>No notifications stored yet. They appear here as your chosen apps send them.</Muted>
        : <Card>{phone.map(row)}</Card>}
    </View> : <Muted>Beta diagnostics are off in this build, so your phone's notifications aren't available here. Use the samples or paste text.</Muted>}
    <View style={ui.section}>
      <SecondaryButton label={showSamples ? "Hide samples" : `Show ${samples.length} synthetic samples`} onPress={() => setShowSamples((value) => !value)} />
      {showSamples ? <Card>{samples.map(row)}</Card> : null}
    </View>
  </Screen>;
}

function Composer({ arrival, subject, workspaceId, currency, timeZone, defaultProfileId, onBack }: Props & { arrival: Arrival }) {
  const { t } = useT();
  const ui = useUi();
  const theme = useTheme();
  const dark = useThemeMode() === "dark";
  const service = useContext(IntakeContext);
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId });
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const suggestion = useMemo(() => suggest(arrival), [arrival]);
  const mapped = arrival.sourceSelectionId
    ? service?.getSnapshot().state.mappings.find((mapping) => mapping.sourceSelectionId === arrival.sourceSelectionId) : undefined;
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<Mention | null>(suggestion.amount);
  const [amountText, setAmountText] = useState(suggestion.amount ? formatAmount(suggestion.amount.minor, currency, { hideZeroDecimals: true }) : "");
  const [direction, setDirection] = useState<Direction>(suggestion.direction?.value ?? "out");
  const [description, setDescription] = useState(suggestion.counterparty?.value ?? "");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [profileId, setProfileId] = useState(mapped?.workspaceId === workspaceId ? mapped.financialAccountProfileId : defaultProfileId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hidden = suggestion.sensitive !== null && !revealed;
  // parseMoney returns minor units and throws while the text is incomplete.
  const minor = (() => { try { return parseMoney(amountText || "0", currency); } catch { return 0; } })();
  const foreign = chosen?.currency && chosen.currency !== currency;
  const accent = dark ? "#c4b5fd" : theme.primary;

  function choose(mention: Mention) {
    setChosen(mention);
    setAmountText(formatAmount(mention.minor, currency, { hideZeroDecimals: true }));
  }
  function tapWord(start: number, end: number) {
    if (anchor === null) { setAnchor(start); setDescription(suggestion.text.slice(start, end)); return; }
    const from = Math.min(anchor, start);
    const to = Math.max(end, anchor + 1);
    setDescription(suggestion.text.slice(from, to).replace(/\s+/g, " ").replace(/[.,;:]$/, "").trim());
    setAnchor(null);
  }
  async function startDraft() {
    if (busy || !(minor > 0)) return;
    setBusy(true); setError("");
    try {
      const draftId = await drafts.port.keep({ facts: {
        workspaceId, currency, entryType: "normal", amountText: `${direction === "out" ? "-" : ""}${formatAmount(minor, currency, { hideZeroDecimals: true })}`, amountFormat: "pre-currency",
        accountingDate: calendarDate(new Date(arrival.at), timeZone), description: description.slice(0, 120), profileId, destinationId: null,
        categories: { ids: [], primaryId: null },
      } });
      router.push({ pathname: "/post", params: { draftId } });
    } catch {
      setError("Couldn't save the Draft on this device. Unlock and try again.");
    } finally { setBusy(false); }
  }

  const span = (kind: string) => kind === "amount" ? { color: accent, fontFamily: font.bold, backgroundColor: `${theme.primary}26` }
    : kind === "balance" ? { color: theme.mutedForeground, textDecorationLine: "underline" as const, textDecorationStyle: "dashed" as const }
    : kind === "direction" ? { textDecorationLine: "underline" as const, color: direction === "in" ? theme.positive : theme.foreground }
    : kind === "counterparty" ? { fontFamily: font.semibold, backgroundColor: `${theme.warning}2e` }
    : kind === "when" ? { color: theme.mutedForeground } : {};

  const notification = <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary, padding: spacing.lg, gap: spacing.sm }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <IconTile letter={appInitial(arrival.app)} tone="accent" />
      <View style={{ flex: 1 }}>
        <Text style={[ui.body, { fontFamily: font.semibold }]}>{arrival.app}</Text>
        <Text style={[ui.muted, { fontSize: 13 }]}>{time(arrival.at)}{arrival.source === "sample" ? " · synthetic sample" : ""}</Text>
      </View>
    </View>
    {hidden ? <>
      <Text style={ui.muted}>Hidden. It looks like a security code, so nothing is suggested.</Text>
      <SecondaryButton label="Show it anyway" onPress={() => setRevealed(true)} />
    </> : <Text selectable={variant === "A"} style={[ui.body, { lineHeight: 26 }]}>
      {pieces(suggestion, chosen).map((piece) => {
        const bold = piece.start < suggestion.titleLength ? { fontFamily: font.bold } : {};
        if (piece.mention) return <Text key={piece.start} accessibilityRole="button" accessibilityLabel={`Use ${piece.text}`}
          onPress={() => choose(piece.mention as Mention)} style={[bold, span(piece.kind)]}>{piece.text}</Text>;
        if (variant === "B") {
          let offset = piece.start;
          return piece.text.split(/(\s+)/).map((word) => {
            const start = offset; offset += word.length;
            if (!word.trim()) return word;
            const picked = anchor === start;
            return <Text key={start} onPress={() => tapWord(start, start + word.length)}
              style={[bold, span(piece.kind), picked && { backgroundColor: `${theme.primary}40` }]}>{word}</Text>;
          });
        }
        return <Text key={piece.start} style={[bold, span(piece.kind)]}>{piece.text}</Text>;
      })}
    </Text>}
    {arrival.today ? <Text style={[ui.muted, { fontSize: 13 }]}>Today's parser: {arrival.today}</Text> : null}
  </View>;

  const directionToggle = <View style={{ flexDirection: "row", gap: spacing.sm }}>
    {(["out", "in"] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: direction === value }}
      accessibilityLabel={value === "out" ? "Money out" : "Money in"} onPress={() => setDirection(value)}
      style={{ flex: 1, minHeight: touchTarget, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
        borderWidth: direction === value ? 2 : 1, borderColor: direction === value ? theme.primary : theme.border,
        backgroundColor: direction === value ? `${theme.primary}1f` : theme.background }}>
      <Text style={[ui.body, { fontFamily: direction === value ? font.bold : font.medium }]}>{value === "out" ? "Money out" : "Money in"}</Text>
    </Pressable>)}
  </View>;

  const amountHero = <View style={{ gap: spacing.xs }}>
    <Text style={ui.label}>{direction === "out" ? "MONEY OUT" : "MONEY IN"} · {currency}</Text>
    <Text style={[ui.hero, { color: direction === "in" ? theme.positive : theme.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
      {minor > 0 ? `${direction === "out" ? "−" : "+"}${money(minor, currency)}` : "—"}
    </Text>
  </View>;

  return <Screen footer={<ActionBar>
    {error ? <AlertLine>{error}</AlertLine> : null}
    <PrimaryButton label="Start a Draft" disabled={!(minor > 0) || hidden || !profiles} pending={busy} onPress={() => { void startDraft(); }} />
  </ActionBar>}>
    <Header title={arrival.app} eyebrow="PROTOTYPE · NOTIFICATION FIRST" onBack={onBack} />
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.md, backgroundColor: theme.secondary }}>
      {(["A", "B"] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: variant === value }}
        accessibilityLabel={value === "A" ? "A · Fields first" : "B · Tap the text"} onPress={() => { setVariant(value); setAnchor(null); }}
        style={{ flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: variant === value ? theme.background : "transparent" }}>
        <Text style={[ui.body, { fontSize: 15, fontFamily: variant === value ? font.bold : font.medium }]}>{value === "A" ? "A · Fields first" : "B · Tap the text"}</Text>
      </Pressable>)}
    </View>
    {notification}
    {suggestion.notes.length && !hidden ? <View style={{ gap: spacing.xs }}>{suggestion.notes.map((note) => <Muted key={note}>{note}</Muted>)}</View> : null}
    {foreign ? <AlertLine>{`This amount is in ${chosen?.currency}; this workspace records ${currency}. Check the amount before posting.`}</AlertLine> : null}
    {hidden ? null : variant === "A" ? <>
      {amountHero}
      <Field label="Amount" accessibilityLabel="Amount" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} />
      {suggestion.amounts.length > 1 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {suggestion.amounts.map((mention) => <Pressable key={mention.start} accessibilityRole="radio" accessibilityState={{ checked: mention === chosen }}
          accessibilityLabel={`Use ${mention.raw}${mention.role === "balance" ? ", a balance" : ""}`} onPress={() => choose(mention)}
          style={{ minHeight: touchTarget, paddingHorizontal: spacing.lg, borderRadius: radius.full, justifyContent: "center",
            borderWidth: mention === chosen ? 2 : 1, borderColor: mention === chosen ? theme.primary : theme.border }}>
          <Text style={[ui.body, { fontSize: 15 }]}>{mention.raw}{mention.role === "balance" ? " · balance" : ""}</Text>
        </Pressable>)}
      </View> : null}
      {directionToggle}
      <Field label="Description" accessibilityLabel="Description" value={description} onChangeText={setDescription} placeholder="Who or what" />
    </> : <>
      <Muted>{anchor === null ? "Tap an amount to use it. Tap a word, then another, to make the description." : "Now tap the last word of the description."}</Muted>
      {amountHero}
      {directionToggle}
      <View style={{ gap: spacing.xs }}>
        <Text style={ui.label}>DESCRIPTION</Text>
        <Text style={[ui.body, { fontSize: fontSize.title, fontFamily: font.semibold }]}>{description || "Tap words in the notification"}</Text>
        {description ? <Pressable accessibilityRole="button" accessibilityLabel="Clear description" onPress={() => { setDescription(""); setAnchor(null); }}
          style={{ minHeight: touchTarget, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={[ui.body, { color: accent, fontFamily: font.semibold }]}>Clear</Text>
        </Pressable> : null}
      </View>
    </>}
    {!hidden ? <View style={ui.section}>
      <SectionHeading title="Place" meta={mapped ? "From this app's intake setting" : "Your default place"} />
      {!profiles ? <ActivityIndicator accessibilityLabel="Loading places" /> : <View style={{ gap: spacing.sm }}>
        {profiles.filter((profile) => profile.workspaceId === workspaceId).map((profile) => <Choice key={profile.id} label={profile.name}
          detail={productKindLabel(t, profile.productKind)} selected={profileId === profile.id} onPress={() => setProfileId(profile.id)} />)}
      </View>}
    </View> : null}
    <Muted>Prototype. Starting a Draft saves a normal Draft on this phone and opens Post, where you choose categories and post.</Muted>
  </Screen>;
}
