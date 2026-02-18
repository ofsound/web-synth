import { useEffect, useRef } from "react";

interface FrequencyResponseProps {
  filters: (BiquadFilterNode | IIRFilterNode)[];
  width?: number;
  height?: number;
  sampleRate?: number;
}

/**
 * Draws the combined frequency response of one or more filter nodes.
 * Uses getFrequencyResponse() on each filter and multiplies magnitude.
 */
export function FrequencyResponse({
  filters,
  width = 600,
  height = 200,
  sampleRate = 44100,
}: FrequencyResponseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || filters.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const numPoints = width;
    const freqs = new Float32Array(numPoints);
    /* Logarithmic frequency scale: 20 Hz → Nyquist */
    const nyquist = sampleRate / 2;
    for (let i = 0; i < numPoints; i++) {
      freqs[i] = 20 * Math.pow(nyquist / 20, i / (numPoints - 1));
    }

    const combinedMag = new Float32Array(numPoints).fill(1);

    for (const filter of filters) {
      const mag = new Float32Array(numPoints);
      const phase = new Float32Array(numPoints);
      filter.getFrequencyResponse(freqs, mag, phase);
      for (let i = 0; i < numPoints; i++) {
        combinedMag[i] *= mag[i];
      }
    }

    ctx.clearRect(0, 0, width, height);

    /* Grid */
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    /* Frequency grid lines at 100, 1k, 10k */
    for (const f of [100, 1000, 10000]) {
      const x = (Math.log(f / 20) / Math.log(nyquist / 20)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    /* 0 dB line */
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    /* Response curve */
    ctx.beginPath();
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2;
    for (let i = 0; i < numPoints; i++) {
      const dB = 20 * Math.log10(combinedMag[i]);
      const clamped = Math.max(-30, Math.min(30, dB));
      const y = height / 2 - (clamped / 30) * (height / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    /* Frequency labels */
    ctx.fillStyle = "#8888aa";
    ctx.font = "10px sans-serif";
    for (const [f, label] of [
      [100, "100"],
      [1000, "1k"],
      [10000, "10k"],
    ] as const) {
      const x = (Math.log(f / 20) / Math.log(nyquist / 20)) * width;
      ctx.fillText(label, x + 2, height - 4);
    }
  }, [filters, width, height, sampleRate]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border bg-surface w-full rounded border"
    />
  );
}
