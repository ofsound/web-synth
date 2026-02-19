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
  const initializedRef = useRef(false);
  const [ctx, setCtx] = useState<AudioContext | null>(null);

  const init = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const ac = new AudioContext();
    ctxRef.current = ac;
    setCtx(ac);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;

    const handler = () => {
      init();
    };

    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });

    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [init]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close();
      }
    };
  }, []);

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
      }}
    >
      {children}
    </AudioCtxContext.Provider>
  );
}
