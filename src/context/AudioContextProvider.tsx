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
      {/* Tap-to-start overlay: browsers require user interaction before AudioContext can run */}
      {!ctx && (
        <div
          className="bg-surface/95 text-text fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-4 backdrop-blur-sm"
          onClick={init}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") init();
          }}
          role="button"
          tabIndex={0}
          aria-label="Tap or press any key to start audio"
        >
          <span className="text-accent text-6xl" aria-hidden>
            ▶
          </span>
          <p className="text-lg font-medium">Tap to start</p>
          <p className="text-text-muted max-w-xs text-center text-sm">
            Your browser requires a tap or key press before audio can play.
          </p>
        </div>
      )}
    </AudioCtxContext.Provider>
  );
}
