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
import type { EffectIO } from "./useDelay";

function makeStaircaseCurve(bits: number, samples = 8192): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(
        new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
    );
    const steps = Math.pow(2, bits);
    for (let i = 0; i < samples; i++) {
        const x = (2 * i) / (samples - 1) - 1;
        curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
}

export interface BitcrusherParams {
    bits: number; // 1–16
    mix: number;  // 0–1
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
    const [params, setParams] = useState<BitcrusherParams>({ ...DEFAULT_BITCRUSHER_PARAMS });
    const paramsRef = useRef(params);
    useEffect(() => { paramsRef.current = params; }, [params]);

    const [io, setIO] = useState<EffectIO | null>(null);
    const shaperRef = useRef<WaveShaperNode | null>(null);
    const dryRef = useRef<GainNode | null>(null);
    const wetRef = useRef<GainNode | null>(null);

    useEffect(() => {
        if (!ctx) return;

        const p = paramsRef.current;
        const input = ctx.createGain();
        const output = ctx.createGain();

        const shaper = ctx.createWaveShaper();
        shaper.curve = makeStaircaseCurve(p.bits);
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
            shaperRef.current.curve = makeStaircaseCurve(params.bits);
        }
    }, [params.bits]);

    useEffect(() => {
        if (dryRef.current) dryRef.current.gain.value = 1 - params.mix;
        if (wetRef.current) wetRef.current.gain.value = params.mix;
    }, [params.mix]);

    return { io, params, setParams };
}
