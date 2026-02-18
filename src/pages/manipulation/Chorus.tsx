import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

export default function Chorus() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [rate, setRate] = useState(1.5);
  const [depth, setDepth] = useState(7); // ms
  const [mix, setMix] = useState(0.5);

  const inputRef = useRef<GainNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input → dryGain ────────────→ analyser → masterGain
   *                 → delay → wetGain ────↗
   *
   *  LFO → lfoGain → delay.delayTime (modulation)
   *
   *  Base delay = 20ms, LFO depth modulates ±depth ms around it
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1 - mix;
    const wet = ctx.createGain();
    wet.gain.value = mix;

    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = 0.02; // 20ms base

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth / 1000; // ms → s

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // Audio path
    input.connect(dry);
    dry.connect(an);

    input.connect(delay);
    delay.connect(wet);
    wet.connect(an);

    // LFO modulation
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    an.connect(masterGain);

    inputRef.current = input;
    delayRef.current = delay;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    dryRef.current = dry;
    wetRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      try {
        lfo.stop();
      } catch {
        /* ok */
      }
      input.disconnect();
      dry.disconnect();
      wet.disconnect();
      delay.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live-update params */
  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = rate;
  }, [rate]);

  useEffect(() => {
    if (lfoGainRef.current) lfoGainRef.current.gain.value = depth / 1000;
  }, [depth]);

  useEffect(() => {
    if (dryRef.current) dryRef.current.gain.value = 1 - mix;
    if (wetRef.current) wetRef.current.gain.value = mix;
  }, [mix]);

  /* Play / Stop sawtooth */
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

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;
    osc.connect(inputRef.current || ctx.destination);
    osc.start();
    sourceRef.current = osc;
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
      title="Chorus"
      description="Chorus thickens a signal by mixing it with a slightly delayed, pitch-modulated copy. An LFO (low-frequency oscillator) modulates the delay time to create gentle pitch variations, producing a rich, shimmering effect."
      nodes={[
        "OscillatorNode (LFO)",
        "DelayNode",
        "GainNode ×3",
        "AnalyserNode",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Rate"
        min={0.1}
        max={10}
        step={0.1}
        value={rate}
        onChange={setRate}
        unit="Hz"
      />
      <Slider
        label="Depth"
        min={0}
        max={20}
        step={0.1}
        value={depth}
        onChange={setDepth}
        unit="ms"
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
        label={playing ? "Stop" : "Play Sawtooth 220 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
