/**
 * Master output chain hook.
 *
 * Audio graph:
 *   synthMix (GainNode — sums 3 synth outputs)
 *     → effectsInput (provided to effects rack)
 *     → effectsReturn (comes back from effects rack)
 *       → masterGain (user-controllable volume)
 *         → analyserL / analyserR (for VU metering via ChannelSplitter)
 *         → limiter (DynamicsCompressorNode — safety)
 *           → ctx.destination
 *
 * The synth outputs connect into synthMix externally.
 * The effects rack sits between effectsInput and effectsReturn.
 */

import { useEffect, useRef, useState } from "react";

export interface MasterOutputNodes {
    /** Connect synth outputs here. */
    synthMix: GainNode;
    /** Feed into effects rack input. */
    effectsSend: GainNode;
    /** Connect effects rack output here. */
    effectsReturn: GainNode;
    /** User-controllable master gain. */
    masterGain: GainNode;
    /** Left channel analyser for VU meter. */
    analyserL: AnalyserNode;
    /** Right channel analyser for VU meter. */
    analyserR: AnalyserNode;
}

export function useMasterOutput(ctx: AudioContext | null) {
    const [nodes, setNodes] = useState<MasterOutputNodes | null>(null);
    const [masterVolume, setMasterVolume] = useState(0.8);
    const nodesRef = useRef<MasterOutputNodes | null>(null);

    useEffect(() => {
        if (!ctx) return;

        // Synth mix bus — all 3 synths connect here
        const synthMix = ctx.createGain();
        synthMix.gain.value = 1;

        // Effects send/return — effects rack patches between these
        const effectsSend = ctx.createGain();
        effectsSend.gain.value = 1;
        const effectsReturn = ctx.createGain();
        effectsReturn.gain.value = 1;

        // Master gain (user volume control)
        const masterGain = ctx.createGain();
        masterGain.gain.value = masterVolume;

        // Channel splitter for stereo VU metering
        const splitter = ctx.createChannelSplitter(2);

        // Analysers for L and R
        const analyserL = ctx.createAnalyser();
        analyserL.fftSize = 1024;
        analyserL.smoothingTimeConstant = 0.8;
        const analyserR = ctx.createAnalyser();
        analyserR.fftSize = 1024;
        analyserR.smoothingTimeConstant = 0.8;

        // Safety limiter
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 6;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;

        // Wire: synthMix → effectsSend → [effects rack patches here] → effectsReturn → masterGain
        synthMix.connect(effectsSend);
        // Default: direct bypass (effectsSend → effectsReturn)
        effectsSend.connect(effectsReturn);
        effectsReturn.connect(masterGain);

        // Wire: masterGain → splitter → analysers
        masterGain.connect(splitter);
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);

        // Wire: masterGain → limiter → destination
        masterGain.connect(limiter);
        limiter.connect(ctx.destination);

        const n: MasterOutputNodes = {
            synthMix,
            effectsSend,
            effectsReturn,
            masterGain,
            analyserL,
            analyserR,
        };

        nodesRef.current = n;
        setNodes(n);

        return () => {
            synthMix.disconnect();
            effectsSend.disconnect();
            effectsReturn.disconnect();
            masterGain.disconnect();
            splitter.disconnect();
            analyserL.disconnect();
            analyserR.disconnect();
            limiter.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx]);

    // Update master gain when volume changes
    useEffect(() => {
        if (nodesRef.current) {
            nodesRef.current.masterGain.gain.value = masterVolume;
        }
    }, [masterVolume]);

    return { nodes, masterVolume, setMasterVolume };
}
