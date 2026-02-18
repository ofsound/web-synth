interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
        value
          ? "border-accent bg-accent/20 text-accent"
          : "border-border bg-surface-alt text-text-muted"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          value ? "bg-accent" : "bg-text-muted/40"
        }`}
      />
      {label}
    </button>
  );
}
