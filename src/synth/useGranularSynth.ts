/**
 * MIDI-responsive Granular Synth Engine Hook
 *
 * Based on GranularSynth.tsx but redesigned for polyphonic MIDI control.
 * Each held note spawns its own grain stream at the corresponding pitch.
 * ADSR controls the grain amplitude fade-in/out per voice.
 *
 * Audio graph per voice:
 *   grains(AudioBufferSourceNode × many) → grainEnv(GainNode) → voiceGain → outputGain
 */

import { useEffect, useRef, useState } from "react";
import { midiToFreq } from "../utils/midiUtils";
import type { ADSRParams } from "./ADSREnvelope";
import { DEFAULT_AMP_ADSR } from "./ADSREnvelope";
import type { MidiBus } from "../midi/MidiBus";

/* ── Types ── */

interface GranularVoice {
    voiceGain: GainNode;
    timerId: ReturnType<typeof setInterval>;
    note: number;
    releasing: boolean;
}

export interface GranularSynthParams {
    grainSize: number;   // ms (10–200)
    density: number;     // grains/sec (1–50)
    pitchRand: number;   // randomisation amount (0–1)
    position: number;    // 0–1 position into buffer
    posRand: number;     // position randomisation (0–1)
    ampEnv: ADSRParams;
    gain: number;
    enabled: boolean;
}

export const DEFAULT_GRANULAR_PARAMS: GranularSynthParams = {
    grainSize: 60,
    density: 15,
    pitchRand: 0.05,
    position: 0.25,
    posRand: 0.1,
    ampEnv: { ...DEFAULT_AMP_ADSR, attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.5 },
    gain: 0.8,
    enabled: true,
};

/* ── Helpers ── */

/** Pre-compute a Hanning window */
function hanningWindow(length: number): Float32Array {
    const win = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    return win;
}

/** Generate a 2-second sawtooth source buffer */
async function createSourceBuffer(ctx: AudioContext): Promise<AudioBuffer> {
    const duration = 2;
    const offline = new OfflineAudioContext(1, ctx.sampleRate * duration, ctx.sampleRate);
    const osc = offline.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220; // A3 — base pitch reference
    osc.connect(offline.destination);
    osc.start();
    osc.stop(duration);
    return offline.startRendering();
}

const BASE_FREQ = 220; // frequency the source buffer was generated at

/* ── Hook ── */

