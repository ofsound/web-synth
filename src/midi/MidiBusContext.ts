import { createContext } from "react";
import type { MidiBus } from "./MidiBus";

/** React context holding the singleton MidiBus instance. */
export const MidiBusContext = createContext<MidiBus | null>(null);
