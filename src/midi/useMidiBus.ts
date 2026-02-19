import { useContext } from "react";
import { MidiBusContext } from "./MidiBusContext";
import type { MidiBus } from "./MidiBus";

/**
 * Access the shared MidiBus instance.
 * Must be called inside a <MidiBusProvider>.
 */
export function useMidiBus(): MidiBus {
    const bus = useContext(MidiBusContext);
    if (!bus) throw new Error("useMidiBus must be used within MidiBusProvider");
    return bus;
}
