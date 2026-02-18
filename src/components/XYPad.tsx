import { useCallback, useRef, useState } from "react";

interface XYPadProps {
  width?: number;
  height?: number;
  onMove: (x: number, y: number) => void;
  labelX?: string;
  labelY?: string;
}

export function XYPad({
  width = 300,
  height = 300,
  onMove,
  labelX = "X",
  labelY = "Y",
}: XYPadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [active, setActive] = useState(false);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(
        0,
        Math.min(1, 1 - (clientY - rect.top) / rect.height),
      );
      setPos({ x, y });
      onMove(x, y);
    },
    [onMove],
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.preventDefault();
          setActive(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (active) update(e.clientX, e.clientY);
        }}
        onPointerUp={() => setActive(false)}
        className="border-border bg-surface-alt relative cursor-crosshair rounded border"
        style={{ width, height }}
      >
        {/* Crosshairs */}
        <div
          className="bg-accent/30 absolute h-px w-full"
          style={{ top: `${(1 - pos.y) * 100}%` }}
        />
        <div
          className="bg-accent/30 absolute top-0 left-0 h-full w-px"
          style={{ left: `${pos.x * 100}%` }}
        />
        {/* Dot */}
        <div
          className="bg-accent shadow-accent/40 absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg"
          style={{
            left: `${pos.x * 100}%`,
            top: `${(1 - pos.y) * 100}%`,
          }}
        />
      </div>
      <div className="text-text-muted flex w-full justify-between text-[10px]">
        <span>
          {labelX}: {pos.x.toFixed(2)}
        </span>
        <span>
          {labelY}: {pos.y.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
