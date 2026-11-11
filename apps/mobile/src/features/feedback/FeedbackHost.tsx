import { useConvex, useConvexConnectionState } from "convex/react";
import * as Crypto from "expo-crypto";
import { usePathname } from "expo-router";
import { Accelerometer } from "expo-sensors";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState, BackHandler, Platform, View } from "react-native";
import { useT } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { LocalInput } from "../../local-auth/localInput";
import { useTheme } from "../../ui/core";
import { IntakeAdmission } from "../intake/admission";
import { wipeFilesWithLocalInput } from "../clearLocalInput";
import { deleteAllCaptures, deleteCapture, readCapture, sweepCaptures } from "./captureFiles";
import { snapshotView } from "./snapshot";
import { FeedbackAdmissionSignal, FeedbackContext, type FeedbackControls } from "./controls";
import { createReportDraftStore } from "./draftStore";
import { readGuideSeen, readShakeEnabled, writeGuideSeen, writeShakeEnabled } from "./preferences";
import { RedactionEditor, type RedactionResult } from "./RedactionEditor";
import { ReportMachine } from "./report";
import { ReportGuide } from "./ReportGuide";
import { ReportLayer } from "./ReportForm";
import { createShakeWatch, shakeSampleIntervalMs, type AccelerometerSource } from "./shake";
import { classifySendError, convexFeedbackTransport, deviceContext, screenName } from "./transport";

const accelerometer: AccelerometerSource = {
  subscribe(listener) {
    try {
      Accelerometer.setUpdateInterval(shakeSampleIntervalMs);
      const subscription = Accelerometer.addListener(listener);
      return () => subscription.remove();
    } catch {
      return () => {};
    }
  },
};

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

wipeFilesWithLocalInput(deleteAllCaptures);

/**
 * The report layer. It sits above the app's screens and sheets, inside the
 * local privacy boundary, so the caller screen stays mounted underneath and
 * the privacy cover still hides everything when the app leaves the foreground.
 */
