import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { Spectrum } from "../../components/Spectrum";

const WAVE_TYPES: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

export default function OscillatorExplorer() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [waveType, setWaveType] = useState<OscillatorType>("sine");
  const [frequency, setFrequency] = useState(440);
  const [detune, setDetune] = useState(0);
  const [gain, setGain] = useState(0.3);

  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Build static part of graph */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = gain;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    g.connect(an);
    an.connect(masterGain);
    gainRef.current = g;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));
    return () => {
      g.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Live parameter updates */
  useEffect(() => {
    if (oscRef.current) {
      oscRef.current.type = waveType;
      oscRef.current.frequency.value = frequency;
      oscRef.current.detune.value = detune;
    }
  }, [waveType, frequency, detune]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = gain;
  }, [gain]);

  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx) return;
    if (playing) {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      oscRef.current = null;
      setPlaying(false);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = waveType;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(gainRef.current || ctx.destination);
    osc.start();
    oscRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing, waveType, frequency, detune]);

  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Oscillator Explorer"
      description="Explore the 4 built-in oscillator waveforms (sine, square, sawtooth, triangle). Adjust frequency and detune in real time while observing the waveform and its harmonic spectrum."
      nodes={["OscillatorNode", "GainNode", "AnalyserNode"]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
          <Waveform analyser={analyser} height={160} />
        </div>
        <div>
          <h3 className="text-text-muted mb-1 text-xs font-medium">Spectrum</h3>
          <Spectrum analyser={analyser} height={160} barColor="rainbow" />
        </div>
      </div>

      {/* Waveform type selector */}
      <div className="flex gap-2">
        {WAVE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setWaveType(t)}
            className={`rounded-md border px-4 py-2 text-sm capitalize transition ${
              waveType === t
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface-alt text-text-muted hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Slider
        label="Frequency"
        min={20}
        max={8000}
        step={1}
        value={frequency}
        onChange={setFrequency}
        unit="Hz"
      />
      <Slider
        label="Detune"
        min={-1200}
        max={1200}
        step={1}
        value={detune}
        onChange={setDetune}
        unit="¢"
      />
      <Slider
        label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={gain}
        onChange={setGain}
      />

      <Toggle
        label={playing ? "Stop" : "Play"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
