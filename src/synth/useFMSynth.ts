/**
 * FM Synth Engine Hook (2-Operator)
 *
 * Headless audio hook — no UI.
 * Subscribes to the MidiBus and creates polyphonic FM voices.
 *
 * Audio graph per voice:
 *   modulator(sine) → modGain → carrier.frequency
 *   carrier(type)   → vca     → outputGain
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
  modEnv: Omit<ADSRParams, "release">;
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

export function useFMSynth(ctx: AudioContext | null, midiBus: MidiBus) {
  const callbacks = useMemo(
    () =>
      (
        audioCtx: AudioContext,
        output: GainNode,
        getParams: () => FMSynthParams,
      ) => ({
        createVoice(note: number, velocity: number, time: number): FMVoice {
          const p = getParams();
          const baseFreq = midiToFreq(note);
          const velGain = velocityToGain(velocity);

          const modulator = audioCtx.createOscillator();
          modulator.type = "sine";
          modulator.frequency.value = baseFreq * p.modRatio;

          const modGain = audioCtx.createGain();
          // Clamp modIndex to avoid exponentialRamp(0) RangeError
          const safeModIndex = Math.max(p.modIndex, 0.001);
          applyAttack(
            modGain.gain,
            safeModIndex,
            {
              attack: p.modEnv.attack,
              decay: p.modEnv.decay,
              sustain: p.modEnv.sustain,
              release: p.ampEnv.release,
            },
            time,
            "exponential",
          );

          const carrier = audioCtx.createOscillator();
          carrier.type = p.carrierType;
          carrier.frequency.value = baseFreq * p.carrierRatio;

          const vca = audioCtx.createGain();
          const peakGain = 0.3 * velGain;
          applyAttack(vca.gain, peakGain, p.ampEnv, time, "exponential");

          modulator.connect(modGain);
          modGain.connect(carrier.frequency);
          carrier.connect(vca);
          vca.connect(output);

          modulator.start(time);
          carrier.start(time);

          return { carrier, modulator, modGain, vca };
        },

        releaseVoice(voice: FMVoice, _note: number, time: number) {
          const p = getParams();
          applyRelease(voice.vca.gain, p.ampEnv, time, "exponential");
          applyRelease(
            voice.modGain.gain,
            { ...p.ampEnv },
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
        killVoice(voice: FMVoice, _note: number) {
          try {
            voice.carrier.stop();
          } catch {
            /* ok */
          }
          try {
            voice.modulator.stop();
          } catch {
            /* ok */
          }
          voice.carrier.disconnect();
          voice.modulator.disconnect();
          voice.modGain.disconnect();
          voice.vca.disconnect();
        },
      }),
    [],
  );

  return useSynthBase({
    ctx,
    midiBus,
    defaultParams: DEFAULT_FM_PARAMS,
    maxVoices: 16,
    callbacks,
  });
}
