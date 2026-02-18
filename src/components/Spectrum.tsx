import { useEffect, useRef } from "react";

interface SpectrumProps {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  barColor?: string;
}

export function Spectrum({
  analyser,
  width = 600,
  height = 150,
  barColor = "#6366f1",
}: SpectrumProps) {
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

      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      const barWidth = w / data.length;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < data.length; i++) {
        const barHeight = (data[i] / 255) * h;
        const hue = (i / data.length) * 60 + 230; /* blue → purple gradient */
        ctx.fillStyle =
          barColor === "rainbow" ? `hsl(${hue}, 70%, 55%)` : barColor;
        ctx.fillRect(
          i * barWidth,
          h - barHeight,
          Math.max(barWidth - 1, 1),
          barHeight,
        );
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, barColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border bg-surface w-full rounded border"
    />
  );
}
