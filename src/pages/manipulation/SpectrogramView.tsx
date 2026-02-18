import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";

const FFT_SIZES = [1024, 2048, 4096] as const;

/** Map a normalised 0-1 value to a blue→cyan→green→yellow→red colormap. */
function intensityToRGB(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) {
    const s = c / 0.25;
    return [0, Math.round(s * 255), 255];
  } else if (c < 0.5) {
    const s = (c - 0.25) / 0.25;
    return [0, 255, Math.round((1 - s) * 255)];
  } else if (c < 0.75) {
    const s = (c - 0.5) / 0.25;
    return [Math.round(s * 255), 255, 0];
  } else {
    const s = (c - 0.75) / 0.25;
    return [255, Math.round((1 - s) * 255), 0];
  }
}

export default function SpectrogramView() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [playing, setPlaying] = useState(false);
  const [fftSize, setFftSize] = useState<number>(2048);
  const [smoothing, setSmoothing] = useState(0.5);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
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
    gain.gain.value = 0.25;

    gain.connect(analyser);
    analyser.connect(masterGain);

    analyserRef.current = analyser;
    gainRef.current = gain;

    return () => {
      gain.disconnect();
      analyser.disconnect();
    };
  }, [ctx, masterGain, fftSize]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Update smoothing */
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = smoothing;
    }
  }, [smoothing]);

  /* Scrolling spectrogram draw loop */
  useEffect(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const drawCtx = canvas.getContext("2d");
    if (!drawCtx) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const w = canvas.width;
    const h = canvas.height;

    drawCtx.fillStyle = "#000";
    drawCtx.fillRect(0, 0, w, h);

    const draw = () => {
      analyser.getByteFrequencyData(data);

      /* Shift existing image left by 1 pixel */
      const imageData = drawCtx.getImageData(1, 0, w - 1, h);
      drawCtx.putImageData(imageData, 0, 0);

      /* Draw new column at the right edge */
      const binCount = data.length;
      for (let y = 0; y < h; y++) {
        const binIndex = Math.floor(((h - 1 - y) / h) * binCount);
        const value = data[binIndex] / 255;
        const [r, g, b] = intensityToRGB(value);
        drawCtx.fillStyle = `rgb(${r},${g},${b})`;
        drawCtx.fillRect(w - 1, y, 1, 1);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftSize, smoothing]);

  /* Play pink noise + swept oscillator */
  const togglePlay = useCallback(async () => {
    await resume();
    if (!ctx || !gainRef.current) return;

    if (playing) {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
      oscRef.current = null;
      noiseRef.current = null;
      setPlaying(false);
      return;
    }

    /* Oscillator that sweeps 200-2000 Hz */
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 4);
    osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 8);
    osc.connect(gainRef.current);
    osc.start();
    oscRef.current = osc;

    /* Pink noise */
    const sr = ctx.sampleRate;
    const length = sr * 8;
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
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.04;
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
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        noiseRef.current?.stop();
      } catch {
        /* ok */
      }
    };
  }, []);

  return (
    <DemoShell
      title="Spectrogram"
      description="Scrolling time × frequency waterfall display. Each animation frame, frequency data is drawn as a column of coloured pixels (blue → cyan → green → yellow → red) and the canvas scrolls left."
      nodes={["AnalyserNode"]}
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
