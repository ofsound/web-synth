import { useId } from "react";

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  vertical?: boolean;
}

export function Slider({
  label,
  min,
  max,
  step = 0.01,
  value,
  onChange,
  unit = "",
  vertical = false,
}: SliderProps) {
  const inputId = useId();

  return (
    <div
      className={`flex items-center gap-3 py-1 ${vertical ? "flex-col" : "flex-row"}`}
    >
      <label htmlFor={inputId} className="text-text-muted min-w-20 text-sm">
        {label}
      </label>
      <input
        id={inputId}
        name={label.toLowerCase().replace(/\s+/g, "-")}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`accent-accent cursor-pointer ${
          vertical ? "h-28 -rotate-90" : "h-6 w-full"
        } [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-1.25 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2`}
      />
      <span className="text-text min-w-16 text-right text-sm tabular-nums">
        {typeof value === "number"
          ? value >= 1000
            ? `${(value / 1000).toFixed(1)}k`
            : Number.isInteger(step)
              ? value
              : value.toFixed(2)
          : value}
        {unit}
      </span>
    </div>
  );
}
