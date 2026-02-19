/**
 * MIDI-responsive Granular Synth Engine Hook
 *
 * Each held note spawns its own grain stream at the corresponding pitch.
 * ADSR controls the grain amplitude fade-in/out per voice.
 *
 * Audio graph per voice:
 *   grains(AudioBufferSourceNode × many) → grainEnv(GainNode) → voiceGain → outputGain
 *
 * Uses recursive setTimeout for timing-stable grain scheduling
 * (more accurate than setInterval under CPU load).
 *
 * Shared plumbing (params, output node, MIDI subscription) is provided
 * by `useSynthIO`; this hook adds granular-specific voice management
 * and the lookahead grain scheduler on top.
 */

import { useCallback, useEffect, useRef } from "react";
import { midiToFreq } from "../utils/midiUtils";
import type { ADSRParams } from "./ADSREnvelope";
import { DEFAULT_AMP_ADSR } from "./ADSREnvelope";
import type { MidiBus, MidiEvent } from "../midi/MidiBus";
import { velocityToGain } from "./useSynthBase";
import { useSynthIO } from "./useSynthIO";
import {
  MAX_GRANULAR_VOICES,
  MAX_WINDOW_CACHE,
  GRANULAR_BASE_FREQ,
  SOURCE_BUFFER_DURATION,
  SCHEDULER_LOOKAHEAD_MS,
  SCHEDULER_IDLE_LOOKAHEAD_MS,
  SCHEDULE_AHEAD_SECONDS,
} from "../constants";

interface GranularVoice {
  voiceGain: GainNode;
  nextGrainTime: number;
  note: number;
}

export interface GranularSynthParams {
  grainSize: number;
  density: number;
  pitchRand: number;
  position: number;
  posRand: number;
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
  ampEnv: {
    ...DEFAULT_AMP_ADSR,
    attack: 0.05,
    decay: 0.1,
    sustain: 0.8,
    release: 0.5,
  },
  gain: 0.8,
  enabled: true,
};

const WINDOW_CACHE = new Map<number, Float32Array>();

function getHanningWindow(length: number): Float32Array {
  if (WINDOW_CACHE.has(length)) {
    return WINDOW_CACHE.get(length)!;
  }
  const win = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  if (WINDOW_CACHE.size >= MAX_WINDOW_CACHE) {
    const firstKey = WINDOW_CACHE.keys().next().value!;
    WINDOW_CACHE.delete(firstKey);
  }
  WINDOW_CACHE.set(length, win);
  return win;
}

async function createSourceBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(
    1,
    ctx.sampleRate * SOURCE_BUFFER_DURATION,
    ctx.sampleRate,
  );
  const osc = offline.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = GRANULAR_BASE_FREQ;
  osc.connect(offline.destination);
  osc.start();
  osc.stop(SOURCE_BUFFER_DURATION);
  return offline.startRendering();
}

