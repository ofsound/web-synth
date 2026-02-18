import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";

const FFT_SIZES = [256, 512, 1024, 2048, 4096, 8192] as const;

export default function SpectrumAnalyzer() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [fftSize, setFftSize] = useState<number>(2048);
  const [smoothing, setSmoothing] = useState(0.8);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);
  const oscRefs = useRef<OscillatorNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  /* Build analyser graph */
  useEffect(() => {
    if (!ctx || !masterGain) return;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;

    const gain = ctx.createGain();
    gain.gain.value = 0.3;

    gain.connect(analyser);
    analyser.connect(masterGain);

    analyserRef.current = analyser;
    gainRef.current = gain;

    return () => {
      gain.disconnect();
      analyser.disconnect();
    };
  }, [ctx, masterGain, fftSize]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Update smoothing in real-time */
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = smoothing;
    }
  }, [smoothing]);

  /* Canvas draw loop */
  useEffect(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const drawCtx = canvas.getContext("2d");
    if (!drawCtx) return;

    const data = new Float32Array(analyser.frequencyBinCount);
    const minDb = -90;
    const maxDb = -10;
    const minFreq = 20;
    const maxFreq = 20000;

    const freqToX = (freq: number, w: number) => {
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      return ((Math.log10(freq) - logMin) / (logMax - logMin)) * w;
    };

    const dbToY = (db: number, h: number) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return ((maxDb - clamped) / (maxDb - minDb)) * h;
    };

    const draw = () => {
      analyser.getFloatFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      const nyquist = analyser.context.sampleRate / 2;
      const binCount = analyser.frequencyBinCount;

      drawCtx.fillStyle = "#1a1a2e";
      drawCtx.fillRect(0, 0, w, h);

      /* dB grid */
      drawCtx.strokeStyle = "rgba(255,255,255,0.08)";
      drawCtx.lineWidth = 1;
      drawCtx.fillStyle = "rgba(255,255,255,0.35)";
      drawCtx.font = "10px monospace";
      for (let db = -80; db <= -10; db += 10) {
        const y = dbToY(db, h);
        drawCtx.beginPath();
        drawCtx.moveTo(0, y);
        drawCtx.lineTo(w, y);
        drawCtx.stroke();
        drawCtx.fillText(`${db} dB`, 4, y - 2);
      }

      /* Frequency grid */
      const freqMarkers = [
        20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
      ];
      for (const f of freqMarkers) {
        const x = freqToX(f, w);
        drawCtx.beginPath();
        drawCtx.moveTo(x, 0);
        drawCtx.lineTo(x, h);
        drawCtx.stroke();
        const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
        drawCtx.fillText(label, x + 2, h - 4);
      }

      /* Spectrum curve */
      drawCtx.strokeStyle = "#6366f1";
      drawCtx.lineWidth = 2;
      drawCtx.beginPath();
      let started = false;

      for (let i = 0; i < binCount; i++) {
        const freq = (i * nyquist) / binCount;
        if (freq < minFreq || freq > maxFreq) continue;
        const x = freqToX(freq, w);
        const y = dbToY(data[i], h);
        if (!started) {
          drawCtx.moveTo(x, y);
          started = true;
        } else {
          drawCtx.lineTo(x, y);
        }
      }
      drawCtx.stroke();

      /* Filled area under curve */
      if (started) {
        drawCtx.lineTo(freqToX(maxFreq, w), h);
        drawCtx.lineTo(freqToX(minFreq, w), h);
        drawCtx.closePath();
        drawCtx.fillStyle = "rgba(99,102,241,0.15)";
        drawCtx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftSize, smoothing]);

  /* Play multi-tone + pink noise test signal */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx || !gainRef.current) return;

    if (playing) {
      oscRefs.current.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ok */
        }
      });
      oscRefs.current = [];
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
      noiseRef.current = null;
      setPlaying(false);
      return;
    }

    /* Multi-tone oscillators */
    const freqs = [440, 659.25, 880];
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gainRef.current);
      osc.start();
      oscs.push(osc);
    }
    oscRefs.current = oscs;

    /* Pink noise */
    const sr = ctx.sampleRate;
    const length = sr * 4;
    const buf = ctx.createBuffer(1, length, sr);
    const d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.05;
      b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gainRef.current);
    src.start();
    noiseRef.current = src;

    setPlaying(true);
  }, [ctx, resume, playing]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      oscRefs.current.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ok */
        }
      });
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Spectrum Analyzer"
      description="Real-time FFT frequency spectrum with logarithmic frequency axis (20 Hz – 20 kHz) and decibel scale. Uses getFloatFrequencyData for accurate dB readings."
      nodes={["AnalyserNode", "OscillatorNode"]}
    >
      <div className="bg-surface-alt border-border rounded-lg border p-4">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="border-border w-full rounded border"
        />
      </div>

      <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-muted text-xs">FFT Size:</span>
          {FFT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setFftSize(size)}
              className={`rounded px-2.5 py-1 text-xs transition ${
                fftSize === size
                  ? "bg-accent/20 text-accent border-accent border"
                  : "bg-surface-alt border-border text-text-muted border"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <Slider
          label="Smoothing"
          min={0}
          max={1}
          step={0.01}
          value={smoothing}
          onChange={setSmoothing}
        />
      </div>

      <button
        onClick={togglePlay}
        className={`self-start rounded-lg px-5 py-2 text-sm font-medium transition ${
          playing
            ? "border border-red-500 bg-red-500/20 text-red-400"
            : "bg-accent/20 text-accent border-accent border"
        }`}
      >
        {playing ? "Stop" : "Play Test Signal"}
      </button>
    </DemoShell>
  );
}
