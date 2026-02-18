import { useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { Spectrum } from "../../components/Spectrum";
import { createNoiseBuffer, type NoiseType } from "../../utils/noiseGenerators";

const NOISE_TYPES: NoiseType[] = ["white", "pink", "brown"];

const NOISE_INFO: Record<
  NoiseType,
  { label: string; spectrum: string; description: string }
> = {
  white: {
    label: "White Noise",
    spectrum: "Flat — equal energy at all frequencies",
    description:
      "White noise has equal power across the frequency spectrum, sounding bright and hissy. Analogous to white light containing all wavelengths equally.",
  },
  pink: {
    label: "Pink Noise",
    spectrum: "−3 dB/octave — equal energy per octave",
    description:
      'Pink noise rolls off at 3 dB per octave, giving each octave equal perceived loudness. Common in nature (waterfalls, wind). Often called "1/f" noise.',
  },
  brown: {
    label: "Brown Noise",
    spectrum: "−6 dB/octave — strong low-frequency emphasis",
    description:
      "Brownian (red) noise rolls off at 6 dB per octave, producing a deep rumble. Named after Robert Brown (Brownian motion), not the color.",
  },
};

export default function NoiseGenerator() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>("white");
  const [volume, setVolume] = useState(0.5);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Static graph: gain → analyser → master */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = volume;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    g.connect(an);
    an.connect(masterGain);
    gainRef.current = g;
    analyserRef.current = an;
    setAnalyser(an);
    return () => {
      g.disconnect();
      an.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, masterGain]);

  /* Live volume update */
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  /* Start / stop / change noise type */
  useEffect(() => {
    if (!ctx || !gainRef.current) return;
    if (!playing) {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* noop */
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      return;
    }

    /* Stop previous source if switching types while playing */
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* noop */
      }
      sourceRef.current.disconnect();
    }

    const buf = createNoiseBuffer(ctx, noiseType, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gainRef.current);
    src.start();
    sourceRef.current = src;

    return () => {
      try {
        src.stop();
      } catch {
        /* noop */
      }
      src.disconnect();
      sourceRef.current = null;
    };
  }, [ctx, playing, noiseType]);

  const handleToggle = async (on: boolean) => {
    if (on) await resume();
    setPlaying(on);
  };

  const info = NOISE_INFO[noiseType];

  return (
    <DemoShell
      title="Noise Generator"
      description="Generate and compare white, pink, and brown noise. Each type has a distinct spectral profile: white is flat, pink rolls off at −3 dB/octave, and brown at −6 dB/octave."
      nodes={["AudioBufferSourceNode", "GainNode", "AnalyserNode"]}
    >
      {/* Educational info */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          {NOISE_TYPES.map((t) => (
            <div
              key={t}
              className={`rounded-md border p-3 transition ${
                noiseType === t
                  ? "border-accent/50 bg-accent/5"
                  : "border-white/5"
              }`}
            >
              <h3 className="text-accent mb-1 font-semibold">
                {NOISE_INFO[t].label}
              </h3>
              <p className="text-text-muted mb-1 font-mono text-[10px]">
                {NOISE_INFO[t].spectrum}
              </p>
              <p className="text-text-muted">{NOISE_INFO[t].description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Toggle label="Play" value={playing} onChange={handleToggle} />

          {/* Noise type selector */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Type:</span>
            {NOISE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  noiseType === t
                    ? "bg-accent text-white"
                    : "text-text-muted bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setNoiseType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={setVolume}
        />
      </div>

      {/* Selected noise info */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-1 text-sm font-semibold">{info.label}</h2>
        <p className="text-text-muted text-xs">{info.spectrum}</p>
      </div>

      {/* Waveform */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-2 text-sm font-semibold">Waveform</h2>
        <Waveform analyser={analyser} />
      </div>

      {/* Spectrum */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-2 text-sm font-semibold">Spectrum</h2>
        <Spectrum analyser={analyser} />
      </div>
    </DemoShell>
  );
}
