import { useMemo, type ReactNode } from "react";
import { MidiBus } from "./MidiBus";
import { MidiBusContext } from "./MidiBusContext";

export function MidiBusProvider({ children }: { children: ReactNode }) {
  const bus = useMemo(() => new MidiBus(), []);

  return (
    <MidiBusContext.Provider value={bus}>{children}</MidiBusContext.Provider>
  );
}
