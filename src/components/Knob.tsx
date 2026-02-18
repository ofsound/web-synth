import { useRef, useCallback, useState, useEffect } from "react";

interface KnobProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  size?: number;
  unit?: string;
}

export function Knob({
  label,
  min,
  max,
  value,
  onChange,
  size = 56,
  unit = "",
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);

  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270; /* -135° to +135° */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      startYRef.current = e.clientY;
      startValRef.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const dy = startYRef.current - e.clientY;
      const range = max - min;
      const sensitivity = range / 150;
      const newVal = Math.min(
        max,
        Math.max(min, startValRef.current + dy * sensitivity),
      );
      onChange(newVal);
    },
    [dragging, min, max, onChange],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      const up = () => setDragging(false);
      window.addEventListener("pointerup", up);
      return () => window.removeEventListener("pointerup", up);
    }
  }, [dragging]);

  const displayVal =
    value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : value >= 100
        ? Math.round(value).toString()
        : value.toFixed(1);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={knobRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="border-border bg-surface-alt relative cursor-grab rounded-full border active:cursor-grabbing"
        style={{ width: size, height: size }}
      >
        {/* Track arc */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0"
          style={{ width: size, height: size }}
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
            strokeDasharray="188.5"
            strokeDashoffset="75.4"
            transform="rotate(135 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="4"
            strokeDasharray="188.5"
            strokeDashoffset={188.5 - pct * 188.5}
            transform="rotate(135 50 50)"
            strokeLinecap="round"
          />
        </svg>
        {/* Indicator line */}
        <div
          className="bg-text absolute top-1/2 left-1/2 h-[40%] w-0.5 origin-bottom rounded"
          style={{
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />
      </div>
      <span className="text-text text-[10px] tabular-nums">
        {displayVal}
        {unit}
      </span>
      <span className="text-text-muted text-[10px]">{label}</span>
    </div>
  );
}
