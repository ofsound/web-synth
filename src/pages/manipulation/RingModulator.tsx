import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

type CarrierWaveform = "sine" | "square" | "triangle";

export default function RingModulator() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [carrierFreq, setCarrierFreq] = useState(300);
  const [carrierWaveform, setCarrierWaveform] =
    useState<CarrierWaveform>("sine");
  const [mix, setMix] = useState(0.8);

  const inputRef = useRef<GainNode | null>(null);
  const ringGainRef = useRef<GainNode | null>(null);
  const carrierRef = useRef<OscillatorNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /*
   * Ring modulation: multiply signal by carrier.
   *
   * Graph:
   *  source → input → ringGain ─→ wet ─┬─→ analyser → masterGain
   *                   ↑                 │
   *  carrier osc ─────┘ (.gain)         │
   *  source → input → dry ─────────────┘
   *
   * The carrier oscillator connects to ringGain.gain, performing
   * audio-rate amplitude modulation (ring modulation).
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    input.gain.value = 1;

    // Ring modulation gain — carrier signal drives this gain's .gain param
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0; // carrier will modulate around 0

    const carrier = ctx.createOscillator();
    carrier.type = carrierWaveform;
    carrier.frequency.value = carrierFreq;

    const dry = ctx.createGain();
    dry.gain.value = 1 - mix;

    const wet = ctx.createGain();
    wet.gain.value = mix;

    const merger = ctx.createGain();
    merger.gain.value = 1;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    // Wet path: input → ringGain → wet → merger
    input.connect(ringGain);
    carrier.connect(ringGain.gain);
    ringGain.connect(wet);
    wet.connect(merger);

    // Dry path: input → dry → merger
    input.connect(dry);
    dry.connect(merger);

    merger.connect(an);
    an.connect(masterGain);

    carrier.start();

    inputRef.current = input;
    ringGainRef.current = ringGain;
    carrierRef.current = carrier;
    dryRef.current = dry;
    wetRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      carrier.stop();
      carrier.disconnect();
      input.disconnect();
      ringGain.disconnect();
      dry.disconnect();
      wet.disconnect();
      merger.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (carrierRef.current) carrierRef.current.frequency.value = carrierFreq;
  }, [carrierFreq]);

  useEffect(() => {
    if (carrierRef.current) carrierRef.current.type = carrierWaveform;
  }, [carrierWaveform]);

  useEffect(() => {
    if (dryRef.current) dryRef.current.gain.value = 1 - mix;
    if (wetRef.current) wetRef.current.gain.value = mix;
  }, [mix]);

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

  const waveforms: CarrierWaveform[] = ["sine", "square", "triangle"];

  return (
    <DemoShell
      title="Ring Modulator"
      description="Ring modulation multiplies the input signal by a carrier oscillator, producing sum and difference frequencies for metallic, inharmonic tones. Adjust carrier frequency and waveform to shape the effect."
      nodes={[
        "OscillatorNode (carrier)",
        "GainNode (ring mod)",
        "GainNode (dry/wet)",
      ]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Carrier Freq"
        min={20}
        max={2000}
        step={1}
        value={carrierFreq}
        onChange={setCarrierFreq}
        unit="Hz"
      />

      {/* Carrier waveform selector */}
      <div className="flex items-center gap-2">
        <span className="text-text-muted text-xs">Carrier wave:</span>
        {waveforms.map((w) => (
          <button
            key={w}
            onClick={() => setCarrierWaveform(w)}
            className={`rounded border px-3 py-1 text-[11px] capitalize ${
              carrierWaveform === w
                ? "border-accent text-accent"
                : "border-border text-text-muted"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <Slider
        label="Mix"
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
