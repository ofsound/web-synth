/**
 * Base hook for polyphonic VoiceManager-based synthesizers.
 *
 * Built on `useSynthIO` for shared plumbing (params, output node, MIDI).
 * Adds `VoiceManager` lifecycle on top.
 *
 * Derived hooks provide voice-specific callbacks:
 * - createVoice(note, velocity, time): V
 * - releaseVoice(voice, note, time): void
 * - killVoice(voice, note): void
 *
 * IMPORTANT: Pass a stable `callbacks` function (e.g. wrapped in `useMemo`
 * with empty deps). The hook internally refs it to avoid VoiceManager
 * recreation on every render, but a stable reference is recommended.
 *
 * @example
 * ```ts
 * interface MyVoice { osc: OscillatorNode; vca: GainNode; }
 *
 * const { outputNode, activeNotes, params, setParams } = useSynthBase({
 *   ctx,
 *   midiBus,
 *   defaultParams: { gain: 0.8, enabled: true, ... },
 *   maxVoices: 16,
 *   createVoice(note, velocity, time) { ... },
 *   releaseVoice(voice, note, time) { ... },
 *   killVoice(voice, note) { ... },
 * });
 * ```
 */

import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import { VoiceManager } from "./VoiceManager";
import type { MidiBus, MidiEvent } from "../midi/MidiBus";
import { useSynthIO, type BaseSynthParams } from "./useSynthIO";

export type { BaseSynthParams } from "./useSynthIO";

export interface VoiceManagerCallbacks<V> {
  createVoice: (note: number, velocity: number, time: number) => V;
  releaseVoice: (voice: V, note: number, time: number) => void;
  killVoice: (voice: V, note: number) => void;
}

export interface UseSynthBaseOptions<P extends BaseSynthParams, V> {
  ctx: AudioContext | null;
  midiBus: MidiBus;
  defaultParams: P;
  maxVoices?: number;
  /**
   * Optional MIDI channel filter (0-15).  When provided, only MIDI events
   * on this channel reach the VoiceManager.  Omit or pass null/undefined
   * to listen on all channels (legacy behaviour).
   */
  listenChannel?: number | null;
  /**
   * Return the envelope release duration (seconds) for cleanup scheduling.
   * Called once during VoiceManager construction; the VoiceManager uses this
   * to know how long to keep a releasing voice alive.
   * Defaults to 0.5 s if omitted.
   */
  getReleaseDuration?: (getParams: () => P) => number;
  callbacks: (
    ctx: AudioContext,
    output: GainNode,
    getParams: () => P,
  ) => VoiceManagerCallbacks<V>;
}

export interface SynthBaseResult<P> {
  outputNode: GainNode | null;
  params: P;
  setParams: React.Dispatch<React.SetStateAction<P>>;
}

export function useSynthBase<P extends BaseSynthParams, V>(
  options: UseSynthBaseOptions<P, V>,
): SynthBaseResult<P> {
  const { ctx, midiBus, defaultParams, maxVoices = 16, listenChannel, getReleaseDuration, callbacks } = options;

  const vmRef = useRef<VoiceManager<V> | null>(null);
  const callbacksRef = useRef(callbacks);
  // Keep ref in sync using an effect — satisfies react-hooks/refs while
  // ensuring the VoiceManager always calls the latest version.
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // MIDI handler — forwarded to VoiceManager
  const handleMidi = useCallback((e: MidiEvent, audioCtx: AudioContext) => {
    const vm = vmRef.current;
    if (!vm) return;
    const time = audioCtx.currentTime;
    if (e.type === "noteon" && e.velocity > 0) {
      vm.noteOn(e.note, e.velocity, time);
    } else if (
      e.type === "noteoff" ||
      (e.type === "noteon" && e.velocity === 0)
    ) {
      vm.noteOff(e.note, time);
    }
  }, []);

  const { outputNode, outputRef, params, setParams, getParams } = useSynthIO(
    ctx,
    midiBus,
    defaultParams,
    handleMidi,
    listenChannel,
  );

  // VoiceManager lifecycle
  useEffect(() => {
    if (!ctx || !outputRef.current) return;
    const output = outputRef.current;
    const voiceCallbacks = callbacksRef.current(ctx, output, getParams);

    const vm = new VoiceManager<V>({
      maxVoices,
      releaseDuration: getReleaseDuration ? getReleaseDuration(getParams) : undefined,
      createVoice: voiceCallbacks.createVoice,
      releaseVoice: voiceCallbacks.releaseVoice,
      killVoice: voiceCallbacks.killVoice,
    });

    vmRef.current = vm;

    return () => {
      vm.allNotesOff();
    };
  }, [ctx, getParams, getReleaseDuration, maxVoices, outputRef]);

  return { outputNode, params, setParams };
}

/**
 * Helper to scale gain by MIDI velocity (0-127 -> 0-1).
 */
export function velocityToGain(velocity: number): number {
  return velocity / 127;
}
