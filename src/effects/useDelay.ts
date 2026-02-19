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

export interface DelayParams {
    delayTime: number; // seconds (0–1)
    feedback: number;  // 0–0.95
    mix: number;       // 0–1 (0 = dry, 1 = wet)
}

export const DEFAULT_DELAY_PARAMS: DelayParams = {
    delayTime: 0.35,
    feedback: 0.45,
    mix: 0.5,
};

export interface EffectIO {
    input: GainNode;
    output: GainNode;
}

export function useDelay(ctx: AudioContext | null): {
    io: EffectIO | null;
    params: DelayParams;
    setParams: React.Dispatch<React.SetStateAction<DelayParams>>;
} {
    const [params, setParams] = useState<DelayParams>({ ...DEFAULT_DELAY_PARAMS });
    const paramsRef = useRef(params);
    useEffect(() => { paramsRef.current = params; }, [params]);

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

    // Live-update params
    useEffect(() => {
        if (delayRef.current) delayRef.current.delayTime.value = params.delayTime;
    }, [params.delayTime]);

    useEffect(() => {
        if (fbRef.current) fbRef.current.gain.value = params.feedback;
    }, [params.feedback]);

    useEffect(() => {
        if (dryRef.current) dryRef.current.gain.value = 1 - params.mix;
        if (wetRef.current) wetRef.current.gain.value = params.mix;
    }, [params.mix]);

    return { io, params, setParams };
}
