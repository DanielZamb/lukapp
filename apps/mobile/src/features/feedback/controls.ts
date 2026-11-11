import { createContext, useContext, useEffect } from "react";

export type FeedbackControls = {
  /** True once the person is past admission and the app is unlocked. */
  available: boolean;
  openReport: () => void;
  openGuide: () => void;
  shakeEnabled: boolean;
  setShakeEnabled: (enabled: boolean) => void;
  /** Null until this phone's stored answer is read. */
  guideSeen: boolean | null;
  markGuideSeen: () => void;
  savedReport: boolean;
};

const inert: FeedbackControls = {
  available: false,
  openReport: () => {},
  openGuide: () => {},
  shakeEnabled: true,
  setShakeEnabled: () => {},
  guideSeen: null,
  markGuideSeen: () => {},
  savedReport: false,
};

export const FeedbackContext = createContext<FeedbackControls>(inert);

export function useFeedback() {
  return useContext(FeedbackContext);
}

export const FeedbackAdmissionSignal = createContext<(admitted: boolean) => void>(() => {});

/** Rendered inside the device admission gate: the report layer works only while this is mounted. */
export function FeedbackAdmission() {
  const signal = useContext(FeedbackAdmissionSignal);
  useEffect(() => {
    signal(true);
    return () => signal(false);
  }, [signal]);
  return null;
}
