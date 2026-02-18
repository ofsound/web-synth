import { useMemo, useRef, useEffect } from "react";

interface ADSREnvelopeProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  width?: number;
  height?: number;
}

export function ADSREnvelope({
  attack,
  decay,
  sustain,
  release,
  width = 300,
  height = 120,
}: ADSREnvelopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const points = useMemo(() => {
    const total =
      attack + decay + 0.3 + release; /* sustain hold = 0.3s visual */
    const scale = (t: number) => (t / total) * width;
    return {
      attackEnd: scale(attack),
      decayEnd: scale(attack + decay),
      sustainEnd: scale(attack + decay + 0.3),
      releaseEnd: scale(total),
      sustainLevel: (1 - sustain) * height,
    };
  }, [attack, decay, sustain, release, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    /* Fill area */
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height); /* start at bottom-left */
    ctx.lineTo(points.attackEnd, 4); /* attack peak */
    ctx.lineTo(points.decayEnd, points.sustainLevel); /* decay to sustain */
    ctx.lineTo(points.sustainEnd, points.sustainLevel); /* sustain hold */
    ctx.lineTo(points.releaseEnd, height); /* release to zero */
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
    ctx.fill();

    /* Stroke line */
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(points.attackEnd, 4);
    ctx.lineTo(points.decayEnd, points.sustainLevel);
    ctx.lineTo(points.sustainEnd, points.sustainLevel);
    ctx.lineTo(points.releaseEnd, height);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Labels */
    ctx.fillStyle = "#8888aa";
    ctx.font = "10px sans-serif";
    ctx.fillText("A", points.attackEnd / 2, height - 4);
    ctx.fillText("D", (points.attackEnd + points.decayEnd) / 2, height - 4);
    ctx.fillText("S", (points.decayEnd + points.sustainEnd) / 2, height - 4);
    ctx.fillText("R", (points.sustainEnd + points.releaseEnd) / 2, height - 4);
  }, [points, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border-border bg-surface rounded border"
    />
  );
}
