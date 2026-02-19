/**
 * Stereo VU Meter component.
 *
 * Reads RMS levels from left/right AnalyserNodes and renders
 * as vertical bar meters with dBFS scale and peak hold.
 */

import { useEffect, useRef } from "react";

interface VUMeterProps {
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  width?: number;
  height?: number;
}

function rmsLevel(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

function rmsToDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

export function VUMeter({
  analyserL,
  analyserR,
  width = 80,
  height = 200,
}: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const peakLRef = useRef(-100);
  const peakRRef = useRef(-100);
  const peakDecay = 0.15; // dB per frame

  useEffect(() => {
    if (!analyserL || !analyserR) return;

    const bufL = new Float32Array(analyserL.fftSize);
    const bufR = new Float32Array(analyserR.fftSize);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d");
      if (!c) return;

      analyserL.getFloatTimeDomainData(bufL);
      analyserR.getFloatTimeDomainData(bufR);

      const dbL = rmsToDb(rmsLevel(bufL));
      const dbR = rmsToDb(rmsLevel(bufR));

      // Peak hold with decay
      peakLRef.current = Math.max(dbL, peakLRef.current - peakDecay);
      peakRRef.current = Math.max(dbR, peakRRef.current - peakDecay);

      const w = canvas.width;
      const h = canvas.height;
      c.clearRect(0, 0, w, h);

      const barW = (w - 24) / 2; // 2 bars with spacing
      const minDb = -60;
      const maxDb = 0;

      const dbToY = (db: number) => {
        const clamped = Math.max(minDb, Math.min(maxDb, db));
        return h - ((clamped - minDb) / (maxDb - minDb)) * h;
      };

      // Background
      c.fillStyle = "#1a1a2e";
      c.fillRect(0, 0, w, h);

      // Draw dB scale
      c.fillStyle = "#8888aa";
      c.font = "9px monospace";
      c.textAlign = "right";
      for (let db = 0; db >= minDb; db -= 12) {
        const y = dbToY(db);
        c.fillText(`${db}`, w - 2, y + 3);
        c.strokeStyle = "rgba(136,136,170,0.2)";
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w - 20, y);
        c.stroke();
      }

      // Draw bars
      const drawBar = (x: number, db: number, peakDb: number) => {
        const barTop = dbToY(db);
        const barBottom = h;

        // Gradient: green → yellow → red
        const grad = c.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.6, "#22c55e");
        grad.addColorStop(0.8, "#f59e0b");
        grad.addColorStop(1.0, "#ef4444");

        c.fillStyle = grad;
        c.fillRect(x, barTop, barW, barBottom - barTop);

        // Peak indicator line
        const peakY = dbToY(peakDb);
        c.strokeStyle = "#fff";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, peakY);
        c.lineTo(x + barW, peakY);
        c.stroke();
      };

      const x1 = 4;
      const x2 = 4 + barW + 4;
      drawBar(x1, dbL, peakLRef.current);
      drawBar(x2, dbR, peakRRef.current);

      // Channel labels
      c.fillStyle = "#8888aa";
      c.font = "10px sans-serif";
      c.textAlign = "center";
      c.fillText("L", x1 + barW / 2, h - 4);
      c.fillText("R", x2 + barW / 2, h - 4);

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserL, analyserR]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border rounded border"
    />
  );
}
