/**
 * Subtractive Synth Engine Hook
 *
 * Extracted from SubtractiveSynth.tsx. Headless audio hook — no UI.
 * Subscribes to the MidiBus and creates polyphonic subtractive voices.
 *
 * Audio graph per voice:
 *   osc(type) → filter(lowpass) → vca → outputGain
 *
 * Dual ADSR: amplitude envelope on vca.gain, filter envelope on filter.frequency.
 */

import { useEffect, useRef, useState } from "react";
import { midiToFreq } from "../utils/midiUtils";
import { VoiceManager } from "./VoiceManager";
import {
    applyAttack,
    applyRelease,
    type ADSRParams,
    DEFAULT_AMP_ADSR,
} from "./ADSREnvelope";
import type { MidiBus } from "../midi/MidiBus";

interface SubVoice {
    osc: OscillatorNode;
    filter: BiquadFilterNode;
    vca: GainNode;
}

export interface SubtractiveSynthParams {
    oscType: OscillatorType;
    cutoff: number;       // Hz
    resonance: number;    // Q
    filterEnvAmt: number; // Hz offset
    ampEnv: ADSRParams;
    filterEnv: ADSRParams;
    gain: number;
    enabled: boolean;
}

export const DEFAULT_SUB_PARAMS: SubtractiveSynthParams = {
    oscType: "sawtooth",
    cutoff: 2000,
    resonance: 4,
    filterEnvAmt: 3000,
    ampEnv: { ...DEFAULT_AMP_ADSR },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3 },
    gain: 0.8,
    enabled: true,
};

export function useSubtractiveSynth(
    ctx: AudioContext | null,
    midiBus: MidiBus,
) {
    const [params, setParams] = useState<SubtractiveSynthParams>({ ...DEFAULT_SUB_PARAMS });
    const paramsRef = useRef(params);
    useEffect(() => { paramsRef.current = params; }, [params]);

    const outputRef = useRef<GainNode | null>(null);
    const [outputNode, setOutputNode] = useState<GainNode | null>(null);
    const vmRef = useRef<VoiceManager<SubVoice> | null>(null);
    const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

    // Create output gain node
    useEffect(() => {
        if (!ctx) return;
        const out = ctx.createGain();
        out.gain.value = params.gain;
        outputRef.current = out;
        setOutputNode(out);
        return () => { out.disconnect(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx]);

    useEffect(() => {
        if (outputRef.current) outputRef.current.gain.value = params.gain;
    }, [params.gain]);

    // Create VoiceManager
    useEffect(() => {
        if (!ctx || !outputRef.current) return;
        const output = outputRef.current;

        const vm = new VoiceManager<SubVoice>({
            maxVoices: 16,

            createVoice(note, _velocity, time) {
                const p = paramsRef.current;
                const freq = midiToFreq(note);

                // Oscillator
                const osc = ctx.createOscillator();
                osc.type = p.oscType;
                osc.frequency.value = freq;

                // Filter
                const filter = ctx.createBiquadFilter();
                filter.type = "lowpass";
                filter.Q.value = p.resonance;

                // Filter envelope (linear ramp for frequency)
                const baseCutoff = p.cutoff;
                filter.frequency.cancelScheduledValues(time);
                filter.frequency.setValueAtTime(baseCutoff, time);
                filter.frequency.linearRampToValueAtTime(
                    baseCutoff + p.filterEnvAmt,
                    time + Math.max(p.filterEnv.attack, 0.005),
                );
                filter.frequency.setTargetAtTime(
                    baseCutoff + p.filterEnvAmt * p.filterEnv.sustain,
                    time + p.filterEnv.attack,
                    Math.max(p.filterEnv.decay, 0.01) / 4,
                );

                // VCA with amp envelope
                const vca = ctx.createGain();
                applyAttack(vca.gain, 0.4, p.ampEnv, time, "exponential");

                // Wiring: osc → filter → vca → output
                osc.connect(filter);
                filter.connect(vca);
                vca.connect(output);

                osc.start(time);

                return { osc, filter, vca };
            },

            releaseVoice(voice, _note: number, time) {
                const p = paramsRef.current;

                // Amp release
                applyRelease(voice.vca.gain, p.ampEnv, time, "exponential");

                // Filter release — back to base cutoff
                voice.filter.frequency.cancelScheduledValues(time);
                voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, time);
                voice.filter.frequency.setTargetAtTime(
                    p.cutoff,
                    time,
                    Math.max(p.filterEnv.release, 0.01) / 4,
                );

                const stopTime = time + p.ampEnv.release + 0.3;
                voice.osc.stop(stopTime);
                voice.osc.onended = () => {
                    voice.osc.disconnect();
                    voice.filter.disconnect();
                    voice.vca.disconnect();
                };
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            killVoice(voice, _note: number) {
                try { voice.osc.stop(); } catch { /* ok */ }
                voice.osc.disconnect();
                voice.filter.disconnect();
                voice.vca.disconnect();
            },
        });

        vmRef.current = vm;
        return () => { vm.allNotesOff(); };
    }, [ctx]);

    // Subscribe to MIDI bus
    useEffect(() => {
        if (!ctx || !vmRef.current) return;

        const unsub = midiBus.subscribe((e) => {
            if (!paramsRef.current.enabled) return;
            const vm = vmRef.current!;
            const time = ctx.currentTime;

            if (e.type === "noteon" && e.velocity > 0) {
                vm.noteOn(e.note, e.velocity, time);
                setActiveNotes(vm.activeNotes);
            } else if (e.type === "noteoff" || (e.type === "noteon" && e.velocity === 0)) {
                vm.noteOff(e.note, time);
                setActiveNotes(vm.activeNotes);
            }
        });

        return unsub;
    }, [ctx, midiBus]);

    return { outputNode, activeNotes, params, setParams };
}
