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
  return (
    <div
      className={`flex items-center gap-2 ${vertical ? "flex-col" : "flex-row"}`}
    >
      <label className="text-text-muted min-w-[4rem] text-xs">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`accent-accent ${vertical ? "h-24 -rotate-90" : "w-full"}`}
      />
      <span className="text-text min-w-[3.5rem] text-right text-xs tabular-nums">
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
