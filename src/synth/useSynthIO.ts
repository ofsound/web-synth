/**
 * Shared IO plumbing for synth engine hooks.
 *
 * Provides:
 * - Params state + ref (avoids stale closures)
 * - Output gain node creation and gain tracking
 * - MIDI bus subscription with forwarded handler
 *
 * Both VoiceManager-based synths (via useSynthBase) and the granular
 * synth (custom voice lifecycle) share this foundation, eliminating
 * duplicated infrastructure.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MidiBus, MidiEvent } from "../midi/MidiBus";

export interface BaseSynthParams {
  gain: number;
  enabled: boolean;
}

export interface SynthIOResult<P> {
  /** Audio output node — connect to master mix bus. */
  outputNode: GainNode | null;
  /** Ref to the output node (synchronously available inside effects). */
  outputRef: React.RefObject<GainNode | null>;
  /** Current params state. */
  params: P;
  /** Update params. */
  setParams: React.Dispatch<React.SetStateAction<P>>;
  /** Stable getter that always returns the latest params (no stale closures). */
  getParams: () => P;
}

export function useSynthIO<P extends BaseSynthParams>(
  ctx: AudioContext | null,
  midiBus: MidiBus,
  defaultParams: P,
  /** Called for every MIDI event while params.enabled is true. */
  onMidi: (e: MidiEvent, ctx: AudioContext) => void,
): SynthIOResult<P> {
  // ── Params state + ref ──
  const [params, setParams] = useState<P>(() => ({ ...defaultParams }));
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const getParams = useCallback(() => paramsRef.current, []);

  // ── Output node ──
  const outputRef = useRef<GainNode | null>(null);
  const [outputNode, setOutputNode] = useState<GainNode | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = paramsRef.current.gain;
    outputRef.current = out;
    queueMicrotask(() => setOutputNode(out));
    return () => {
      out.disconnect();
    };
  }, [ctx]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.gain.value = params.gain;
    }
  }, [params.gain]);

  // ── MIDI subscription ──
  // Ref the handler so the subscription doesn't churn on every handler change.
  const onMidiRef = useRef(onMidi);
  useEffect(() => {
    onMidiRef.current = onMidi;
  }, [onMidi]);

  useEffect(() => {
    if (!ctx) return;

    const unsub = midiBus.subscribe((e) => {
      if (!paramsRef.current.enabled) return;
      onMidiRef.current(e, ctx);
    });

    return unsub;
  }, [ctx, midiBus]);

  return { outputNode, outputRef, params, setParams, getParams };
}
