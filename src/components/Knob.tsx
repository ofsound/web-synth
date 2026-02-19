import { useRef, useCallback, useState, useEffect } from "react";

interface KnobProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  size?: number;
  unit?: string;
  /** Use logarithmic scaling — ideal for frequency-domain parameters. */
  scale?: "linear" | "log";
}

/**
 * Map a normalised 0-1 value to the parameter range using the chosen scale.
 */
function normToValue(
  norm: number,
  min: number,
  max: number,
  scale: "linear" | "log",
): number {
  if (scale === "log") {
    // Logarithmic mapping: useful for frequency knobs (20–15 000 Hz)
    const safeMin = Math.max(min, 1e-6);
    return safeMin * Math.pow(max / safeMin, norm);
  }
  return min + norm * (max - min);
}

/**
 * Map a parameter value back to normalised 0-1.
 */
function valueToNorm(
  val: number,
  min: number,
  max: number,
  scale: "linear" | "log",
): number {
  if (scale === "log") {
    const safeMin = Math.max(min, 1e-6);
    const clamped = Math.max(val, safeMin);
    return Math.log(clamped / safeMin) / Math.log(max / safeMin);
  }
  return (val - min) / (max - min);
}

export function Knob({
  label,
  min,
  max,
  value,
  onChange,
  size = 56,
  unit = "",
  scale = "linear",
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startNormRef = useRef(0);

  const clampValue = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [min, max],
  );

  const pct = valueToNorm(value, min, max, scale);
  const angle = -135 + pct * 270; /* -135° to +135° */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      startYRef.current = e.clientY;
      startNormRef.current = valueToNorm(value, min, max, scale);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value, min, max, scale],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const dy = startYRef.current - e.clientY;
      // Sensitivity in normalised space: 150 px = full range
      const normDelta = dy / 150;
      const newNorm = Math.min(
        1,
        Math.max(0, startNormRef.current + normDelta),
      );
      const newVal = clampValue(normToValue(newNorm, min, max, scale));
      onChange(newVal);
    },
    [dragging, clampValue, max, min, onChange, scale],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const fineNorm = 1 / 100;
      const coarseNorm = 1 / 20;
      const currentNorm = valueToNorm(value, min, max, scale);

      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onChange(
          clampValue(
            normToValue(Math.min(1, currentNorm + fineNorm), min, max, scale),
          ),
        );
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(
          clampValue(
            normToValue(Math.max(0, currentNorm - fineNorm), min, max, scale),
          ),
        );
      } else if (e.key === "PageUp") {
        e.preventDefault();
        onChange(
          clampValue(
            normToValue(Math.min(1, currentNorm + coarseNorm), min, max, scale),
          ),
        );
      } else if (e.key === "PageDown") {
        e.preventDefault();
        onChange(
          clampValue(
            normToValue(Math.max(0, currentNorm - coarseNorm), min, max, scale),
          ),
        );
      } else if (e.key === "Home") {
        e.preventDefault();
        onChange(min);
      } else if (e.key === "End") {
        e.preventDefault();
        onChange(max);
      }
    },
    [clampValue, max, min, onChange, value, scale],
  );

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
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${displayVal}${unit}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        onBlur={handlePointerUp}
        className="border-border bg-surface-alt focus:ring-accent/60 relative cursor-grab rounded-full border focus:ring-2 focus:outline-none active:cursor-grabbing"
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
