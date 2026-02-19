/**
 * Delay / Echo effect hook.
 *
 * Audio graph:
 *   input ─┬─ dryGain ──────────────┬─ output
 *          └─ delay → wetGain ──────┘
 *              ↑  ↓
 *              feedbackGain
 */

import { useEffect, useRef, useState } from "react";
import type { EffectIO } from "../types/audio";
import { setParamSmoothly } from "../utils/audioUtils";

export interface DelayParams {
  delayTime: number;
  feedback: number;
  mix: number;
}

export const DEFAULT_DELAY_PARAMS: DelayParams = {
  delayTime: 0.35,
  feedback: 0.45,
  mix: 0.5,
};

export function useDelay(ctx: AudioContext | null): {
  io: EffectIO | null;
  params: DelayParams;
  setParams: React.Dispatch<React.SetStateAction<DelayParams>>;
} {
  const [params, setParams] = useState<DelayParams>({
    ...DEFAULT_DELAY_PARAMS,
  });
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const [io, setIO] = useState<EffectIO | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const fbRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!ctx) return;

    const p = paramsRef.current;
    const input = ctx.createGain();
    const output = ctx.createGain();

    const dry = ctx.createGain();
    dry.gain.value = 1 - p.mix;

    const wet = ctx.createGain();
    wet.gain.value = p.mix;

    const delay = ctx.createDelay(2);
    delay.delayTime.value = p.delayTime;

    const fb = ctx.createGain();
    fb.gain.value = p.feedback;

    // Dry path
    input.connect(dry);
    dry.connect(output);

    // Wet path with feedback
    input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(output);

    delayRef.current = delay;
    fbRef.current = fb;
    dryRef.current = dry;
    wetRef.current = wet;

    queueMicrotask(() => setIO({ input, output }));

    return () => {
      input.disconnect();
      output.disconnect();
      dry.disconnect();
      wet.disconnect();
      delay.disconnect();
      fb.disconnect();
    };
  }, [ctx]);

  // Live-update params with smoothing to prevent zipper noise
  useEffect(() => {
    if (delayRef.current && ctx) {
      setParamSmoothly(delayRef.current.delayTime, params.delayTime, ctx);
    }
  }, [params.delayTime, ctx]);

  useEffect(() => {
    if (fbRef.current && ctx) {
      setParamSmoothly(fbRef.current.gain, params.feedback, ctx);
    }
  }, [params.feedback, ctx]);

  useEffect(() => {
    if (dryRef.current && wetRef.current && ctx) {
      setParamSmoothly(dryRef.current.gain, 1 - params.mix, ctx);
      setParamSmoothly(wetRef.current.gain, params.mix, ctx);
    }
  }, [params.mix, ctx]);

  return { io, params, setParams };
}
