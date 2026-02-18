import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";
import { createNoiseBuffer } from "../../utils/noiseGenerators";

/* ── IIR Preset Definitions ─────────────────────────────────── */
interface IIRPreset {
  name: string;
  feedforward: number[];
  feedback: number[];
}

const IIR_PRESETS: IIRPreset[] = [
  {
    name: "Lowpass (1st order)",
    feedforward: [0.0675, 0.0675],
    feedback: [1.0, -0.865],
  },
  {
    name: "Highpass (1st order)",
    feedforward: [0.9325, -0.9325],
    feedback: [1.0, -0.865],
  },
  {
    name: "Bandpass (2nd order)",
    feedforward: [0.1, 0, -0.1],
    feedback: [1.0, -1.7, 0.8],
  },
  {
    name: "Notch (2nd order)",
    feedforward: [0.9, -1.6, 0.9],
    feedback: [1.0, -1.6, 0.8],
  },
  {
    name: "Low-shelf boost",
    feedforward: [1.0, -0.5],
    feedback: [1.0, -0.9],
  },
  {
    name: "Resonant LP",
    feedforward: [0.02, 0.04, 0.02],
    feedback: [1.0, -1.56, 0.64],
  },
];

/* ── Frequency Response Canvas ──────────────────────────────── */

function drawFrequencyResponse(
  canvas: HTMLCanvasElement,
  filter: IIRFilterNode,
  sampleRate: number,
) {
  const cCtx = canvas.getContext("2d");
  if (!cCtx) return;

  const w = canvas.width;
  const h = canvas.height;
  const numPoints = w;
  const nyquist = sampleRate / 2;

  // Build log-spaced frequency array 20 Hz → nyquist
  const freqs = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    freqs[i] = 20 * Math.pow(nyquist / 20, i / (numPoints - 1));
  }

  const mag = new Float32Array(numPoints);
  const phase = new Float32Array(numPoints);
  filter.getFrequencyResponse(freqs, mag, phase);

  cCtx.clearRect(0, 0, w, h);

  // Background
  cCtx.fillStyle = "rgba(0,0,0,0.25)";
  cCtx.fillRect(0, 0, w, h);

  // Grid lines
  cCtx.strokeStyle = "rgba(255,255,255,0.06)";
  cCtx.lineWidth = 1;
  for (const f of [100, 1000, 10000]) {
    const x = (Math.log(f / 20) / Math.log(nyquist / 20)) * w;
    cCtx.beginPath();
    cCtx.moveTo(x, 0);
    cCtx.lineTo(x, h);
    cCtx.stroke();
  }
  // 0 dB line
  cCtx.beginPath();
  cCtx.moveTo(0, h / 2);
  cCtx.lineTo(w, h / 2);
  cCtx.stroke();
  // ±12 dB lines
  for (const dB of [-12, 12]) {
    const y = h / 2 - (dB / 30) * (h / 2);
    cCtx.beginPath();
    cCtx.setLineDash([4, 4]);
    cCtx.moveTo(0, y);
    cCtx.lineTo(w, y);
    cCtx.stroke();
    cCtx.setLineDash([]);
  }

  // Magnitude curve
  cCtx.beginPath();
  cCtx.strokeStyle = "#6366f1";
  cCtx.lineWidth = 2;
  for (let i = 0; i < numPoints; i++) {
    const dB = 20 * Math.log10(Math.max(mag[i], 1e-6));
    const clamped = Math.max(-30, Math.min(30, dB));
    const y = h / 2 - (clamped / 30) * (h / 2);
    if (i === 0) cCtx.moveTo(i, y);
    else cCtx.lineTo(i, y);
  }
  cCtx.stroke();

  // Phase curve (grey, lighter)
  cCtx.beginPath();
  cCtx.strokeStyle = "rgba(255,255,255,0.2)";
  cCtx.lineWidth = 1;
  for (let i = 0; i < numPoints; i++) {
    const y = h / 2 - (phase[i] / Math.PI) * (h / 2);
    if (i === 0) cCtx.moveTo(i, y);
    else cCtx.lineTo(i, y);
  }
  cCtx.stroke();

  // Axis labels
  cCtx.fillStyle = "#8888aa";
  cCtx.font = "10px monospace";
  cCtx.textAlign = "center";
  for (const f of [100, 1000, 10000]) {
    const x = (Math.log(f / 20) / Math.log(nyquist / 20)) * w;
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    cCtx.fillText(label, x, h - 4);
  }
  cCtx.textAlign = "left";
  cCtx.fillText("+30 dB", 4, 12);
  cCtx.fillText("0 dB", 4, h / 2 - 4);
  cCtx.fillText("-30 dB", 4, h - 14);
}

