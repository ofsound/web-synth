import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

export default function AutoWah() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [rate, setRate] = useState(3);
  const [depth, setDepth] = useState(2000);
  const [baseFreq, setBaseFreq] = useState(500);
  const [q, setQ] = useState(8);

  const inputRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Graph:
   *  source → input → bandpass → analyser → masterGain
   *  LFO → lfoGain → bandpass.frequency
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    input.gain.value = 1;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = baseFreq;
    filter.Q.value = q;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    input.connect(filter);
    filter.connect(an);
    an.connect(masterGain);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    inputRef.current = input;
    filterRef.current = filter;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      input.disconnect();
      filter.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = rate;
  }, [rate]);

  useEffect(() => {
    if (lfoGainRef.current) lfoGainRef.current.gain.value = depth;
  }, [depth]);

  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.value = baseFreq;
  }, [baseFreq]);

  useEffect(() => {
    if (filterRef.current) filterRef.current.Q.value = q;
  }, [q]);

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
    osc.frequency.value = 110;
    osc.connect(inputRef.current!);
    osc.start();
    sourceRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing]);

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
      title="Auto-Wah"
      description="Automatic wah-wah effect using an LFO to sweep the center frequency of a resonant bandpass filter. Adjust rate, depth, base frequency, and resonance (Q) to shape the wah character."
      nodes={[
        "BiquadFilterNode (bandpass)",
        "OscillatorNode (LFO)",
        "GainNode",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Rate"
        min={0.5}
        max={10}
        step={0.1}
        value={rate}
        onChange={setRate}
        unit="Hz"
      />
      <Slider
        label="Depth"
        min={0}
        max={5000}
        step={50}
        value={depth}
        onChange={setDepth}
        unit="Hz"
      />
      <Slider
        label="Base Freq"
        min={200}
        max={2000}
        step={10}
        value={baseFreq}
        onChange={setBaseFreq}
        unit="Hz"
      />
      <Slider label="Q" min={1} max={20} step={0.5} value={q} onChange={setQ} />

      <Toggle
        label={playing ? "Stop" : "Play Sawtooth 110 Hz"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