export function useGranularSynth(
    ctx: AudioContext | null,
    midiBus: MidiBus,
) {
    const [params, setParams] = useState<GranularSynthParams>({ ...DEFAULT_GRANULAR_PARAMS });
    const paramsRef = useRef(params);
    useEffect(() => { paramsRef.current = params; }, [params]);

    const outputRef = useRef<GainNode | null>(null);
    const [outputNode, setOutputNode] = useState<GainNode | null>(null);
    const sourceBufferRef = useRef<AudioBuffer | null>(null);
    const voicesRef = useRef<Map<number, GranularVoice>>(new Map());
    const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

    // Create output gain + source buffer
    useEffect(() => {
        if (!ctx) return;
        const out = ctx.createGain();
        out.gain.value = params.gain;
        outputRef.current = out;
        setOutputNode(out);

        createSourceBuffer(ctx).then((buf) => {
            sourceBufferRef.current = buf;
        });

        return () => { out.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx]);

    useEffect(() => {
        if (outputRef.current) outputRef.current.gain.value = params.gain;
    }, [params.gain]);

    /** Spawn a single grain for a voice at the given playback rate. */
    const spawnGrain = (voiceGain: GainNode, playbackRate: number) => {
        if (!ctx || !sourceBufferRef.current) return;
        const p = paramsRef.current;
        const buf = sourceBufferRef.current;
        const grainDur = p.grainSize / 1000;

        // Position with randomisation
        const maxStart = Math.max(0, buf.duration - grainDur);
        let startPos = p.position * maxStart;
        startPos += (Math.random() - 0.5) * p.posRand * maxStart;
        startPos = Math.max(0, Math.min(startPos, maxStart));

        // Rate with randomisation
        let rate = playbackRate;
        rate += (Math.random() - 0.5) * 2 * p.pitchRand * playbackRate;
        rate = Math.max(0.1, rate);

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;

        const env = ctx.createGain();
        env.gain.value = 0;
        const winLen = Math.max(Math.round(grainDur * ctx.sampleRate), 4);
        const win = hanningWindow(winLen);

        src.connect(env);
        env.connect(voiceGain);

        const now = ctx.currentTime;
        try {
            env.gain.setValueCurveAtTime(win, now, grainDur);
        } catch {
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(1, now + grainDur * 0.5);
            env.gain.linearRampToValueAtTime(0, now + grainDur);
        }

        src.start(now, startPos, grainDur);
        src.stop(now + grainDur + 0.01);
        src.onended = () => {
            src.disconnect();
            env.disconnect();
        };
    };

    /** Start a grain stream for a note */
    const startVoice = (note: number) => {
        if (!ctx || !outputRef.current || !sourceBufferRef.current) return;
        if (voicesRef.current.has(note)) return;

        const p = paramsRef.current;
        const freq = midiToFreq(note);
        const playbackRate = freq / BASE_FREQ;

        // Per-voice gain for the ADSR amplitude control
        const voiceGain = ctx.createGain();
        const now = ctx.currentTime;

        // Attack envelope on voice gain
        const atk = Math.max(p.ampEnv.attack, 0.005);
        const dec = Math.max(p.ampEnv.decay, 0.01);
        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.exponentialRampToValueAtTime(1.0, now + atk);
        voiceGain.gain.setTargetAtTime(p.ampEnv.sustain, now + atk, dec / 4);

        voiceGain.connect(outputRef.current);

        // Schedule grain spawning
        const intervalMs = 1000 / p.density;
        const timerId = setInterval(() => {
            spawnGrain(voiceGain, playbackRate);
        }, intervalMs);

        // Spawn the first grain immediately
        spawnGrain(voiceGain, playbackRate);

        voicesRef.current.set(note, { voiceGain, timerId, note, releasing: false });
        setActiveNotes(new Set(voicesRef.current.keys()));
    };

    /** Release a grain voice */
    const stopVoice = (note: number) => {
        if (!ctx) return;
        const voice = voicesRef.current.get(note);
        if (!voice) return;

        // Stop spawning new grains
        clearInterval(voice.timerId);
        voice.releasing = true;

        const p = paramsRef.current;
        const now = ctx.currentTime;
        const rel = Math.max(p.ampEnv.release, 0.01);

        // Release envelope — fade out
        voice.voiceGain.gain.cancelScheduledValues(now);
        voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, now);
        voice.voiceGain.gain.setTargetAtTime(0.001, now, rel / 4);

        // Disconnect after release completes
        setTimeout(() => {
            voice.voiceGain.disconnect();
        }, (rel + 0.5) * 1000);

        voicesRef.current.delete(note);
        setActiveNotes(new Set(voicesRef.current.keys()));
    };

    /** Kill a voice immediately */
    const killVoice = (note: number) => {
        const voice = voicesRef.current.get(note);
        if (!voice) return;
        clearInterval(voice.timerId);
        voice.voiceGain.disconnect();
        voicesRef.current.delete(note);
    };

    // Subscribe to MIDI bus
    useEffect(() => {
        if (!ctx) return;

        const unsub = midiBus.subscribe((e) => {
            if (!paramsRef.current.enabled) return;

            if (e.type === "noteon" && e.velocity > 0) {
                startVoice(e.note);
            } else if (e.type === "noteoff" || (e.type === "noteon" && e.velocity === 0)) {
                stopVoice(e.note);
            }
        });

        return () => {
            unsub();
            // Cleanup all voices on unmount
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const currentVoices = voicesRef.current;
            for (const [note] of currentVoices) {
                killVoice(note);
            }
            currentVoices.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, midiBus]);

    return { outputNode, activeNotes, params, setParams };
}
