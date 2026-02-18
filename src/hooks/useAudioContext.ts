import { useContext } from "react";
import {
  AudioCtxContext,
  type AudioCtx,
} from "../context/AudioContext";

export function useAudioContext(): AudioCtx {
    const value = useContext(AudioCtxContext);
    if (!value) {
        throw new Error("useAudioContext must be used within AudioContextProvider");
    }
    return value;
}