export function FeedbackHost({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { language } = useT();
  const convex = useConvex();
  const connection = useConvexConnectionState();
  const lease = useContext(LocalInput);
  const unlocked = useContext(IntakeAdmission);
  const reportAccessFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const pathname = usePathname();
  const [admitted, setAdmitted] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [shakeEnabled, setShakeState] = useState<boolean | null>(null);
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null);
  const [savedReport, setSavedReport] = useState(false);
  const [guide, setGuide] = useState<number | null>(null);
  const [redacting, setRedacting] = useState(false);
  const content = useRef<View>(null);
  const contentSize = useRef({ width: 0, height: 0 });
  const live = useRef({ language, connection, reportAccessFailure, unlocked, lease, pathname });
  live.current = { language, connection, reportAccessFailure, unlocked, lease, pathname };
  // The privacy cover doesn't hide the app from an in-process render, so this guard is what protects a capture.
  // The refs are set by the events themselves, not on the next render, so a capture resolving in between sees them.
  const admittedNow = useRef(false);
  const foregroundNow = useRef(true);
  const captureAllowed = useCallback(
    () => admittedNow.current && live.current.lease !== null && live.current.unlocked() && foregroundNow.current,
    [],
  );
  const signalAdmission = useCallback((value: boolean) => {
    admittedNow.current = value;
    setAdmitted(value);
  }, []);
  const transport = useMemo(() => convexFeedbackTransport(convex), [convex]);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const drafts = useMemo(
    () => (lease ? createReportDraftStore({ lease, now: Date.now, deleteCapture, onChange: setSavedReport }) : null),
    [lease],
  );
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [machine] = useState(
    () =>
      new ReportMachine({
        newKey: Crypto.randomUUID,
        now: Date.now,
        capture: () => snapshotView(content, contentSize.current, Crypto.randomUUID(), { allowed: captureAllowed }),
        captureAllowed,
        readScreenshot: readCapture,
        deleteCapture,
        drafts: {
          read: () => draftsRef.current?.read() ?? Promise.resolve(null),
          save: (report) => draftsRef.current?.save(report),
          saveNow: (report) => draftsRef.current?.saveNow(report) ?? Promise.resolve(),
          clear: () => draftsRef.current?.clear(),
        },
        transport: {
          attachScreenshot: (args) => transportRef.current.attachScreenshot(args),
          removeScreenshot: (args) => transportRef.current.removeScreenshot(args),
          submit: (args) => transportRef.current.submit(args),
        },
        context: () => deviceContext(live.current.language),
        isOffline: () => live.current.connection.hasEverConnected && !live.current.connection.isWebSocketConnected,
        classify: (error) =>
          classifySendError(error, { now: Date.now(), reportAccessFailure: live.current.reportAccessFailure }),
      }),
  );
  const { phase, destination } = useSyncExternalStore(machine.subscribe, machine.getSnapshot);
  const available = admitted && lease !== null;
  const reportOpen = phase.kind !== "idle" && phase.kind !== "capturing";
  const layerOpen = reportOpen || guide !== null;

  useEffect(() => {
    void readShakeEnabled().then(setShakeState, () => setShakeState(true));
    void readGuideSeen().then(setGuideSeen, () => setGuideSeen(false));
  }, []);

  useEffect(() => {
    if (!drafts) return;
    let current = true;
    void drafts
      .read()
      .then((stored) => {
        if (!current) return;
        setSavedReport(stored !== null);
        return sweepCaptures(stored?.screenshot ? [stored.screenshot.uri] : [], Date.now());
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [drafts]);

  useEffect(() => {
    let state = AppState.currentState;
    let focused = true;
    const update = () => {
      const active = state === "active" && focused;
      foregroundNow.current = active;
      setForeground(active);
      if (state === "background") void draftsRef.current?.flush();
    };
    update();
    const changes = AppState.addEventListener("change", (next) => {
      state = next;
      update();
    });
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => { focused = false; update(); }) : null;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => { focused = true; update(); }) : null;
    return () => {
      changes.remove();
      blur?.remove();
      focus?.remove();
    };
  }, []);

  useEffect(
    () => () => {
      void draftsRef.current?.flush();
      void machine.dispose();
    },
    [machine],
  );

  const watch = useMemo(
    () =>
      createShakeWatch({
        source: accelerometer,
        now: Date.now,
        onShake: () => void machine.open("shake", screenName(live.current.pathname)),
      }),
    [machine],
  );
  useEffect(() => () => watch.dispose(), [watch]);
  const listening = available && foreground && shakeEnabled === true && phase.kind === "idle" && guide === null;
  useEffect(() => watch.listen(listening), [watch, listening]);

  const loadDestination = useCallback(() => {
    machine.setDestination("loading");
    transportRef.current.destination().then(
      (value) => machine.setDestination(value),
      (error: unknown) => {
        live.current.reportAccessFailure(error);
        machine.setDestination("unavailable");
      },
    );
  }, [machine]);
  useEffect(() => {
    if (layerOpen) loadDestination();
  }, [layerOpen, loadDestination]);
  useEffect(() => {
    if (phase.kind === "idle") setRedacting(false);
  }, [phase.kind]);

  const back = () => {
    if (redacting) return setRedacting(false);
    switch (phase.kind) {
      case "editing":
        if (phase.confirm) return machine.dismissConfirm();
        if (phase.practice) return void machine.discard();
        return machine.requestCancel();
      case "failed":
        if (phase.confirm) return machine.dismissConfirm();
        return machine.requestCancel();
      case "resuming":
        return machine.requestCancel();
      case "sent":
        return machine.done();
      case "sending":
      case "capturing":
        return;
      case "idle":
        if (guide !== null) setGuide(null);
    }
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    if (!layerOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [layerOpen]);

  const setShakeEnabled = useCallback((enabled: boolean) => {
    setShakeState(enabled);
    void writeShakeEnabled(enabled).catch(() => {});
  }, []);
  const markGuideSeen = useCallback(() => {
    setGuideSeen(true);
    void writeGuideSeen().catch(() => {});
  }, []);
  const controls = useMemo<FeedbackControls>(
    () => ({
      available,
      openReport: () => {
        if (available) void machine.open("menu", screenName(live.current.pathname));
      },
      openGuide: () => {
        if (!available || machine.getSnapshot().phase.kind !== "idle") return;
        markGuideSeen();
        setGuide(0);
      },
      shakeEnabled: shakeEnabled !== false,
      setShakeEnabled,
      guideSeen,
      markGuideSeen,
      savedReport,
    }),
    [available, machine, shakeEnabled, setShakeEnabled, guideSeen, markGuideSeen, savedReport],
  );

  const finishRedaction = async (result: RedactionResult) => {
    if (result.kind === "flattened") await machine.replaceScreenshot(result.screenshot);
    if (result.kind === "failed") await machine.redactionFailed();
    setRedacting(false);
  };

  const screenshot = phase.kind === "editing" ? phase.report.screenshot : null;
  return (
    <FeedbackAdmissionSignal.Provider value={signalAdmission}>
      <FeedbackContext.Provider value={controls}>
        <View
          ref={content}
          collapsable={false}
          style={{ flex: 1 }}
          onLayout={(event) => {
            contentSize.current = {
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            };
          }}
          importantForAccessibility={layerOpen ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={layerOpen}
        >
          {children}
        </View>
        {layerOpen ? (
          <View testID="feedback-layer" accessibilityViewIsModal style={[fill, { backgroundColor: theme.background }]}>
            {redacting && screenshot ? (
              <RedactionEditor
                screenshot={screenshot}
                flatten={(canvas, size) => snapshotView(canvas, size, Crypto.randomUUID(), { rejectBlank: false })}
                onDone={(result) => void finishRedaction(result)}
                onCancel={() => setRedacting(false)}
              />
            ) : reportOpen ? (
              <ReportLayer
                phase={phase}
                destination={destination}
                offline={connection.hasEverConnected && !connection.isWebSocketConnected}
                shakeEnabled={shakeEnabled !== false}
                machine={machine}
                interact={interact}
                onRedact={() => setRedacting(true)}
                onRetryDestination={loadDestination}
                onBackToGuide={() => void machine.discard()}
              />
            ) : guide !== null ? (
              <ReportGuide
                step={guide}
                destination={destination}
                onStep={setGuide}
                onBack={() => setGuide(null)}
                onTryIt={() => machine.openPractice()}
              />
            ) : null}
          </View>
        ) : null}
      </FeedbackContext.Provider>
    </FeedbackAdmissionSignal.Provider>
  );
}
