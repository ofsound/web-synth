import { useEffect, useRef, useState } from "react";

interface MasterAnalyserOptions {
  fftSize?: number;
}

/**
 * Creates an analyser node connected to the master gain.
 * Returns both a ref (for connecting audio nodes) and state (for rendering).
 * This is the common pattern used across synth demos.
 */
export function useMasterAnalyser(
  ctx: AudioContext | null,
  masterGain: GainNode | null,
  options: MasterAnalyserOptions = {},
) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    if (!ctx || !masterGain) return;

    const an = ctx.createAnalyser();
    an.fftSize = options.fftSize ?? 4096;
    an.connect(masterGain);
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain, options.fftSize]);

  return { analyserRef, analyser };
}
