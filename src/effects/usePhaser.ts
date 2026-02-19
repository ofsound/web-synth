/**
 * Phaser effect hook.
 *
 * 4-stage allpass filter chain swept by an LFO, with feedback.
 *
 * Audio graph:
 *   input ──────────────────────────────→ output (dry)
 *         → allpass[0→1→2→3] → fbGain ──→ output (wet)
 *                                fbGain → allpass[0] (feedback)
 *   LFO → lfoGain[i] → allpass[i].frequency (per-stage)
 */

import { useEffect, useRef, useState } from "react";
import type { EffectIO } from "../types/audio";

/** Helper to smoothly ramp AudioParam to target value */
function setParamSmoothly(
  param: AudioParam | null,
  value: number,
  ctx: AudioContext,
  rampTime = 0.02,
) {
  if (!param) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.linearRampToValueAtTime(value, now + rampTime);
}

const NUM_STAGES = 4;
const BASE_FREQ = 1000;
const MAX_FREQ = 4000;

export interface PhaserParams {
  rate: number; // LFO Hz (0.1–5)
  depth: number; // 0–1
  feedback: number; // 0–0.9
}

export const DEFAULT_PHASER_PARAMS: PhaserParams = {
  rate: 0.5,
  depth: 0.7,
  feedback: 0.7,
};

export function usePhaser(ctx: AudioContext | null): {
  io: EffectIO | null;
  params: PhaserParams;
  setParams: React.Dispatch<React.SetStateAction<PhaserParams>>;
} {
  const [params, setParams] = useState<PhaserParams>({
    ...DEFAULT_PHASER_PARAMS,
  });
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const [io, setIO] = useState<EffectIO | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainsRef = useRef<GainNode[]>([]);
  const fbRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!ctx) return;

    const input = ctx.createGain();
    const output = ctx.createGain();

    // Allpass filter stages
    const filters: BiquadFilterNode[] = [];
    for (let i = 0; i < NUM_STAGES; i++) {
      const f = ctx.createBiquadFilter();
      f.type = "allpass";
      f.frequency.value = BASE_FREQ;
      f.Q.value = 0.5;
      filters.push(f);
    }

    // Chain
    for (let i = 0; i < NUM_STAGES - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }

    // Feedback
    const fb = ctx.createGain();
    fb.gain.value = paramsRef.current.feedback;

    // LFO
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = paramsRef.current.rate;

    // LFO gain per stage
    const lfoGains: GainNode[] = [];
    for (let i = 0; i < NUM_STAGES; i++) {
      const g = ctx.createGain();
      g.gain.value = paramsRef.current.depth * MAX_FREQ;
      lfoGains.push(g);
      lfo.connect(g);
      g.connect(filters[i].frequency);
    }

    // Dry path
    input.connect(output);

    // Wet path
    input.connect(filters[0]);
    filters[NUM_STAGES - 1].connect(fb);
    fb.connect(output);
    fb.connect(filters[0]); // feedback loop

    lfo.start();

    lfoRef.current = lfo;
    lfoGainsRef.current = lfoGains;
    fbRef.current = fb;

    queueMicrotask(() => setIO({ input, output }));

    return () => {
      try {
        lfo.stop();
      } catch {
        /* ok */
      }
      input.disconnect();
      output.disconnect();
      for (const f of filters) f.disconnect();
      fb.disconnect();
      lfo.disconnect();
      for (const g of lfoGains) g.disconnect();
    };
  }, [ctx]);

  // Live-update with smoothing to prevent zipper noise
  useEffect(() => {
    if (lfoRef.current && ctx) {
      setParamSmoothly(lfoRef.current.frequency, params.rate, ctx);
    }
  }, [params.rate, ctx]);

  useEffect(() => {
    const gains = lfoGainsRef.current;
    if (ctx) {
      for (const g of gains) {
        setParamSmoothly(g.gain, params.depth * MAX_FREQ, ctx);
      }
    }
  }, [params.depth, ctx]);

  useEffect(() => {
    if (fbRef.current && ctx) {
      setParamSmoothly(fbRef.current.gain, params.feedback, ctx);
    }
  }, [params.feedback, ctx]);

  return { io, params, setParams };
}
