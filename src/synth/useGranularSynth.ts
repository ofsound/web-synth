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
 */

import { useEffect, useRef, useState } from "react";
import { midiToFreq } from "../utils/midiUtils";
import type { ADSRParams } from "./ADSREnvelope";
import { DEFAULT_AMP_ADSR } from "./ADSREnvelope";
import type { MidiBus } from "../midi/MidiBus";

const MAX_GRANULAR_VOICES = 8;

interface GranularVoice {
  voiceGain: GainNode;
  timerId: ReturnType<typeof setTimeout> | null;
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

function hanningWindow(length: number): Float32Array {
  const win = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return win;
}

async function createSourceBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const duration = 2;
  const offline = new OfflineAudioContext(
    1,
    ctx.sampleRate * duration,
    ctx.sampleRate,
  );
  const osc = offline.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 220;
  osc.connect(offline.destination);
  osc.start();
  osc.stop(duration);
  return offline.startRendering();
}

const BASE_FREQ = 220;

function velocityToGain(velocity: number): number {
  return velocity / 127;
}

export function useGranularSynth(ctx: AudioContext | null, midiBus: MidiBus) {
  const [params, setParams] = useState<GranularSynthParams>({
    ...DEFAULT_GRANULAR_PARAMS,
  });
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const outputRef = useRef<GainNode | null>(null);
  const [outputNode, setOutputNode] = useState<GainNode | null>(null);
  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const voicesRef = useRef<Map<number, GranularVoice>>(new Map());
  const cleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = paramsRef.current.gain;
    outputRef.current = out;
    queueMicrotask(() => setOutputNode(out));

    createSourceBuffer(ctx).then((buf) => {
      sourceBufferRef.current = buf;
    });

    return () => {
      out.disconnect();
    };
  }, [ctx]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.gain.value = params.gain;
    }
  }, [params.gain]);

  const spawnGrain = (voiceGain: GainNode, playbackRate: number) => {
    if (!ctx || !sourceBufferRef.current) return;
    const p = paramsRef.current;
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

  const scheduleNextGrain = (
    voiceGain: GainNode,
    playbackRate: number,
    voice: GranularVoice,
  ) => {
    if (voice.timerId === null) return;

    const p = paramsRef.current;
    const intervalMs = 1000 / p.density;

    spawnGrain(voiceGain, playbackRate);

    voice.timerId = setTimeout(() => {
      scheduleNextGrain(voiceGain, playbackRate, voice);
    }, intervalMs);
  };

  const startVoice = (note: number, velocity: number) => {
    if (!ctx || !outputRef.current || !sourceBufferRef.current) return;
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

    const p = paramsRef.current;
    const freq = midiToFreq(note);
    const playbackRate = freq / BASE_FREQ;
    const velGain = velocityToGain(velocity);

    const voiceGain = ctx.createGain();
    const now = ctx.currentTime;

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
      timerId: 0,
      note,
    };

    voicesRef.current.set(note, voice);
    setActiveNotes(new Set(voicesRef.current.keys()));

    scheduleNextGrain(voiceGain, playbackRate, voice);
  };

  const stopVoice = (note: number) => {
    if (!ctx) return;
    const voice = voicesRef.current.get(note);
    if (!voice) return;

    if (voice.timerId !== null) {
      clearTimeout(voice.timerId);
      voice.timerId = null;
    }

    const p = paramsRef.current;
    const now = ctx.currentTime;
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
    setActiveNotes(new Set(voicesRef.current.keys()));
  };

  const killVoice = (note: number) => {
    const voice = voicesRef.current.get(note);
    if (!voice) return;
    if (voice.timerId !== null) {
      clearTimeout(voice.timerId);
    }
    voice.voiceGain.disconnect();
    voicesRef.current.delete(note);
  };

  useEffect(() => {
    if (!ctx) return;
    const voices = voicesRef.current;

    const unsub = midiBus.subscribe((e) => {
      if (!paramsRef.current.enabled) return;

      if (e.type === "noteon" && e.velocity > 0) {
        startVoice(e.note, e.velocity);
      } else if (
        e.type === "noteoff" ||
        (e.type === "noteon" && e.velocity === 0)
      ) {
        stopVoice(e.note);
      }
    });

    return () => {
      unsub();
      for (const [note] of voices) {
        killVoice(note);
      }
      voices.clear();
      // Clean up any pending disconnect timers
      for (const tid of cleanupTimersRef.current) {
        clearTimeout(tid);
      }
      cleanupTimersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, midiBus]);

  return { outputNode, activeNotes, params, setParams };
}
