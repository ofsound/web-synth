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
import type { MidiBus } from "../midi/MidiBus";
import type { MidiEvent } from "../types/midi";
import type { BaseSynthParams } from "../types/audio";
import { setParamSmoothly } from "../utils/audioUtils";

/**
 * Re-exported from `../types/audio` — kept here for backward compatibility.
 * Prefer importing from `../types/audio` in new code.
 */
export type { BaseSynthParams } from "../types/audio";

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
    /**
     * Optional MIDI channel filter (0-15).  When provided, the subscription
     * ignores events on all other channels.  Omit (or pass null) to receive
     * events on every channel (legacy behaviour).
     */
    listenChannel?: number | null,
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

    // Use a smooth ramp when the gain param changes to prevent clicks/pops.
    useEffect(() => {
        if (outputRef.current && ctx) {
            setParamSmoothly(outputRef.current.gain, params.gain, ctx);
        }
    }, [params.gain, ctx]);

    // ── MIDI subscription ──
    // Ref the handler so the subscription doesn't churn on every handler change.
    const onMidiRef = useRef(onMidi);
    useEffect(() => {
        onMidiRef.current = onMidi;
    }, [onMidi]);

    const listenChannelRef = useRef(listenChannel);
    useEffect(() => {
        listenChannelRef.current = listenChannel;
    }, [listenChannel]);

    useEffect(() => {
        if (!ctx) return;

        const unsub = midiBus.subscribe((e) => {
            if (!paramsRef.current.enabled) return;
            // Per-channel filter: skip events not on our assigned channel.
            const ch = listenChannelRef.current;
            if (ch !== null && ch !== undefined && e.channel !== ch) return;
            onMidiRef.current(e, ctx);
        });

        return unsub;
    }, [ctx, midiBus]);

    return { outputNode, outputRef, params, setParams, getParams };
}
