/**
 * SynthPanel — collapsible UI panel for a single synth engine.
 * Renders the controls specific to each synth type (FM, Subtractive, Granular)
 * along with shared ADSR and gain controls.
 */

import { useId, useState } from "react";
import { Slider } from "./Slider";
import { Knob } from "./Knob";
import { ADSREnvelope } from "./ADSREnvelope";
import type { FMSynthParams } from "../synth/useFMSynth";
import type { SubtractiveSynthParams } from "../synth/useSubtractiveSynth";
import type { GranularSynthParams } from "../synth/useGranularSynth";

/* ── FM Synth Panel ── */

interface FMPanelProps {
  params: FMSynthParams;
  setParams: React.Dispatch<React.SetStateAction<FMSynthParams>>;
}

export function FMSynthPanel({ params, setParams }: FMPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  const update = <K extends keyof FMSynthParams>(
    key: K,
    value: FMSynthParams[K],
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              update("enabled", !params.enabled);
            }}
            aria-label={`Toggle FM Synth ${params.enabled ? "off" : "on"}`}
            aria-pressed={params.enabled}
            className={`h-2.5 w-2.5 rounded-full ${params.enabled ? "bg-success" : "bg-text-muted/30"}`}
            title={params.enabled ? "Enabled" : "Disabled"}
          />
          <h3 className="text-text text-sm font-semibold">FM Synth</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} FM Synth panel`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="text-text-muted hover:text-text rounded px-1 text-xs"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div id={contentId} className="space-y-3 px-3 pb-3">
          {/* Gain */}
          <Slider
            label="Gain"
            min={0}
            max={1}
            step={0.01}
            value={params.gain}
            onChange={(v) => update("gain", v)}
          />

          {/* FM params */}
          <div className="flex flex-wrap justify-center gap-3">
            <Knob
              label="C:Ratio"
              min={0.5}
              max={8}
              value={params.carrierRatio}
              onChange={(v) => update("carrierRatio", v)}
            />
            <Knob
              label="M:Ratio"
              min={0.5}
              max={16}
              value={params.modRatio}
              onChange={(v) => update("modRatio", v)}
            />
            <Knob
              label="Mod Idx"
              min={0}
              max={2000}
              value={params.modIndex}
              onChange={(v) => update("modIndex", v)}
            />
          </div>

          {/* Carrier type */}
          <div className="flex flex-wrap items-center justify-center gap-1">
            <span className="text-text-muted text-[10px]">Carrier:</span>
            {(
              ["sine", "square", "sawtooth", "triangle"] as OscillatorType[]
            ).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => update("carrierType", t)}
                className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                  params.carrierType === t
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amp ADSR */}
          <div>
            <p className="text-text-muted mb-1 text-[10px]">Amp Envelope</p>
            <ADSREnvelope {...params.ampEnv} width={220} height={60} />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Slider
                label="A"
                min={0.005}
                max={2}
                step={0.005}
                value={params.ampEnv.attack}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, attack: v })
                }
                unit="s"
              />
              <Slider
                label="D"
                min={0.01}
                max={2}
                step={0.01}
                value={params.ampEnv.decay}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, decay: v })
                }
                unit="s"
              />
              <Slider
                label="S"
                min={0}
                max={1}
                step={0.01}
                value={params.ampEnv.sustain}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, sustain: v })
                }
              />
              <Slider
                label="R"
                min={0.01}
                max={3}
                step={0.01}
                value={params.ampEnv.release}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, release: v })
                }
                unit="s"
              />
            </div>
          </div>

          {/* Mod Envelope */}
          <div>
            <p className="text-text-muted mb-1 text-[10px]">
              Mod Index Envelope
            </p>
            <div className="grid grid-cols-2 gap-1">
              <Slider
                label="M.Atk"
                min={0.005}
                max={2}
                step={0.005}
                value={params.modEnv.attack}
                onChange={(v) =>
                  update("modEnv", { ...params.modEnv, attack: v })
                }
                unit="s"
              />
              <Slider
                label="M.Dec"
                min={0.01}
                max={2}
                step={0.01}
                value={params.modEnv.decay}
                onChange={(v) =>
                  update("modEnv", { ...params.modEnv, decay: v })
                }
                unit="s"
              />
              <Slider
                label="M.Sus"
                min={0}
                max={1}
                step={0.01}
                value={params.modEnv.sustain}
                onChange={(v) =>
                  update("modEnv", { ...params.modEnv, sustain: v })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Subtractive Synth Panel ── */

interface SubPanelProps {
  params: SubtractiveSynthParams;
  setParams: React.Dispatch<React.SetStateAction<SubtractiveSynthParams>>;
}

export function SubtractiveSynthPanel({ params, setParams }: SubPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  const update = <K extends keyof SubtractiveSynthParams>(
    key: K,
    value: SubtractiveSynthParams[K],
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              update("enabled", !params.enabled);
            }}
            aria-label={`Toggle Subtractive Synth ${params.enabled ? "off" : "on"}`}
            aria-pressed={params.enabled}
            className={`h-2.5 w-2.5 rounded-full ${params.enabled ? "bg-success" : "bg-text-muted/30"}`}
            title={params.enabled ? "Enabled" : "Disabled"}
          />
          <h3 className="text-text text-sm font-semibold">Subtractive</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} Subtractive panel`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="text-text-muted hover:text-text rounded px-1 text-xs"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div id={contentId} className="space-y-3 px-3 pb-3">
          <Slider
            label="Gain"
            min={0}
            max={1}
            step={0.01}
            value={params.gain}
            onChange={(v) => update("gain", v)}
          />

          {/* Osc type */}
          <div className="flex flex-wrap items-center justify-center gap-1">
            <span className="text-text-muted text-[10px]">Osc:</span>
            {(
              ["sawtooth", "square", "triangle", "sine"] as OscillatorType[]
            ).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => update("oscType", t)}
                className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
                  params.oscType === t
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Filter */}
          <div className="flex flex-wrap justify-center gap-3">
            <Knob
              label="Cutoff"
              min={20}
              max={15000}
              value={params.cutoff}
              onChange={(v) => update("cutoff", v)}
              unit="Hz"
            />
            <Knob
              label="Reso"
              min={0.1}
              max={30}
              value={params.resonance}
              onChange={(v) => update("resonance", v)}
            />
            <Knob
              label="Env Amt"
              min={0}
              max={10000}
              value={params.filterEnvAmt}
              onChange={(v) => update("filterEnvAmt", v)}
              unit="Hz"
            />
          </div>

          {/* Amp ADSR */}
          <div>
            <p className="text-text-muted mb-1 text-[10px]">Amp Envelope</p>
            <ADSREnvelope {...params.ampEnv} width={220} height={60} />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Slider
                label="A"
                min={0.005}
                max={2}
                step={0.005}
                value={params.ampEnv.attack}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, attack: v })
                }
                unit="s"
              />
              <Slider
                label="D"
                min={0.01}
                max={2}
                step={0.01}
                value={params.ampEnv.decay}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, decay: v })
                }
                unit="s"
              />
              <Slider
                label="S"
                min={0}
                max={1}
                step={0.01}
                value={params.ampEnv.sustain}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, sustain: v })
                }
              />
              <Slider
                label="R"
                min={0.01}
                max={3}
                step={0.01}
                value={params.ampEnv.release}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, release: v })
                }
                unit="s"
              />
            </div>
          </div>

          {/* Filter ADSR */}
          <div>
            <p className="text-text-muted mb-1 text-[10px]">Filter Envelope</p>
            <ADSREnvelope {...params.filterEnv} width={220} height={60} />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Slider
                label="F.A"
                min={0.005}
                max={2}
                step={0.005}
                value={params.filterEnv.attack}
                onChange={(v) =>
                  update("filterEnv", { ...params.filterEnv, attack: v })
                }
                unit="s"
              />
              <Slider
                label="F.D"
                min={0.01}
                max={2}
                step={0.01}
                value={params.filterEnv.decay}
                onChange={(v) =>
                  update("filterEnv", { ...params.filterEnv, decay: v })
                }
                unit="s"
              />
              <Slider
                label="F.S"
                min={0}
                max={1}
                step={0.01}
                value={params.filterEnv.sustain}
                onChange={(v) =>
                  update("filterEnv", { ...params.filterEnv, sustain: v })
                }
              />
              <Slider
                label="F.R"
                min={0.01}
                max={3}
                step={0.01}
                value={params.filterEnv.release}
                onChange={(v) =>
                  update("filterEnv", { ...params.filterEnv, release: v })
                }
                unit="s"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Granular Synth Panel ── */

