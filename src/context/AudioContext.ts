import { createContext } from "react";

export interface AudioCtx {
  ctx: AudioContext | null;
  resume: () => Promise<void>;
  /** Non-null when AudioContext.resume() was rejected (e.g. iOS permission denied). */
  resumeError: string | null;
}

export const AudioCtxContext = createContext<AudioCtx | null>(null);
