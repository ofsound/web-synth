/**
 * EffectCard — individual effect control card for the effects rack.
 * Displays effect name, enable toggle, effect-specific controls,
 * and up/down reorder buttons.
 */

import { memo } from "react";
import { Slider } from "./Slider";
import type { DelayParams } from "../effects/useDelay";
import type { PhaserParams } from "../effects/usePhaser";
import type { BitcrusherParams } from "../effects/useBitcrusher";

interface EffectCardShellProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: React.ReactNode;
}

function EffectCardShell({
  label,
  enabled,
  onToggle,
  onMoveUp,
  onMoveDown,
  children,
}: EffectCardShellProps) {
  return (
    <div
      className={`border-border rounded-lg border p-3 transition-opacity ${
        enabled ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={enabled ? `Bypass ${label}` : `Enable ${label}`}
            aria-pressed={enabled}
            className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-accent" : "bg-text-muted/30"}`}
            title={
              enabled
                ? "Enabled — click to bypass"
                : "Bypassed — click to enable"
            }
          />
          <span className="text-text text-xs font-semibold">{label}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            aria-label={`Move ${label} up`}
            className="border-border text-text-muted hover:text-text rounded border px-1 py-0.5 text-[10px]"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            aria-label={`Move ${label} down`}
            className="border-border text-text-muted hover:text-text rounded border px-1 py-0.5 text-[10px]"
          >
            ▼
          </button>
        </div>
      </div>
      {enabled && <div className="space-y-1">{children}</div>}
    </div>
  );
}

/* ── Delay Card ── */

interface DelayCardProps {
  params: DelayParams;
  setParams: React.Dispatch<React.SetStateAction<DelayParams>>;
  enabled: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const DelayCard = memo(function DelayCard({
  params,
  setParams,
  enabled,
  onToggle,
  onMoveUp,
  onMoveDown,
}: DelayCardProps) {
  return (
    <EffectCardShell
      label="Delay / Echo"
      enabled={enabled}
      onToggle={onToggle}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    >
      <Slider
        label="Time"
        min={0}
        max={1}
        step={0.01}
        value={params.delayTime}
        onChange={(v) => setParams((p) => ({ ...p, delayTime: v }))}
        unit="s"
      />
      <Slider
        label="Feedback"
        min={0}
        max={0.95}
        step={0.01}
        value={params.feedback}
        onChange={(v) => setParams((p) => ({ ...p, feedback: v }))}
      />
      <Slider
        label="Mix"
        min={0}
        max={1}
        step={0.01}
        value={params.mix}
        onChange={(v) => setParams((p) => ({ ...p, mix: v }))}
      />
    </EffectCardShell>
  );
});

/* ── Phaser Card ── */

interface PhaserCardProps {
  params: PhaserParams;
  setParams: React.Dispatch<React.SetStateAction<PhaserParams>>;
  enabled: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const PhaserCard = memo(function PhaserCard({
  params,
  setParams,
  enabled,
  onToggle,
  onMoveUp,
  onMoveDown,
}: PhaserCardProps) {
  return (
    <EffectCardShell
      label="Phaser"
      enabled={enabled}
      onToggle={onToggle}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    >
      <Slider
        label="Rate"
        min={0.1}
        max={5}
        step={0.01}
        value={params.rate}
        onChange={(v) => setParams((p) => ({ ...p, rate: v }))}
        unit="Hz"
      />
      <Slider
        label="Depth"
        min={0}
        max={1}
        step={0.01}
        value={params.depth}
        onChange={(v) => setParams((p) => ({ ...p, depth: v }))}
      />
      <Slider
        label="Feedback"
        min={0}
        max={0.9}
        step={0.01}
        value={params.feedback}
        onChange={(v) => setParams((p) => ({ ...p, feedback: v }))}
      />
    </EffectCardShell>
  );
});

/* ── Bitcrusher Card ── */

interface BitcrusherCardProps {
  params: BitcrusherParams;
  setParams: React.Dispatch<React.SetStateAction<BitcrusherParams>>;
  enabled: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const BitcrusherCard = memo(function BitcrusherCard({
  params,
  setParams,
  enabled,
  onToggle,
  onMoveUp,
  onMoveDown,
}: BitcrusherCardProps) {
  return (
    <EffectCardShell
      label="Bitcrusher"
      enabled={enabled}
      onToggle={onToggle}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    >
      <Slider
        label="Bits"
        min={1}
        max={16}
        step={1}
        value={params.bits}
        onChange={(v) => setParams((p) => ({ ...p, bits: v }))}
        unit="bit"
      />
      <Slider
        label="Mix"
        min={0}
        max={1}
        step={0.01}
        value={params.mix}
        onChange={(v) => setParams((p) => ({ ...p, mix: v }))}
      />
    </EffectCardShell>
  );
});