/* ── Component ──────────────────────────────────────────────── */

export default function CustomIIRFilter() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);

  const [presetIdx, setPresetIdx] = useState(0);
  const [gain, setGain] = useState(1);

  const inputRef = useRef<GainNode | null>(null);
  const iirRef = useRef<IIRFilterNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const preset = IIR_PRESETS[presetIdx];

  /*
   * Graph:
   *  source → input → IIRFilterNode → outputGain → analyser → masterGain
   *
   * IIRFilterNode must be recreated when coefficients change.
   */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const input = ctx.createGain();
    input.gain.value = 1;

    const iir = ctx.createIIRFilter(preset.feedforward, preset.feedback);

    const outGain = ctx.createGain();
    outGain.gain.value = gain;

    const an = ctx.createAnalyser();
    an.fftSize = 2048;

    input.connect(iir);
    iir.connect(outGain);
    outGain.connect(an);
    an.connect(masterGain);

    // Reconnect live source if playing
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
        sourceRef.current.connect(input);
      } catch {
        /* source may have ended */
      }
    }

    inputRef.current = input;
    iirRef.current = iir;
    outputGainRef.current = outGain;
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));

    // Draw frequency response
    if (canvasRef.current) {
      drawFrequencyResponse(canvasRef.current, iir, ctx.sampleRate);
    }

    return () => {
      input.disconnect();
      iir.disconnect();
      outGain.disconnect();
      an.disconnect();
    };
  }, [ctx, masterGain, presetIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Redraw frequency response when canvas mounts or preset changes */
  useEffect(() => {
    if (!iirRef.current || !canvasRef.current || !ctx) return;
    drawFrequencyResponse(canvasRef.current, iirRef.current, ctx.sampleRate);
  }, [presetIdx, ctx]);

  /* Update output gain */
  useEffect(() => {
    if (outputGainRef.current) outputGainRef.current.gain.value = gain;
  }, [gain]);

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
      title="Custom IIR Filter"
      description="Design arbitrary IIR filters by selecting from preset feedforward/feedback coefficient sets. The canvas shows the log-scale frequency response (magnitude in indigo, phase in grey)."
      nodes={["IIRFilterNode", "GainNode", "Canvas (freq response)"]}
    >
      {/* Frequency response canvas */}
      <div className="bg-surface-alt border-border rounded-lg border p-2">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full rounded"
          style={{ imageRendering: "auto" }}
        />
      </div>

      {/* Preset selector */}
      <div className="flex flex-wrap gap-2">
        {IIR_PRESETS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => setPresetIdx(i)}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              presetIdx === i
                ? "border-accent bg-accent/20 text-accent"
                : "border-border bg-surface-alt text-text-muted hover:text-text"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Coefficient readout */}
      <div className="bg-surface-alt border-border rounded border p-3 font-mono text-[11px]">
        <p className="text-text-muted">
          <span className="text-accent">feedforward:</span> [
          {preset.feedforward.join(", ")}]
        </p>
        <p className="text-text-muted mt-1">
          <span className="text-accent">feedback:</span> [
          {preset.feedback.join(", ")}]
        </p>
      </div>

      <Waveform analyser={analyser} />

      <Slider
        label="Output Gain"
        min={0}
        max={3}
        step={0.01}
        value={gain}
        onChange={setGain}
      />

      <Toggle
        label={playing ? "Stop" : "Play Pink Noise"}
        value={playing}
        onChange={togglePlay}
      />
    </DemoShell>
  );
}
