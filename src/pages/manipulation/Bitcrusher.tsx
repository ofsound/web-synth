import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { createNoiseBuffer } from "../../utils/noiseGenerators";

/**
 * Build a staircase transfer curve that quantises the signal
 * to the given number of bits.  The curve maps [-1, 1] → stepped
 * values with 2^bits discrete levels.
 */
function makeStaircaseCurve(bits: number, samples = 8192): Float32Array {
  const curve = new Float32Array(samples);
  const steps = Math.pow(2, bits);
  for (let i = 0; i < samples; i++) {
    const x = (2 * i) / (samples - 1) - 1; // -1 … 1
    // Quantise: round to nearest step
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

export default function Bitcrusher() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [bits, setBits] = useState(8);
  const [mix, setMix] = useState(1);

  const inputRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const shaperRef = useRef<WaveShaperNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);

  /*
   * Graph:
   *  source → input ─┬─→ waveshaper → wet ─┬─→ analyser → masterGain
   *                   └─→ dry ──────────────┘
   *  mix controls dry/wet balance
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    input.gain.value = 1;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeStaircaseCurve(bits) as Float32Array<ArrayBuffer>;
    shaper.oversample = "none"; // intentionally no oversampling for lo-fi

    const dry = ctx.createGain();
    dry.gain.value = 1 - mix;

    const wet = ctx.createGain();
    wet.gain.value = mix;

    const merger = ctx.createGain(); // sum dry + wet
    merger.gain.value = 1;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    input.connect(shaper);
    shaper.connect(wet);
    wet.connect(merger);

    input.connect(dry);
    dry.connect(merger);

    merger.connect(an);
    an.connect(masterGain);

    inputRef.current = input;
    shaperRef.current = shaper;
    dryRef.current = dry;
    wetRef.current = wet;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    return () => {
      input.disconnect();
      shaper.disconnect();
      dry.disconnect();
      wet.disconnect();
      merger.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Update staircase curve when bit depth changes */
  useEffect(() => {
    if (shaperRef.current) {
      shaperRef.current.curve = makeStaircaseCurve(
        bits,
      ) as Float32Array<ArrayBuffer>;
    }
  }, [bits]);

  /* Update dry/wet mix */
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

    if (!noiseBufferRef.current) {
      noiseBufferRef.current = createNoiseBuffer(ctx, "pink", 4);
    }

    const src = ctx.createBufferSource();
    src.buffer = noiseBufferRef.current;
    src.loop = true;
    src.connect(inputRef.current!);
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
      title="Bitcrusher"
      description="Lo-fi bit depth reduction using a WaveShaperNode with a staircase transfer curve. Lower bit values produce harsher quantisation artifacts. Mix blends between clean and crushed signal."
      nodes={["WaveShaperNode", "GainNode (dry/wet)"]}
    >
      <Waveform analyser={analyser} />

      <Slider
        label="Bit Depth"
        min={1}
        max={16}
        step={1}
        value={bits}
        onChange={setBits}
        unit="bits"
      />
      <Slider
        label="Mix"
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
