import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Knob } from "../../components/Knob";
import { FrequencyResponse } from "../../components/FrequencyResponse";
import { Toggle } from "../../components/Toggle";

type BandType = BiquadFilterType;

interface Band {
  type: BandType;
  frequency: number;
  gain: number;
  Q: number;
}

const DEFAULT_BANDS: Band[] = [
  { type: "lowshelf", frequency: 80, gain: 0, Q: 1 },
  { type: "peaking", frequency: 250, gain: 0, Q: 1.4 },
  { type: "peaking", frequency: 1000, gain: 0, Q: 1.4 },
  { type: "peaking", frequency: 4000, gain: 0, Q: 1.4 },
  { type: "highshelf", frequency: 12000, gain: 0, Q: 1 },
];

const BAND_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

export default function ParametricEQ() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [bands, setBands] = useState<Band[]>(DEFAULT_BANDS);
  const [playing, setPlaying] = useState(false);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const [filters, setFilters] = useState<BiquadFilterNode[]>([]);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);

  /* Create / update filter chain */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    /* Dispose old filters */
    filtersRef.current.forEach((f) => f.disconnect());

    const filterNodes = bands.map((b) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.frequency;
      f.gain.value = b.gain;
      f.Q.value = b.Q;
      return f;
    });

    /* Chain: filter0 → filter1 → … → masterGain */
    for (let i = 0; i < filterNodes.length - 1; i++) {
      filterNodes[i].connect(filterNodes[i + 1]);
    }
    filterNodes[filterNodes.length - 1].connect(masterGain);

    filtersRef.current = filterNodes;
    queueMicrotask(() => setFilters(filterNodes));
  }, [ctx, masterGain, bands]);

  /* Update filter params in real-time without re-creating */
  const updateBand = useCallback((index: number, partial: Partial<Band>) => {
    setBands((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...partial };
      return next;
    });

    const filter = filtersRef.current[index];
    if (!filter) return;
    if (partial.frequency !== undefined)
      filter.frequency.value = partial.frequency;
    if (partial.gain !== undefined) filter.gain.value = partial.gain;
    if (partial.Q !== undefined) filter.Q.value = partial.Q;
    if (partial.type !== undefined) filter.type = partial.type;
  }, []);

  /* Play pink noise as test signal */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx) return;

    if (playing) {
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
      noiseRef.current = null;
      setPlaying(false);
      return;
    }

    /* Generate pink noise buffer */
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(filtersRef.current[0] || ctx.destination);
    src.start();
    noiseRef.current = src;
    setPlaying(true);
  }, [ctx, resume, playing]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Parametric EQ"
      description="A 5-band parametric equalizer with lowshelf, 3× peaking, and highshelf bands. Uses BiquadFilterNode chains with real-time frequency response visualization."
      nodes={["BiquadFilterNode ×5", "AnalyserNode", "GainNode"]}
    >
      {/* Frequency response plot */}
      <FrequencyResponse
        filters={filters}
        width={800}
        height={200}
        sampleRate={ctx?.sampleRate}
      />

      {/* Band controls */}
      <div className="grid grid-cols-5 gap-4">
        {bands.map((band, i) => (
          <div
            key={i}
            className="border-border bg-surface-alt flex flex-col items-center gap-3 rounded-lg border p-4"
            style={{ borderTopColor: BAND_COLORS[i], borderTopWidth: 2 }}
          >
            <span className="text-text text-xs font-medium">Band {i + 1}</span>
            <span className="text-text-muted text-[10px]">{band.type}</span>
            <Knob
              label="Freq"
              min={20}
              max={20000}
              value={band.frequency}
              onChange={(v) => updateBand(i, { frequency: v })}
              unit="Hz"
            />
            <Knob
              label="Gain"
              min={-24}
              max={24}
              value={band.gain}
              onChange={(v) => updateBand(i, { gain: v })}
              unit="dB"
            />
            <Knob
              label="Q"
              min={0.1}
              max={18}
              value={band.Q}
              onChange={(v) => updateBand(i, { Q: v })}
            />
          </div>
        ))}
      </div>

      {/* Transport */}
      <div className="flex items-center gap-4">
        <Toggle
          label={playing ? "Stop Pink Noise" : "Play Pink Noise"}
          value={playing}
          onChange={togglePlay}
        />
        <span className="text-text-muted text-xs">
          Test signal: looping pink noise through the EQ chain
        </span>
      </div>
    </DemoShell>
  );
}
