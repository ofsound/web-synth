/**
 * Base hook for polyphonic VoiceManager-based synthesizers.
 *
 * Provides shared infrastructure:
 * - Output gain node creation and management
 * - Active notes state tracking
 * - MIDI bus subscription
 * - VoiceManager lifecycle
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
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { VoiceManager } from "./VoiceManager";
import type { MidiBus } from "../midi/MidiBus";

export interface BaseSynthParams {
  gain: number;
  enabled: boolean;
}

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
  callbacks: (
    ctx: AudioContext,
    output: GainNode,
    getParams: () => P,
  ) => VoiceManagerCallbacks<V>;
}

export interface SynthBaseResult<P> {
  outputNode: GainNode | null;
  activeNotes: Set<number>;
  params: P;
  setParams: React.Dispatch<React.SetStateAction<P>>;
}

export function useSynthBase<P extends BaseSynthParams, V>(
  options: UseSynthBaseOptions<P, V>,
): SynthBaseResult<P> {
  const { ctx, midiBus, defaultParams, maxVoices = 16, callbacks } = options;

  const [params, setParams] = useState<P>(() => ({ ...defaultParams }));
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const getParams = useCallback(() => paramsRef.current, []);

  const outputRef = useRef<GainNode | null>(null);
  const [outputNode, setOutputNode] = useState<GainNode | null>(null);
  const vmRef = useRef<VoiceManager<V> | null>(null);
  const callbacksRef = useRef(callbacks);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  useLayoutEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

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

  useEffect(() => {
    if (!ctx || !outputRef.current) return;
    const output = outputRef.current;
    const voiceCallbacks = callbacksRef.current(ctx, output, getParams);

    const vm = new VoiceManager<V>({
      maxVoices,
      createVoice: voiceCallbacks.createVoice,
      releaseVoice: voiceCallbacks.releaseVoice,
      killVoice: voiceCallbacks.killVoice,
    });

    vmRef.current = vm;

    return () => {
      vm.allNotesOff();
    };
  }, [ctx, getParams, maxVoices]);

  useEffect(() => {
    if (!ctx || !vmRef.current) return;

    const unsub = midiBus.subscribe((e) => {
      if (!paramsRef.current.enabled) return;
      const vm = vmRef.current!;
      const time = ctx.currentTime;

      if (e.type === "noteon" && e.velocity > 0) {
        vm.noteOn(e.note, e.velocity, time);
        setActiveNotes(new Set(vm.activeNotes));
      } else if (
        e.type === "noteoff" ||
        (e.type === "noteon" && e.velocity === 0)
      ) {
        vm.noteOff(e.note, time);
        setActiveNotes(new Set(vm.activeNotes));
      }
    });

    return unsub;
  }, [ctx, midiBus]);

  return { outputNode, activeNotes, params, setParams };
}

/**
 * Helper to scale gain by MIDI velocity (0-127 -> 0-1).
 */
export function velocityToGain(velocity: number): number {
  return velocity / 127;
}