export function useGranularSynth(ctx: AudioContext | null, midiBus: MidiBus, listenChannel?: number | null) {
  const voicesRef = useRef<Map<number, GranularVoice>>(new Map());
  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const bufferReadyRef = useRef(false);
  const cleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set(),
  );

  // ── Kill / Start / Stop voice helpers ──

  const killVoice = useCallback((note: number) => {
    const voice = voicesRef.current.get(note);
    if (!voice) return;
    voice.voiceGain.disconnect();
    voicesRef.current.delete(note);
  }, []);

  const startVoiceRef = useRef<(note: number, velocity: number, audioCtx: AudioContext) => void>(
    () => { },
  );
  const stopVoiceRef = useRef<(note: number, audioCtx: AudioContext) => void>(
    () => { },
  );

  // MIDI handler — forwarded to voice start/stop via refs
  const handleMidi = useCallback((e: MidiEvent, audioCtx: AudioContext) => {
    if (e.type === "noteon" && e.velocity > 0) {
      startVoiceRef.current(e.note, e.velocity, audioCtx);
    } else if (
      e.type === "noteoff" ||
      (e.type === "noteon" && e.velocity === 0)
    ) {
      stopVoiceRef.current(e.note, audioCtx);
    }
  }, []);

  const { outputNode, outputRef, params, setParams, getParams } = useSynthIO(
    ctx,
    midiBus,
    DEFAULT_GRANULAR_PARAMS,
    handleMidi,
    listenChannel,
  );

  // ── Source buffer creation ──

  useEffect(() => {
    if (!ctx) return;
    bufferReadyRef.current = false;
    sourceBufferRef.current = null;

    createSourceBuffer(ctx).then((buf) => {
      sourceBufferRef.current = buf;
      bufferReadyRef.current = true;
    });

    return () => {
      sourceBufferRef.current = null;
      bufferReadyRef.current = false;
    };
  }, [ctx]);

  // ── Grain spawner ──

  const spawnGrain = useCallback(
    (voiceGain: GainNode, playbackRate: number, time: number) => {
      if (!ctx || !sourceBufferRef.current) return;
      const p = getParams();
      const buf = sourceBufferRef.current;
      const grainDur = p.grainSize / 1000;

      const maxStart = Math.max(0, buf.duration - grainDur);
      let startPos = p.position * maxStart;
      startPos += (Math.random() - 0.5) * p.posRand * maxStart;
      startPos = Math.max(0, Math.min(startPos, maxStart));

      let rate = playbackRate;
      rate += (Math.random() - 0.5) * 2 * p.pitchRand * playbackRate;
      rate = Math.max(0.1, rate);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;

      const env = ctx.createGain();
      env.gain.value = 0;
      const winLen = Math.max(Math.round(grainDur * ctx.sampleRate), 4);
      const win = getHanningWindow(winLen);

      src.connect(env);
      env.connect(voiceGain);

      try {
        env.gain.setValueCurveAtTime(win, time, grainDur);
      } catch {
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(1, time + grainDur * 0.5);
        env.gain.linearRampToValueAtTime(0, time + grainDur);
      }

      src.start(time, startPos, grainDur);
      src.stop(time + grainDur + 0.05);
      src.onended = () => {
        src.disconnect();
        env.disconnect();
      };
    },
    [ctx, getParams],
  );

  // ── Voice start / stop ──

  useEffect(() => {
    startVoiceRef.current = (note: number, velocity: number, audioCtx: AudioContext) => {
      if (!outputRef.current || !sourceBufferRef.current) return;
      // Re-trigger: kill existing voice for this note
      if (voicesRef.current.has(note)) {
        killVoice(note);
      }

      // Voice stealing: if at max capacity, kill the oldest voice
      if (voicesRef.current.size >= MAX_GRANULAR_VOICES) {
        const oldest = voicesRef.current.keys().next().value;
        if (oldest !== undefined) {
          killVoice(oldest);
        }
      }

      const p = getParams();
      const velGain = velocityToGain(velocity);

      const voiceGain = audioCtx.createGain();
      const now = audioCtx.currentTime;

      const atk = Math.max(p.ampEnv.attack, 0.005);
      const dec = Math.max(p.ampEnv.decay, 0.01);
      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.setValueAtTime(0.001, now);
      voiceGain.gain.exponentialRampToValueAtTime(1.0 * velGain, now + atk);
      voiceGain.gain.setTargetAtTime(
        p.ampEnv.sustain * velGain,
        now + atk,
        dec / 4,
      );

      voiceGain.connect(outputRef.current);

      const voice: GranularVoice = {
        voiceGain,
        nextGrainTime: now,
        note,
      };

      voicesRef.current.set(note, voice);
    };

    stopVoiceRef.current = (note: number, audioCtx: AudioContext) => {
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      const p = getParams();
      const now = audioCtx.currentTime;
      const rel = Math.max(p.ampEnv.release, 0.01);

      voice.voiceGain.gain.cancelScheduledValues(now);
      voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, now);
      voice.voiceGain.gain.setTargetAtTime(0.001, now, rel / 4);

      const disconnectTimer = setTimeout(
        () => {
          voice.voiceGain.disconnect();
          cleanupTimersRef.current.delete(disconnectTimer);
        },
        (rel + 0.5) * 1000,
      );
      cleanupTimersRef.current.add(disconnectTimer);

      voicesRef.current.delete(note);
    };
  }, [killVoice, getParams, outputRef]);

  // ── Kill all voices when disabled ──

  useEffect(() => {
    if (params.enabled) return;
    const notesToKill = [...voicesRef.current.keys()];
    for (const note of notesToKill) {
      killVoice(note);
    }
  }, [params.enabled, killVoice]);

  // ── Lookahead scheduler loop ──

  const schedulerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctx || !bufferReadyRef.current) {
      // Re-check when source buffer becomes ready
      // (bufferReadyRef is sync; the effect re-runs on ctx change)
    }
    if (!ctx) return;
    const voicesAtMount = voicesRef.current;
    const cleanupTimersAtMount = cleanupTimersRef.current;

    // Wait for buffer — poll briefly since buffer creation is async
    let cancelled = false;
    const waitForBuffer = () => {
      if (cancelled) return;
      if (!bufferReadyRef.current) {
        setTimeout(waitForBuffer, 50);
        return;
      }
      startScheduler();
    };

    const startScheduler = () => {
      const schedule = () => {
        if (cancelled) return;
        const voices = voicesRef.current;
        const p = getParams();

        if (!p.enabled || voices.size === 0) {
          schedulerTimerRef.current = setTimeout(
            schedule,
            SCHEDULER_IDLE_LOOKAHEAD_MS,
          );
          return;
        }

        const now = ctx.currentTime;
        const interval = 1 / Math.max(p.density, 1);

        for (const voice of voices.values()) {
          while (voice.nextGrainTime < now + SCHEDULE_AHEAD_SECONDS) {
            const freq = midiToFreq(voice.note);
            const playbackRate = freq / GRANULAR_BASE_FREQ;
            spawnGrain(voice.voiceGain, playbackRate, voice.nextGrainTime);
            voice.nextGrainTime += interval;
          }
        }
        schedulerTimerRef.current = setTimeout(schedule, SCHEDULER_LOOKAHEAD_MS);
      };

      schedulerTimerRef.current = setTimeout(schedule, SCHEDULER_LOOKAHEAD_MS);
    };

    waitForBuffer();

    return () => {
      cancelled = true;
      if (schedulerTimerRef.current !== null) {
        clearTimeout(schedulerTimerRef.current);
        schedulerTimerRef.current = null;
      }
      // Kill all voices and clear release timers
      const notesToKill = [...voicesAtMount.keys()];
      for (const note of notesToKill) {
        killVoice(note);
      }
      voicesAtMount.clear();
      for (const tid of cleanupTimersAtMount) {
        clearTimeout(tid);
      }
      cleanupTimersAtMount.clear();
    };
  }, [ctx, spawnGrain, killVoice, getParams]);

  return { outputNode, params, setParams };
}
