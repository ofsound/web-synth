import { createContext } from "react";

export interface AudioCtx {
  ctx: AudioContext | null;
  resume: () => Promise<void>;
}

export const AudioCtxContext = createContext<AudioCtx | null>(null);
