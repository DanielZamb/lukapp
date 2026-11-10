import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Image, Switch, Text, View } from "react-native";
import { formatLongDate, useT } from "../../i18n";
import {
  Choice,
  ConfirmationScreen,
  Field,
  Header,
  PrimaryButton,
  Screen,
  SecondaryButton,
  useTheme,
  useUi,
} from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import {
  includesScreenshot,
  type DestinationState,
  type Report,
  type ReportMachine,
  type ReportPhase,
  type SendFailure,
} from "./report";
import { validateReport, type ReportField } from "./validation";

type Actions = {
  machine: ReportMachine;
  interact: () => void;
  onRedact: () => void;
  onRetryDestination: () => void;
  onBackToGuide: () => void;
};

export function ReportLayer({
  phase,
  destination,
  offline,
  shakeEnabled,
  ...actions
}: Actions & {
  phase: Exclude<ReportPhase, { kind: "idle" } | { kind: "capturing" }>;
  destination: DestinationState;
  offline: boolean;
  shakeEnabled: boolean;
}) {
  const { t } = useT();
  if (phase.kind === "sent")
    return (
      <ConfirmationScreen
        title={t("feedback.sentTitle", { number: phase.result.issueNumber })}
        detail={t("feedback.sentDetail", { reference: phase.result.reference })}
        buttonLabel={t("common.done")}
        onContinue={() => actions.machine.done()}
      />
    );
  if (phase.kind === "resuming") return <Resume stored={phase.stored} machine={actions.machine} />;
  return (
    <ReportForm
      phase={phase}
      destination={destination}
      offline={offline}
      shakeEnabled={shakeEnabled}
      {...actions}
    />
  );
}

function Resume({ stored, machine }: { stored: Report; machine: ReportMachine }) {
  const ui = useUi();
  const { t, language } = useT();
  return (
    <Screen>
      <Header title={t("feedback.resumeTitle")} onBack={() => machine.requestCancel()} />
      <Text style={ui.body}>{t("feedback.resumeDetail", { date: formatLongDate(language, stored.createdAt) })}</Text>
      {stored.fields.title.trim() ? <Text style={ui.muted}>{stored.fields.title.trim()}</Text> : null}
      <PrimaryButton label={t("feedback.resume")} onPress={() => void machine.resume()} />
      <SecondaryButton label={t("feedback.startNew")} tone="danger" onPress={() => void machine.startNew()} />
      <SecondaryButton label={t("feedback.notNow")} onPress={() => machine.requestCancel()} />
    </Screen>
  );
}

