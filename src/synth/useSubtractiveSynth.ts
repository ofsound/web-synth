/**
 * Subtractive Synth Engine Hook
 *
 * Headless audio hook — no UI.
 * Subscribes to the MidiBus and creates polyphonic subtractive voices.
 *
 * Audio graph per voice:
 *   osc(type) → filter(lowpass) → vca → outputGain
 *
 * Dual ADSR: amplitude envelope on vca.gain, filter envelope on filter.frequency.
 */

import { useMemo } from "react";
import { midiToFreq } from "../utils/midiUtils";
import { useSynthBase, velocityToGain } from "./useSynthBase";
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
  cutoff: number;
  resonance: number;
  filterEnvAmt: number;
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
  listenChannel?: number | null,
) {
  const callbacks = useMemo(
    () =>
      (
        audioCtx: AudioContext,
        output: GainNode,
        getParams: () => SubtractiveSynthParams,
      ) => ({
        createVoice(note: number, velocity: number, time: number): SubVoice {
          const p = getParams();
          const freq = midiToFreq(note);
          const velGain = velocityToGain(velocity);

          const osc = audioCtx.createOscillator();
          osc.type = p.oscType;
          osc.frequency.value = freq;

          const filter = audioCtx.createBiquadFilter();
          filter.type = "lowpass";
          filter.Q.value = p.resonance;

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

          const vca = audioCtx.createGain();
          const peakGain = 0.4 * velGain;
          applyAttack(vca.gain, peakGain, p.ampEnv, time, "exponential");

          osc.connect(filter);
          filter.connect(vca);
          vca.connect(output);

          osc.start(time);

          return { osc, filter, vca };
        },

        releaseVoice(voice: SubVoice, _note: number, time: number) {
          const p = getParams();

          applyRelease(voice.vca.gain, p.ampEnv, time, "exponential");

          voice.filter.frequency.cancelScheduledValues(time);
          voice.filter.frequency.setValueAtTime(
            voice.filter.frequency.value,
            time,
          );
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
        killVoice(voice: SubVoice, _note: number) {
          try {
            voice.osc.stop();
          } catch {
            /* ok */
          }
          voice.osc.disconnect();
          voice.filter.disconnect();
          voice.vca.disconnect();
        },
      }),
    [],
  );

  return useSynthBase({
    ctx,
    midiBus,
    defaultParams: DEFAULT_SUB_PARAMS,
    maxVoices: 16,
    listenChannel,
    getReleaseDuration: (getParams) => getParams().ampEnv.release + 0.3,
    callbacks,
  });
}
