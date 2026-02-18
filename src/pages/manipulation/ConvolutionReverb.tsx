import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { generatePresetIR, type IRPreset } from "../../utils/impulseResponses";

const PRESETS: IRPreset[] = ["hall", "plate", "spring", "room", "cathedral"];

export default function ConvolutionReverb() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState<IRPreset>("hall");
  const [wetMix, setWetMix] = useState(0.5);

  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const wetMixRef = useRef(wetMix);

  useEffect(() => {
    wetMixRef.current = wetMix;
  }, [wetMix]);

  /* Build signal graph: source → dry gain → master
                          source → convolver → wet gain → master */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const conv = ctx.createConvolver();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    dry.gain.value = 1 - wetMixRef.current;
    wet.gain.value = wetMixRef.current;

    conv.buffer = generatePresetIR(ctx, preset);

    conv.connect(wet);
    wet.connect(an);
    dry.connect(an);
    an.connect(masterGain);

    convolverRef.current = conv;
    dryGainRef.current = dry;
    wetGainRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      conv.disconnect();
      dry.disconnect();
      wet.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain, preset]);

  /* Update wet/dry in real-time */
  useEffect(() => {
    if (dryGainRef.current) dryGainRef.current.gain.value = 1 - wetMix;
    if (wetGainRef.current) wetGainRef.current.gain.value = wetMix;
  }, [wetMix]);

  /* Play a test tone (sawtooth sweep) */
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

    /* Generate a short pitched sample: sawtooth burst */
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const freq = 220;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      /* Sawtooth with amplitude envelope */
      const env = Math.exp(-t * 2);
      data[i] = env * (2 * ((t * freq) % 1) - 1) * 0.3;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    /* Connect to both dry and convolver paths */
    if (dryGainRef.current) src.connect(dryGainRef.current);
    if (convolverRef.current) src.connect(convolverRef.current);

    src.start();
    sourceRef.current = src;
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
      title="Convolution Reverb"
      description="Apply impulse-response-based reverb to audio using ConvolverNode. Choose from synthetic IR presets (hall, plate, spring, room, cathedral) and control the dry/wet mix."
      nodes={["ConvolverNode", "GainNode ×2", "AnalyserNode"]}
    >
      <Waveform analyser={analyser} />

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`rounded-md border px-4 py-1.5 text-xs capitalize transition ${
              preset === p
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface-alt text-text-muted hover:text-text"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <Slider
        label="Dry / Wet"
        min={0}
        max={1}
        step={0.01}
        value={wetMix}
        onChange={setWetMix}
      />

      <Toggle
        label={playing ? "Stop" : "Play Test Tone"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
