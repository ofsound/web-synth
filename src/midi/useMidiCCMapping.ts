/**
 * MIDI CC → Synth / Effect Parameter mapping.
 *
 * Subscribes to the MidiBus for CC events and routes the normalised
 * 0..1 value into the appropriate synth or effect parameter setter.
 *
 * The user-facing mapping is a simple array of { cc, target } entries
 * stored in React state. Each `target` is a dot-path into one of the
 * param objects (e.g. "fm.modIndex", "delay.mix", "master.volume").
 *
 * A "CC Learn" mode is supported: the next incoming CC number is
 * automatically captured and paired with a chosen target.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MidiBus } from "../midi/MidiBus";
import type { MidiEvent } from "../types/midi";

/* ── Public types ── */

export interface CCMapping {
    /** MIDI CC number (0-127) */
    cc: number;
    /** Dot-path target, e.g. "fm.modIndex", "delay.mix", "master.volume" */
    target: string;
    /** Human-readable label for the target */
    label: string;
    /** Min value to map CC 0 to */
    min: number;
    /** Max value to map CC 127 to */
    max: number;
}

/** Pre-defined targets with their ranges and descriptive labels. */
export const CC_TARGETS: Record<string, { label: string; min: number; max: number }> = {
    // FM Synth
    "fm.modIndex": { label: "FM Mod Index", min: 0, max: 2000 },
    "fm.modRatio": { label: "FM Mod Ratio", min: 0.5, max: 16 },
    "fm.carrierRatio": { label: "FM Carrier Ratio", min: 0.5, max: 8 },
    "fm.gain": { label: "FM Gain", min: 0, max: 1 },
    // Subtractive Synth
    "sub.filterFreq": { label: "Sub Filter Freq", min: 20, max: 18000 },
    "sub.filterQ": { label: "Sub Filter Q", min: 0.5, max: 25 },
    "sub.gain": { label: "Sub Gain", min: 0, max: 1 },
    // Granular Synth
    "gran.grainSize": { label: "Gran Grain Size", min: 0.01, max: 0.5 },
    "gran.density": { label: "Gran Density", min: 1, max: 40 },
    "gran.gain": { label: "Gran Gain", min: 0, max: 1 },
    // Delay
    "delay.delayTime": { label: "Delay Time", min: 0.01, max: 2 },
    "delay.feedback": { label: "Delay Feedback", min: 0, max: 0.95 },
    "delay.mix": { label: "Delay Mix", min: 0, max: 1 },
    // Phaser
    "phaser.rate": { label: "Phaser Rate", min: 0.1, max: 10 },
    "phaser.depth": { label: "Phaser Depth", min: 0, max: 1 },
    "phaser.mix": { label: "Phaser Mix", min: 0, max: 1 },
    // Bitcrusher
    "bitcrusher.bitDepth": { label: "Bitcrusher Depth", min: 1, max: 16 },
    "bitcrusher.sampleRate": { label: "Bitcrusher Rate", min: 500, max: 44100 },
    "bitcrusher.mix": { label: "Bitcrusher Mix", min: 0, max: 1 },
    // Master
    "master.volume": { label: "Master Volume", min: 0, max: 1 },
};

/* ── Setter Map type ── */

/** A generic updater that accepts a function mapping previous state → next state.
 *  Uses `any` internally so concrete param interfaces don't need index signatures. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamSetter = React.Dispatch<React.SetStateAction<any>>;

export interface CCMappingSetters {
    setFmParams: ParamSetter;
    setSubParams: ParamSetter;
    setGranParams: ParamSetter;
    setDelayParams: ParamSetter;
    setPhaserParams: ParamSetter;
    setBitcrusherParams: ParamSetter;
    setMasterVolume: (v: number) => void;
}

/** Map a 0-127 CC value to a [min, max] range. */
function ccToRange(ccValue: number, min: number, max: number): number {
    return min + (ccValue / 127) * (max - min);
}

/* ── Hook ── */

export interface UseMidiCCMappingResult {
    /** Current mapping list. */
    mappings: CCMapping[];
    /** Add a mapping. If a mapping for the same CC already exists it is replaced. */
    addMapping: (mapping: CCMapping) => void;
    /** Remove a mapping by CC number. */
    removeMapping: (cc: number) => void;
    /** Whether CC Learn mode is active. */
    learning: boolean;
    /** The target key waiting for the next CC. `null` when not learning. */
    learnTarget: string | null;
    /** Start CC Learn for a target key. The next incoming CC will bind. */
    startLearn: (target: string) => void;
    /** Cancel learn mode. */
    cancelLearn: () => void;
}

export function useMidiCCMapping(
    midiBus: MidiBus | null,
    setters: CCMappingSetters,
): UseMidiCCMappingResult {
    const [mappings, setMappings] = useState<CCMapping[]>([]);
    const [learnTarget, setLearnTarget] = useState<string | null>(null);

    const settersRef = useRef(setters);
    useEffect(() => { settersRef.current = setters; }, [setters]);

    const mappingsRef = useRef(mappings);
    useEffect(() => { mappingsRef.current = mappings; }, [mappings]);

    const learnTargetRef = useRef(learnTarget);
    useEffect(() => { learnTargetRef.current = learnTarget; }, [learnTarget]);

    const addMapping = useCallback((mapping: CCMapping) => {
        setMappings((prev) => {
            const filtered = prev.filter((m) => m.cc !== mapping.cc);
            return [...filtered, mapping];
        });
    }, []);

    const removeMapping = useCallback((cc: number) => {
        setMappings((prev) => prev.filter((m) => m.cc !== cc));
    }, []);

    const startLearn = useCallback((target: string) => {
        setLearnTarget(target);
    }, []);

    const cancelLearn = useCallback(() => {
        setLearnTarget(null);
    }, []);

    // Apply a CC value to the correct setter
    const applyCC = useCallback((target: string, ccValue: number) => {
        const s = settersRef.current;
        const info = CC_TARGETS[target];
        if (!info) return;
        const value = ccToRange(ccValue, info.min, info.max);

        const [group, param] = target.split(".");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updater = (prev: any) => ({ ...prev, [param]: value });
        switch (group) {
            case "fm": s.setFmParams(updater); break;
            case "sub": s.setSubParams(updater); break;
            case "gran": s.setGranParams(updater); break;
            case "delay": s.setDelayParams(updater); break;
            case "phaser": s.setPhaserParams(updater); break;
            case "bitcrusher": s.setBitcrusherParams(updater); break;
            case "master":
                if (param === "volume") s.setMasterVolume(value);
                break;
        }
    }, []);

    // Subscribe to MidiBus CC events
    useEffect(() => {
        if (!midiBus) return;
        const handler = (e: MidiEvent) => {
            if (e.type !== "cc") return;

            // CC Learn mode — capture the CC number
            const target = learnTargetRef.current;
            if (target) {
                const info = CC_TARGETS[target];
                if (info) {
                    setMappings((prev) => {
                        const filtered = prev.filter((m) => m.cc !== e.cc && m.target !== target);
                        return [...filtered, { cc: e.cc, target, label: info.label, min: info.min, max: info.max }];
                    });
                }
                setLearnTarget(null);
                return;
            }

            // Normal CC routing
            for (const m of mappingsRef.current) {
                if (m.cc === e.cc) {
                    applyCC(m.target, e.value);
                }
            }
        };

        const unsub = midiBus.subscribe(handler);
        return unsub;
    }, [midiBus, applyCC]);

    return {
        mappings,
        addMapping,
        removeMapping,
        learning: learnTarget !== null,
        learnTarget,
        startLearn,
        cancelLearn,
    };
}
