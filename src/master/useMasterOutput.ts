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
 *           → output target (provider master bus or ctx.destination fallback)
 *
 * The synth outputs connect into synthMix externally.
 * The effects rack sits between effectsInput and effectsReturn.
 */

import { useEffect, useRef, useState } from "react";
import {
  VU_METER_FFT_SIZE,
  VU_METER_SMOOTHING,
  LIMITER_THRESHOLD,
  LIMITER_KNEE,
  LIMITER_RATIO,
  LIMITER_ATTACK,
  LIMITER_RELEASE,
  DEFAULT_MASTER_VOLUME,
  PARAM_RAMP_TIME,
} from "../constants";

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

export function useMasterOutput(
  ctx: AudioContext | null,
  outputTarget: AudioNode | null = null,
) {
  const [nodes, setNodes] = useState<MasterOutputNodes | null>(null);
  const [masterVolume, setMasterVolume] = useState(DEFAULT_MASTER_VOLUME);
  const nodesRef = useRef<MasterOutputNodes | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const outputNode = outputTarget ?? ctx.destination;

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
    analyserL.fftSize = VU_METER_FFT_SIZE;
    analyserL.smoothingTimeConstant = VU_METER_SMOOTHING;
    const analyserR = ctx.createAnalyser();
    analyserR.fftSize = VU_METER_FFT_SIZE;
    analyserR.smoothingTimeConstant = VU_METER_SMOOTHING;

    // Safety limiter
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD;
    limiter.knee.value = LIMITER_KNEE;
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = LIMITER_ATTACK;
    limiter.release.value = LIMITER_RELEASE;

    // Wire: synthMix → effectsSend → [effects rack] → effectsReturn → masterGain
    synthMix.connect(effectsSend);
    // Default bypass: ensures audio flows from the very first render, before
    // useEffectRack's effect has run.  useEffectRack.fullRewire calls
    // safeDisconnect(effectsSend) before rebuilding routes, cleanly removing this.
    effectsSend.connect(effectsReturn);
    effectsReturn.connect(masterGain);

    // Wire: masterGain → limiter → output target
    masterGain.connect(limiter);
    limiter.connect(outputNode);

    // Wire: limiter → splitter → analysers (post-limiter for accurate metering)
    // Tap the signal AFTER the limiter so meters display true output levels,
    // not pre-limit peaks that the user never actually hears.
    limiter.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

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
  }, [ctx, outputTarget]);

  // Update master gain when volume changes — use ramp to avoid clicks/pops
  useEffect(() => {
    if (nodesRef.current && ctx) {
      const gain = nodesRef.current.masterGain.gain;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(masterVolume, now + PARAM_RAMP_TIME);
    }
  }, [masterVolume, ctx]);

  return { nodes, masterVolume, setMasterVolume };
}
