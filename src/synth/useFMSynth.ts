/**
 * FM Synth Engine Hook (2-Operator)
 *
 * Extracted from FMSynth2Op.tsx. Headless audio hook — no UI.
 * Subscribes to the MidiBus and creates polyphonic FM voices.
 *
 * Audio graph per voice:
 *   modulator(sine) → modGain → carrier.frequency
 *   carrier(type)   → vca     → outputGain
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

interface FMVoice {
    carrier: OscillatorNode;
    modulator: OscillatorNode;
    modGain: GainNode;
    vca: GainNode;
}

export interface FMSynthParams {
    carrierRatio: number;
    modRatio: number;
    modIndex: number;
    carrierType: OscillatorType;
    ampEnv: ADSRParams;
    modEnv: Omit<ADSRParams, "release">; // mod envelope shares amp release
    gain: number;
    enabled: boolean;
}

export const DEFAULT_FM_PARAMS: FMSynthParams = {
    carrierRatio: 1,
    modRatio: 2,
    modIndex: 200,
    carrierType: "sine",
    ampEnv: { ...DEFAULT_AMP_ADSR },
    modEnv: { attack: 0.01, decay: 0.5, sustain: 0.3 },
    gain: 0.8,
    enabled: true,
};

/**
 * Headless FM synthesizer hook.
 *
 * @returns { outputNode, activeNotes, params, setParams }
 * - outputNode should be connected to the synth mixer / effects input.
 */
export function useFMSynth(
    ctx: AudioContext | null,
    midiBus: MidiBus,
) {
    const [params, setParams] = useState<FMSynthParams>({ ...DEFAULT_FM_PARAMS });
    const paramsRef = useRef(params);
    useEffect(() => { paramsRef.current = params; }, [params]);

    const outputRef = useRef<GainNode | null>(null);
    const [outputNode, setOutputNode] = useState<GainNode | null>(null);
    const vmRef = useRef<VoiceManager<FMVoice> | null>(null);
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

    // Update gain when param changes
    useEffect(() => {
        if (outputRef.current) outputRef.current.gain.value = params.gain;
    }, [params.gain]);

    // Create VoiceManager
    useEffect(() => {
        if (!ctx || !outputRef.current) return;
        const output = outputRef.current;

        const vm = new VoiceManager<FMVoice>({
            maxVoices: 16,

            createVoice(note, _velocity, time) {
                const p = paramsRef.current;
                const baseFreq = midiToFreq(note);

                // Modulator
                const modulator = ctx.createOscillator();
                modulator.type = "sine";
                modulator.frequency.value = baseFreq * p.modRatio;

                // Mod depth gain
                const modGain = ctx.createGain();
                applyAttack(
                    modGain.gain,
                    p.modIndex,
                    { attack: p.modEnv.attack, decay: p.modEnv.decay, sustain: p.modEnv.sustain, release: p.ampEnv.release },
                    time,
                    "exponential",
                );

                // Carrier
                const carrier = ctx.createOscillator();
                carrier.type = p.carrierType;
                carrier.frequency.value = baseFreq * p.carrierRatio;

                // VCA
                const vca = ctx.createGain();
                applyAttack(vca.gain, 0.3, p.ampEnv, time, "exponential");

                // Wiring: mod → modGain → carrier.frequency; carrier → vca → output
                modulator.connect(modGain);
                modGain.connect(carrier.frequency);
                carrier.connect(vca);
                vca.connect(output);

                modulator.start(time);
                carrier.start(time);

                return { carrier, modulator, modGain, vca };
            },

            releaseVoice(voice, _note: number, time) {
                const p = paramsRef.current;
                applyRelease(voice.vca.gain, p.ampEnv, time, "exponential");
                applyRelease(
                    voice.modGain.gain,
                    { ...p.ampEnv }, // use same release time
                    time,
                    "exponential",
                );
                const stopTime = time + p.ampEnv.release + 0.3;
                voice.carrier.stop(stopTime);
                voice.modulator.stop(stopTime);
                voice.carrier.onended = () => {
                    voice.carrier.disconnect();
                    voice.modulator.disconnect();
                    voice.modGain.disconnect();
                    voice.vca.disconnect();
                };
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            killVoice(voice, _note: number) {
                try { voice.carrier.stop(); } catch { /* ok */ }
                try { voice.modulator.stop(); } catch { /* ok */ }
                voice.carrier.disconnect();
                voice.modulator.disconnect();
                voice.modGain.disconnect();
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
