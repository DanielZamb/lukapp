import React, { Component, useLayoutEffect, type ReactNode } from "react";
import { Text } from "react-native";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { useT } from "../i18n";
import { Header, PrimaryButton, Screen, useUi } from "../ui/core";

type ReadState = { kind: "clear" } | { kind: "error"; error: unknown };

// Keep this inside the local-entry provider; Router's root boundary wraps that provider.
export class ProtectedReadBoundary extends Component<{ children: ReactNode }, ReadState> {
  state: ReadState = { kind: "clear" };
  static getDerivedStateFromError(error: unknown): ReadState { return { kind: "error", error }; }
  render() {
    return this.state.kind === "clear" ? this.props.children : (
      <ReadFailure error={this.state.error} retry={() => this.setState({ kind: "clear" })} />
    );
  }
}
function ReadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const ui = useUi();
  const { t } = useT();
  const report = useDeviceAccessFailure();
  useLayoutEffect(() => { report(error); }, [error, report]);
  return (
    <Screen>
      <Header title={t("access.loadFailedTitle")} />
      <Text style={ui.body}>{t("access.readFailedBody")}</Text>
      <PrimaryButton label={t("common.retry")} onPress={retry} />
    </Screen>
  );
}
