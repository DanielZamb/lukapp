import { createContext, useContext } from "react";
export const InteractionContext = createContext<() => void>(() => {});
export const useInteraction = () => useContext(InteractionContext);
