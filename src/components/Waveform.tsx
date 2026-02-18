import { useEffect, useRef } from "react";

interface WaveformProps {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  color?: string;
}

export function Waveform({
  analyser,
  width = 600,
  height = 150,
  color = "#6366f1",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      analyser.getByteTimeDomainData(data);
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      /* Grid lines */
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      /* Waveform */
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceWidth = w / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border bg-surface w-full rounded border"
    />
  );
}
