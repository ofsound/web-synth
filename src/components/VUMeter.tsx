/**
 * Stereo VU Meter component.
 *
 * Reads RMS levels from left/right AnalyserNodes and renders
 * as vertical bar meters with dBFS scale and peak hold.
 *
 * Battery-saving: stops rAF entirely after sustained silence,
 * polls at 500 ms to detect when audio resumes.
 */

import { useEffect, useRef } from "react";
import {
  SILENCE_THRESHOLD_DB,
  SILENCE_FRAMES_BEFORE_PAUSE,
  PEAK_DECAY_RATE,
} from "../constants";

interface VUMeterProps {
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  width?: number;
  height?: number;
}

/** Interval (ms) to poll analyser for audio while sleeping. */
const SILENCE_POLL_MS = 500;

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakLRef = useRef(-100);
  const peakRRef = useRef(-100);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!analyserL || !analyserR) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const c = canvas.getContext("2d");
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const w = width;
    const h = height;
    const barW = (w - 24) / 2; // 2 bars with spacing

    const barGradient = c.createLinearGradient(0, h, 0, 0);
    barGradient.addColorStop(0, "#22c55e");
    barGradient.addColorStop(0.6, "#22c55e");
    barGradient.addColorStop(0.8, "#f59e0b");
    barGradient.addColorStop(1.0, "#ef4444");

    const bufL = new Float32Array(analyserL.fftSize);
    const bufR = new Float32Array(analyserR.fftSize);

    lastTimeRef.current = performance.now();

    let silentFrameCount = 0;
    let sleeping = false;

    const minDb = -60;
    const maxDb = 0;

    const dbToY = (db: number) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return h - ((clamped - minDb) / (maxDb - minDb)) * h;
    };

    const drawBar = (x: number, db: number, peakDb: number) => {
      const barTop = dbToY(db);
      const barBottom = h;

      c.fillStyle = barGradient;
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

    const render = (dbL: number, dbR: number, dt: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      peakLRef.current = Math.max(dbL, peakLRef.current - PEAK_DECAY_RATE * dt);
      peakRRef.current = Math.max(dbR, peakRRef.current - PEAK_DECAY_RATE * dt);
      c.clearRect(0, 0, w, h);

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
    };

    /** Start the rAF-based rendering loop. */
    const startLoop = () => {
      if (sleeping) {
        // Cancel poll timer — we're waking up
        if (pollRef.current !== null) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        sleeping = false;
        silentFrameCount = 0;
        lastTimeRef.current = performance.now();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    /** Stop the rAF loop and begin low-frequency polling. */
    const sleep = () => {
      sleeping = true;
      cancelAnimationFrame(rafRef.current);

      // Render one last silent frame so the meter settles to zero
      render(-100, -100, 0.1);

      // Poll to detect when audio resumes
      pollRef.current = setInterval(() => {
        analyserL.getFloatTimeDomainData(bufL);
        analyserR.getFloatTimeDomainData(bufR);
        const dbL = rmsToDb(rmsLevel(bufL));
        const dbR = rmsToDb(rmsLevel(bufR));
        if (dbL >= SILENCE_THRESHOLD_DB || dbR >= SILENCE_THRESHOLD_DB) {
          startLoop();
        }
      }, SILENCE_POLL_MS);
    };

    const draw = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;

      analyserL.getFloatTimeDomainData(bufL);
      analyserR.getFloatTimeDomainData(bufR);

      const dbL = rmsToDb(rmsLevel(bufL));
      const dbR = rmsToDb(rmsLevel(bufR));

      // Check if audio is silent
      const isSilent = dbL < SILENCE_THRESHOLD_DB && dbR < SILENCE_THRESHOLD_DB;
      if (isSilent) {
        silentFrameCount++;
        if (silentFrameCount > SILENCE_FRAMES_BEFORE_PAUSE) {
          sleep();
          return; // exit — no more rAF
        }
      } else {
        silentFrameCount = 0;
      }

      render(dbL, dbR, dt);
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [analyserL, analyserR, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border rounded border"
    />
  );
}
