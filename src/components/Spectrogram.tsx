import { useEffect, useRef } from "react";

interface SpectrogramProps {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
}

export function Spectrogram({
  analyser,
  width = 600,
  height = 200,
}: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const xRef = useRef(0);

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    xRef.current = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      analyser.getByteFrequencyData(data);
      const h = canvas.height;
      const x = xRef.current;

      /* Draw one column */
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const y = h - (i / data.length) * h;
        const hue = 240 - (v / 255) * 240;
        const light = (v / 255) * 60 + 10;
        ctx.fillStyle = `hsl(${hue}, 80%, ${light}%)`;
        ctx.fillRect(x, y, 1, Math.max(h / data.length, 1));
      }

      xRef.current = (x + 1) % canvas.width;

      /* Clear next column for scroll effect */
      ctx.clearRect(xRef.current, 0, 2, h);

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border bg-surface w-full rounded border"
    />
  );
}