interface GranPanelProps {
  params: GranularSynthParams;
  setParams: React.Dispatch<React.SetStateAction<GranularSynthParams>>;
}

export function GranularSynthPanel({ params, setParams }: GranPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  const update = <K extends keyof GranularSynthParams>(
    key: K,
    value: GranularSynthParams[K],
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              update("enabled", !params.enabled);
            }}
            aria-label={`Toggle Granular Synth ${params.enabled ? "off" : "on"}`}
            aria-pressed={params.enabled}
            className={`h-2.5 w-2.5 rounded-full ${params.enabled ? "bg-success" : "bg-text-muted/30"}`}
            title={params.enabled ? "Enabled" : "Disabled"}
          />
          <h3 className="text-text text-sm font-semibold">Granular</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} Granular panel`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="text-text-muted hover:text-text rounded px-1 text-xs"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div id={contentId} className="space-y-3 px-3 pb-3">
          <Slider
            label="Gain"
            min={0}
            max={1}
            step={0.01}
            value={params.gain}
            onChange={(v) => update("gain", v)}
          />

          {/* Grain controls */}
          <div className="flex flex-wrap justify-center gap-3">
            <Knob
              label="Size"
              min={10}
              max={200}
              value={params.grainSize}
              onChange={(v) => update("grainSize", v)}
              unit="ms"
            />
            <Knob
              label="Density"
              min={1}
              max={50}
              value={params.density}
              onChange={(v) => update("density", v)}
              unit="/s"
            />
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Slider
              label="Position"
              min={0}
              max={1}
              step={0.01}
              value={params.position}
              onChange={(v) => update("position", v)}
            />
            <Slider
              label="Pos Rand"
              min={0}
              max={1}
              step={0.01}
              value={params.posRand}
              onChange={(v) => update("posRand", v)}
            />
            <Slider
              label="Pitch Rand"
              min={0}
              max={1}
              step={0.01}
              value={params.pitchRand}
              onChange={(v) => update("pitchRand", v)}
            />
          </div>

          {/* Amp ADSR */}
          <div>
            <p className="text-text-muted mb-1 text-[10px]">Amp Envelope</p>
            <ADSREnvelope {...params.ampEnv} width={220} height={60} />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Slider
                label="A"
                min={0.005}
                max={2}
                step={0.005}
                value={params.ampEnv.attack}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, attack: v })
                }
                unit="s"
              />
              <Slider
                label="D"
                min={0.01}
                max={2}
                step={0.01}
                value={params.ampEnv.decay}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, decay: v })
                }
                unit="s"
              />
              <Slider
                label="S"
                min={0}
                max={1}
                step={0.01}
                value={params.ampEnv.sustain}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, sustain: v })
                }
              />
              <Slider
                label="R"
                min={0.01}
                max={3}
                step={0.01}
                value={params.ampEnv.release}
                onChange={(v) =>
                  update("ampEnv", { ...params.ampEnv, release: v })
                }
                unit="s"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
