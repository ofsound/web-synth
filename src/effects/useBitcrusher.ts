/**
 * Bitcrusher effect hook.
 *
 * Uses a WaveShaperNode with a staircase transfer curve for
 * bit-depth reduction.
 *
 * Audio graph:
 *   input ─┬─ waveshaper → wet ─┬─ output
 *          └─ dry ───────────────┘
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

// Cache for staircase curves by bit depth to avoid reallocation
const CURVE_CACHE = new Map<number, Float32Array>();

function makeStaircaseCurve(bits: number, samples = 8192): Float32Array {
  // Check cache first
  if (CURVE_CACHE.has(bits)) {
    return CURVE_CACHE.get(bits)!;
  }

  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );
  const steps = Math.pow(2, bits);
  for (let i = 0; i < samples; i++) {
    const x = (2 * i) / (samples - 1) - 1;
    curve[i] = Math.round(x * steps) / steps;
  }

  // Cache the result
  CURVE_CACHE.set(bits, curve);
  return curve;
}

export interface BitcrusherParams {
  bits: number; // 1–16
  mix: number; // 0–1
}

export const DEFAULT_BITCRUSHER_PARAMS: BitcrusherParams = {
  bits: 8,
  mix: 1,
};

export function useBitcrusher(ctx: AudioContext | null): {
  io: EffectIO | null;
  params: BitcrusherParams;
  setParams: React.Dispatch<React.SetStateAction<BitcrusherParams>>;
} {
  const [params, setParams] = useState<BitcrusherParams>({
    ...DEFAULT_BITCRUSHER_PARAMS,
  });
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const [io, setIO] = useState<EffectIO | null>(null);
  const shaperRef = useRef<WaveShaperNode>(null);
  const dryRef = useRef<GainNode>(null);
  const wetRef = useRef<GainNode>(null);

  useEffect(() => {
    if (!ctx) return;

    const p = paramsRef.current;
    const input = ctx.createGain();
    const output = ctx.createGain();

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeStaircaseCurve(
      p.bits,
    ) as unknown as Float32Array<ArrayBuffer>;
    shaper.oversample = "none";

    const dry = ctx.createGain();
    dry.gain.value = 1 - p.mix;

    const wet = ctx.createGain();
    wet.gain.value = p.mix;

    // Wet path
    input.connect(shaper);
    shaper.connect(wet);
    wet.connect(output);

    // Dry path
    input.connect(dry);
    dry.connect(output);

    shaperRef.current = shaper;
    dryRef.current = dry;
    wetRef.current = wet;

    queueMicrotask(() => setIO({ input, output }));

    return () => {
      input.disconnect();
      output.disconnect();
      shaper.disconnect();
      dry.disconnect();
      wet.disconnect();
    };
  }, [ctx]);

  useEffect(() => {
    if (shaperRef.current) {
      shaperRef.current.curve = makeStaircaseCurve(
        params.bits,
      ) as unknown as Float32Array<ArrayBuffer>;
    }
  }, [params.bits]);

  useEffect(() => {
    if (dryRef.current && wetRef.current && ctx) {
      setParamSmoothly(dryRef.current.gain, 1 - params.mix, ctx);
      setParamSmoothly(wetRef.current.gain, params.mix, ctx);
    }
  }, [params.mix, ctx]);

  return { io, params, setParams };
}
