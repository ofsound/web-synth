import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { createNoiseBuffer } from "../../utils/noiseGenerators";

export default function DelayEcho() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [delayTime, setDelayTime] = useState(0.35);
  const [feedback, setFeedback] = useState(0.45);
  const [mix, setMix] = useState(0.5);

  const delayRef = useRef<DelayNode | null>(null);
  const feedbackRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const inputRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const paramsRef = useRef({ delayTime, feedback, mix });

  useEffect(() => {
    paramsRef.current = { delayTime, feedback, mix };
  }, [delayTime, feedback, mix]);

  /*
   * Graph:
   *  source → input → dryGain ──────────────→ analyser → masterGain
   *                 → delay → wetGain ───────↗
   *                   ↑  ↓
   *                   feedbackGain
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const p = paramsRef.current;
    const input = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1 - p.mix;
    const wet = ctx.createGain();
    wet.gain.value = p.mix;

    const delay = ctx.createDelay(2);
    delay.delayTime.value = p.delayTime;

    const fb = ctx.createGain();
    fb.gain.value = p.feedback;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // dry path
    input.connect(dry);
    dry.connect(an);

    // wet path
    input.connect(delay);
    delay.connect(fb);
    fb.connect(delay); // feedback loop
    delay.connect(wet);
    wet.connect(an);

    an.connect(masterGain);

    inputRef.current = input;
    delayRef.current = delay;
    feedbackRef.current = fb;
    dryRef.current = dry;
    wetRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      input.disconnect();
      dry.disconnect();
      wet.disconnect();
      delay.disconnect();
      fb.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Live-update params */
  useEffect(() => {
    if (delayRef.current) delayRef.current.delayTime.value = delayTime;
  }, [delayTime]);

  useEffect(() => {
    if (feedbackRef.current) feedbackRef.current.gain.value = feedback;
  }, [feedback]);

  useEffect(() => {
    if (dryRef.current) dryRef.current.gain.value = 1 - mix;
    if (wetRef.current) wetRef.current.gain.value = mix;
  }, [mix]);

  /* Play / Stop */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx) return;

    if (playing) {
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
      setPlaying(false);
      return;
    }

    const buffer = createNoiseBuffer(ctx, "pink", 4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(inputRef.current || ctx.destination);
    src.start();
    sourceRef.current = src;
    setPlaying(true);
  }, [ctx, resume, playing]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Delay / Echo"
      description="A classic delay effect using DelayNode with a feedback loop. The delayed signal is fed back into the delay line, creating repeating echoes that decay over time. Adjust the dry/wet mix to blend the original and delayed signals."
      nodes={["DelayNode", "GainNode ×4", "AnalyserNode"]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Delay Time"
        min={0}
        max={1}
        step={0.01}
        value={delayTime}
        onChange={setDelayTime}
        unit="s"
      />
      <Slider
        label="Feedback"
        min={0}
        max={0.95}
        step={0.01}
        value={feedback}
        onChange={setFeedback}
      />
      <Slider
        label="Dry / Wet"
        min={0}
        max={1}
        step={0.01}
        value={mix}
        onChange={setMix}
      />

      <Toggle
        label={playing ? "Stop" : "Play Pink Noise"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