function Banner({ tone, children }: { tone: "info" | "danger"; children: ReactNode }) {
  const theme = useTheme();
  const ui = useUi();
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={{
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: theme.secondary,
        borderWidth: 1,
        borderColor: tone === "danger" ? theme.danger : theme.border,
      }}
    >
      <Ionicons
        name={tone === "danger" ? "alert-circle-outline" : "information-circle-outline"}
        size={22}
        color={tone === "danger" ? theme.danger : theme.foreground}
      />
      <Text style={[ui.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

function failureText(failure: SendFailure, t: ReturnType<typeof useT>["t"], tn: ReturnType<typeof useT>["tn"]) {
  switch (failure.code) {
    case "offline":
      return t("feedback.offline");
    case "unknown":
      return t("feedback.unknownFailure");
    case "access":
      return t("feedback.accessFailure");
    case "not_configured":
      return t("feedback.notConfigured");
    case "rate_limited":
      return tn("feedback.rateLimited", Math.max(1, Math.ceil((failure.retryAt - Date.now()) / 60_000)));
    case "invalid_report":
      return t(failure.field === "screenshot" ? "feedback.invalidScreenshot" : "feedback.invalidReport");
    case "changed_report":
      return t("feedback.changedReport");
    case "report_expired":
      return t("feedback.reportExpired");
  }
}

function ReportForm({
  phase,
  destination,
  offline,
  shakeEnabled,
  machine,
  interact,
  onRedact,
  onRetryDestination,
  onBackToGuide,
}: Actions & {
  phase: Extract<ReportPhase, { kind: "editing" | "sending" | "failed" }>;
  destination: DestinationState;
  offline: boolean;
  shakeEnabled: boolean;
}) {
  const ui = useUi();
  const theme = useTheme();
  const { t, tn } = useT();
  const { report } = phase;
  const practice = phase.kind === "editing" && phase.practice;
  const editable = phase.kind === "editing" && !phase.confirm;
  const failure = phase.kind === "failed" ? phase.failure : phase.kind === "editing" ? phase.notice : null;
  const screenshotNotice = phase.kind === "sending" ? null : phase.screenshotNotice;
  const showErrors = phase.kind === "editing" && phase.showErrors;
  const errors = showErrors ? validateReport(report.fields) : {};
  const serverField = failure?.code === "invalid_report" ? failure.field : null;
  const fieldError = (field: ReportField) =>
    errors[field] ? t(errors[field]) : serverField === field ? t("feedback.invalidReport") : undefined;
  const audience = typeof destination === "object" ? destination.audience : null;
  const included = includesScreenshot(report, audience);
  const ready = typeof destination === "object" && destination.configured;
  const change = (field: ReportField) => (value: string) => {
    interact();
    machine.edit(field, value);
  };
  const confirm = phase.kind === "editing" || phase.kind === "failed" ? phase.confirm : null;
  const title = report.kind === "bug" ? t("feedback.titleBug") : t("feedback.titleFeedback");
  const back = practice ? onBackToGuide : () => machine.requestCancel();
  const fields: { field: ReportField; label: string; multiline: boolean; placeholder?: string }[] = [
    { field: "title", label: t("feedback.fieldTitle"), multiline: false, placeholder: t("feedback.fieldTitlePlaceholder") },
    { field: "whatHappened", label: t("feedback.fieldWhatHappened"), multiline: true },
    { field: "expected", label: t("feedback.fieldExpected"), multiline: true },
    { field: "steps", label: t("feedback.fieldSteps"), multiline: true },
  ];
  if (confirm)
    return (
      <Screen>
        <Header title={title} onBack={() => machine.dismissConfirm()} />
        <ConfirmPanel kind={confirm} frozen={phase.kind === "failed"} machine={machine} />
      </Screen>
    );
  return (
    <Screen>
      <Header title={title} eyebrow={practice ? t("feedback.practiceEyebrow") : undefined} onBack={back} />
      <View accessibilityRole="radiogroup" accessibilityLabel={t("feedback.kindLabel")} style={ui.section}>
        <Text style={ui.sectionHeading}>{t("feedback.kindLabel")}</Text>
        <Choice
          label={t("feedback.kindBug")}
          detail={t("feedback.kindBugDetail")}
          selected={report.kind === "bug"}
          disabled={!editable}
          onPress={() => machine.setKind("bug")}
        />
        <Choice
          label={t("feedback.kindFeedback")}
          detail={t("feedback.kindFeedbackDetail")}
          selected={report.kind === "feedback"}
          disabled={!editable}
          onPress={() => machine.setKind("feedback")}
        />
      </View>
      <View style={ui.section}>
        <Text style={ui.muted}>{t("feedback.privateReminder")}</Text>
        {fields.map(({ field, label, multiline, placeholder }) => (
          <Field
            key={field}
            label={label}
            accessibilityLabel={label}
            value={report.fields[field]}
            onChangeText={change(field)}
            editable={editable}
            placeholder={placeholder}
            multiline={multiline}
            textAlignVertical={multiline ? "top" : undefined}
            style={multiline ? { minHeight: 112 } : undefined}
            error={fieldError(field)}
          />
        ))}
      </View>
      <View style={ui.section}>
        <Text style={ui.sectionHeading}>{t("feedback.screenshotHeading")}</Text>
        {screenshotNotice ? (
          <Banner tone="danger">
            {t(screenshotNotice === "redactFailed" ? "feedback.redactFailed" : "feedback.screenshotMissing")}
          </Banner>
        ) : null}
        {practice ? (
          <Text style={ui.body}>{t("feedback.practiceScreenshot")}</Text>
        ) : report.screenshot ? (
          <>
            <Image
              accessibilityLabel={t("feedback.screenshotPreview")}
              source={{ uri: report.screenshot.uri }}
              resizeMode="contain"
              style={{
                width: "100%",
                aspectRatio: report.screenshot.width / report.screenshot.height,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: theme.border,
                opacity: included ? 1 : 0.5,
              }}
            />
            {report.screenshot.redacted ? <Text style={ui.muted}>{t("feedback.screenshotRedacted")}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Text style={[ui.body, { flex: 1 }]}>{t("feedback.includeScreenshot")}</Text>
              <Switch
                accessibilityLabel={t("feedback.includeScreenshot")}
                value={included}
                disabled={!editable || audience === null}
                onValueChange={(value) => machine.setScreenshotIncluded(value)}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            </View>
            {audience === "public" ? <Text style={ui.muted}>{t("feedback.includeScreenshotPublic")}</Text> : null}
            <SecondaryButton label={t("feedback.blackOut")} disabled={!editable} onPress={onRedact} />
            <SecondaryButton
              label={t("feedback.removeScreenshot")}
              tone="danger"
              disabled={!editable}
              onPress={() => void machine.removeScreenshot()}
            />
          </>
        ) : report.captureFailed ? (
          <Text style={ui.body}>{t("feedback.captureUnavailable")}</Text>
        ) : (
          <Text style={ui.body}>
            {t("feedback.menuTextOnly")}
            {shakeEnabled ? ` ${t("feedback.menuShakeHint")}` : ""}
          </Text>
        )}
      </View>
      <View style={ui.section}>
        <AudienceNotice destination={destination} onRetry={onRetryDestination} />
        <Text style={ui.muted}>{t("feedback.automaticContext")}</Text>
      </View>
      {practice ? (
        <View style={ui.section}>
          <Banner tone="info">{t("feedback.practiceNote")}</Banner>
          <PrimaryButton label={t("feedback.backToGuide")} trailingIcon="arrow-back" onPress={onBackToGuide} />
        </View>
      ) : (
        <View style={ui.section}>
          {offline && phase.kind === "editing" && failure?.code !== "offline" ? (
            <Banner tone="info">{t("feedback.offlineBanner")}</Banner>
          ) : null}
          {failure ? <Banner tone="danger">{failureText(failure, t, tn)}</Banner> : null}
          {phase.kind === "failed" ? <Text style={ui.muted}>{t("feedback.frozenNote")}</Text> : null}
          <PrimaryButton
            label={
              phase.kind === "sending"
                ? t(phase.step === "uploading" ? "feedback.uploading" : "feedback.submitting")
                : phase.kind === "failed" || failure?.code === "unknown" || failure?.code === "offline"
                  ? t("feedback.retry")
                  : failure?.code === "changed_report"
                    ? t("feedback.sendAsNew")
                    : t("feedback.send")
            }
            trailingIcon="paper-plane-outline"
            pending={phase.kind === "sending"}
            disabled={!ready || (phase.kind === "editing" && failure?.code === "changed_report" && !phase.editedSinceNotice)}
            onPress={() => {
              interact();
              void machine.send();
            }}
          />
          {phase.kind === "failed" ? (
            <SecondaryButton label={t("feedback.keepForLater")} onPress={() => machine.keepForLater()} />
          ) : null}
          <SecondaryButton label={t("common.cancel")} disabled={phase.kind === "sending"} onPress={back} />
        </View>
      )}
    </Screen>
  );
}

function AudienceNotice({ destination, onRetry }: { destination: DestinationState; onRetry: () => void }) {
  const ui = useUi();
  const { t } = useT();
  if (destination === "loading") return <Text style={ui.muted}>{t("feedback.audienceLoading")}</Text>;
  if (destination === "unavailable")
    return (
      <>
        <Banner tone="danger">{t("feedback.audienceUnavailable")}</Banner>
        <SecondaryButton label={t("feedback.checkAgain")} onPress={onRetry} />
      </>
    );
  if (!destination.configured) return <Banner tone="danger">{t("feedback.notConfigured")}</Banner>;
  return (
    <Banner tone="info">
      {t(destination.audience === "public" ? "feedback.audiencePublic" : "feedback.audiencePrivate", {
        repository: destination.repository,
      })}
    </Banner>
  );
}

function ConfirmPanel({ kind, frozen, machine }: { kind: "discard" | "newKey"; frozen: boolean; machine: ReportMachine }) {
  const ui = useUi();
  const { t } = useT();
  return (
    <View style={ui.section}>
      <Text accessibilityRole="header" style={ui.title}>
        {t(kind === "discard" ? "feedback.discardTitle" : "feedback.newKeyTitle")}
      </Text>
      <Text style={ui.body}>{t(kind === "discard" ? "feedback.discardDetail" : "feedback.newKeyDetail")}</Text>
      {kind === "discard" ? (
        <SecondaryButton label={t("common.discard")} tone="danger" onPress={() => void machine.discard()} />
      ) : (
        <PrimaryButton label={t("feedback.newKeyConfirm")} onPress={() => machine.confirmNewKey()} />
      )}
      <SecondaryButton
        label={frozen ? t("common.back") : t("feedback.keepEditing")}
        onPress={() => machine.dismissConfirm()}
      />
    </View>
  );
}
