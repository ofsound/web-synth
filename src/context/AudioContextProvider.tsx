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
  const [resumeError, setResumeError] = useState<string | null>(null);

  const init = useCallback(() => {
    if (initializedRef.current && ctxRef.current?.state !== "closed") return;
    initializedRef.current = true;

    const ac = new AudioContext();
    // Eagerly resume — Safari and mobile Chrome may create in "suspended" state.
    // Handle rejection so the error is surfaced rather than swallowed silently.
    if (ac.state === "suspended") {
      ac.resume().catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "AudioContext resume failed";
        console.warn("[AudioContextProvider] resume() rejected:", err);
        setResumeError(message);
      });
    }
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
      initializedRef.current = false;
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close();
      }
    };
  }, []);

  const resume = useCallback(async () => {
    init();
    if (ctxRef.current?.state === "suspended") {
      try {
        await ctxRef.current.resume();
        setResumeError(null);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "AudioContext resume failed";
        console.warn("[AudioContextProvider] resume() rejected:", err);
        setResumeError(message);
      }
    }
  }, [init]);

  return (
    <AudioCtxContext.Provider
      value={{
        ctx,
        resume,
        resumeError,
      }}
    >
      {children}
    </AudioCtxContext.Provider>
  );
}
