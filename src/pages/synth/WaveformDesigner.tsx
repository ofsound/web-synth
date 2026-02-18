import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

const NUM_HARMONICS = 16;

function makeSawtooth(): number[] {
  return Array.from({ length: NUM_HARMONICS }, (_, i) => 1 / (i + 1));
}

function makeSquare(): number[] {
  return Array.from({ length: NUM_HARMONICS }, (_, i) =>
    (i + 1) % 2 === 1 ? 1 / (i + 1) : 0,
  );
}

function makeTriangle(): number[] {
  return Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    if (n % 2 === 0) return 0;
    const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
    return sign / (n * n);
  });
}

function makeSine(): number[] {
  const a = new Array<number>(NUM_HARMONICS).fill(0);
  a[0] = 1;
  return a;
}

function buildPeriodicWave(
  ctx: AudioContext,
  harmonics: number[],
): PeriodicWave {
  const real = new Float32Array(NUM_HARMONICS + 1);
  const imag = new Float32Array(NUM_HARMONICS + 1);
  for (let i = 0; i < NUM_HARMONICS; i++) {
    imag[i + 1] = harmonics[i];
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export default function WaveformDesigner() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [frequency, setFrequency] = useState(220);
  const [harmonics, setHarmonics] = useState<number[]>(makeSine);

  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Static graph: gain → analyser → master */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const g = ctx.createGain();
    g.gain.value = 0.3;
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
  }, [ctx, masterGain]);

  /* Apply PeriodicWave to running oscillator */
  const applyWave = useCallback(() => {
    if (!ctx || !oscRef.current) return;
    oscRef.current.setPeriodicWave(buildPeriodicWave(ctx, harmonics));
  }, [ctx, harmonics]);

  /* Update wave whenever harmonics change and playing */
  useEffect(() => {
    if (playing) applyWave();
  }, [harmonics, applyWave, playing]);

  /* Update frequency live */
  useEffect(() => {
    if (oscRef.current) oscRef.current.frequency.value = frequency;
  }, [frequency]);

  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx || !gainRef.current) return;
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
    osc.frequency.value = frequency;
    osc.setPeriodicWave(buildPeriodicWave(ctx, harmonics));
    osc.connect(gainRef.current);
    osc.start();
    oscRef.current = osc;
    setPlaying(true);
  }, [ctx, resume, playing, frequency, harmonics]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  /* Draw harmonic bar chart */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.scale(dpr, dpr);
    c.clearRect(0, 0, rect.width, rect.height);

    const barW = rect.width / NUM_HARMONICS;
    const maxAbs = Math.max(...harmonics.map(Math.abs), 0.001);

    for (let i = 0; i < NUM_HARMONICS; i++) {
      const absVal = Math.abs(harmonics[i]);
      const h = (absVal / maxAbs) * (rect.height - 20);
      const x = i * barW + 2;
      c.fillStyle = harmonics[i] >= 0 ? "#6d9cff" : "#ff6d6d";
      c.fillRect(x, rect.height - 16 - h, barW - 4, h);
      c.fillStyle = "#888";
      c.font = "9px sans-serif";
      c.textAlign = "center";
      c.fillText(`${i + 1}`, x + (barW - 4) / 2, rect.height - 3);
    }
  }, [harmonics]);

  const setHarmonic = useCallback((index: number, value: number) => {
    setHarmonics((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  return (
    <DemoShell
      title="Waveform Designer"
      description="Design custom waveforms by specifying harmonic amplitudes (partials 1-16). A PeriodicWave is created from the Fourier coefficient arrays and applied to an OscillatorNode. Use the presets to load classic waveform recipes, or sculpt your own timbre."
      nodes={["OscillatorNode", "PeriodicWave", "GainNode"]}
    >
      {/* Waveform display */}
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
        <Waveform analyser={analyser} height={120} />
      </div>

      {/* Harmonic bar chart */}
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">
          Harmonic Spectrum
        </h3>
        <canvas
          ref={canvasRef}
          className="bg-surface-alt border-border h-28 w-full rounded border"
        />
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["Sawtooth", makeSawtooth],
            ["Square", makeSquare],
            ["Triangle", makeTriangle],
            ["Reset (Sine)", makeSine],
          ] as [string, () => number[]][]
        ).map(([name, fn]) => (
          <button
            key={name}
            onClick={() => setHarmonics(fn())}
            className={`border-border text-text-muted hover:text-accent hover:border-accent rounded border px-3 py-1 text-xs`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Harmonic sliders */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Harmonic Amplitudes
        </h3>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2 sm:grid-cols-8 lg:grid-cols-16">
          {harmonics.map((val, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-text-muted text-[10px]">H{i + 1}</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={val}
                onChange={(e) => setHarmonic(i, parseFloat(e.target.value))}
                className="h-20 accent-[#6d9cff]"
                style={{
                  writingMode:
                    "vertical-lr" as React.CSSProperties["writingMode"],
                  direction: "rtl",
                }}
              />
              <span className="text-text-muted text-[9px]">
                {val.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-6">
        <div className="w-64">
          <Slider
            label="Frequency"
            min={50}
            max={2000}
            step={1}
            value={frequency}
            onChange={setFrequency}
            unit="Hz"
          />
        </div>
        <Toggle label="Play" value={playing} onChange={togglePlay} />
      </div>
    </DemoShell>
  );
}
