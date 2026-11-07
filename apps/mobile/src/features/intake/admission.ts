import { createContext } from "react";

export const IntakeAdmission = createContext<() => boolean>(() => false);

export const IntakeDeviceAdmission = createContext<() => boolean>(() => false);
