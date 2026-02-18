import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AudioCtxContext } from "./AudioContext";

export function AudioContextProvider({ children }: { children: ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [ctx, setCtx] = useState<AudioContext | null>(null);
  const [masterGain, setMasterGain] = useState<GainNode | null>(null);

  const init = useCallback(() => {
    if (ctxRef.current) return;
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
    ctxRef.current = ac;
    setCtx(ac);
    setMasterGain(master);
  }, []);

  /* Initialise on first user gesture */
  useEffect(() => {
    const handler = () => {
      init();
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("click", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [init]);

  const resume = useCallback(async () => {
    init();
    if (ctxRef.current?.state === "suspended") {
      await ctxRef.current.resume();
    }
  }, [init]);

  return (
    <AudioCtxContext.Provider
      value={{
        ctx,
        resume,
        masterGain,
      }}
    >
      {children}
    </AudioCtxContext.Provider>
  );
}
