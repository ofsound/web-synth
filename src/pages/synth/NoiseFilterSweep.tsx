import { useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { Spectrum } from "../../components/Spectrum";
import { createNoiseBuffer, type NoiseType } from "../../utils/noiseGenerators";

const NOISE_TYPES: NoiseType[] = ["white", "pink", "brown"];
const FILTER_TYPES: BiquadFilterType[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
];

export default function NoiseFilterSweep() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [playing, setPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>("white");
  const [filterType, setFilterType] = useState<BiquadFilterType>("bandpass");
  const [cutoff, setCutoff] = useState(1000);
  const [resonance, setResonance] = useState(8);
  const [lfoEnabled, setLfoEnabled] = useState(true);
  const [lfoRate, setLfoRate] = useState(0.5);
  const [lfoDepth, setLfoDepth] = useState(2400);
  const [volume, setVolume] = useState(0.5);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
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

  /* Live volume */
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  /* Start / stop */
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
      if (lfoRef.current) {
        try {
          lfoRef.current.stop();
        } catch {
          /* noop */
        }
        lfoRef.current.disconnect();
        lfoRef.current = null;
      }
      if (lfoGainRef.current) {
        lfoGainRef.current.disconnect();
        lfoGainRef.current = null;
      }
      if (filterRef.current) {
        filterRef.current.disconnect();
        filterRef.current = null;
      }
      return;
    }

    /* Build chain: noise → filter → gainNode */
    const buf = createNoiseBuffer(ctx, noiseType, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = resonance;

    src.connect(filter);
    filter.connect(gainRef.current);
    filterRef.current = filter;
    sourceRef.current = src;

    /* LFO → filter.frequency */
    if (lfoEnabled) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = lfoRate;
      const depth = ctx.createGain();
      depth.gain.value = lfoDepth;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      lfo.start();
      lfoRef.current = lfo;
      lfoGainRef.current = depth;
    }

    src.start();

    return () => {
      try {
        src.stop();
      } catch {
        /* noop */
      }
      src.disconnect();
      filter.disconnect();
      sourceRef.current = null;
      filterRef.current = null;
      if (lfoRef.current) {
        try {
          lfoRef.current.stop();
        } catch {
          /* noop */
        }
        lfoRef.current.disconnect();
        lfoRef.current = null;
      }
      if (lfoGainRef.current) {
        lfoGainRef.current.disconnect();
        lfoGainRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, playing, noiseType, filterType, lfoEnabled]);

  /* Live filter param updates */
  useEffect(() => {
    if (filterRef.current) {
      filterRef.current.frequency.value = cutoff;
      filterRef.current.Q.value = resonance;
    }
  }, [cutoff, resonance]);

  /* Live LFO param updates */
  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = lfoRate;
    if (lfoGainRef.current) lfoGainRef.current.gain.value = lfoDepth;
  }, [lfoRate, lfoDepth]);

  const handleToggle = async (on: boolean) => {
    if (on) await resume();
    setPlaying(on);
  };

  return (
    <DemoShell
      title="Noise + Filter Sweep"
      description="Route noise through a resonant filter and sweep the cutoff frequency with an LFO or manual control. Create wind, ocean, riser, and sweep effects."
      nodes={[
        "AudioBufferSourceNode",
        "BiquadFilterNode",
        "OscillatorNode (LFO)",
        "GainNode",
      ]}
    >
      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Toggle label="Play" value={playing} onChange={handleToggle} />

          {/* Noise type */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Noise:</span>
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

          {/* Filter type */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Filter:</span>
            {FILTER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  filterType === t
                    ? "bg-accent text-white"
                    : "text-text-muted bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setFilterType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Filter */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Filter</h3>
            <Slider
              label="Cutoff"
              min={20}
              max={20000}
              step={1}
              value={cutoff}
              onChange={setCutoff}
              unit="Hz"
            />
            <div className="mt-2">
              <Slider
                label="Resonance (Q)"
                min={0.1}
                max={30}
                step={0.1}
                value={resonance}
                onChange={setResonance}
              />
            </div>
          </div>

          {/* LFO */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">LFO</h3>
            <div className="mb-2">
              <Toggle label="LFO" value={lfoEnabled} onChange={setLfoEnabled} />
            </div>
            <Slider
              label="Rate"
              min={0.1}
              max={5}
              step={0.01}
              value={lfoRate}
              onChange={setLfoRate}
              unit="Hz"
            />
            <div className="mt-2">
              <Slider
                label="Depth"
                min={0}
                max={8000}
                step={10}
                value={lfoDepth}
                onChange={setLfoDepth}
                unit="Hz"
              />
            </div>
          </div>

          {/* Volume */}
          <div>
            <h3 className="text-text-muted mb-2 text-xs font-medium">Output</h3>
            <Slider
              label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={setVolume}
            />
          </div>
        </div>
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
