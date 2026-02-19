/**
 * MappingModal — configure which MIDI source drives each visual target.
 *
 * Opened via the ⚙️ button in the visualiser toolbar.  Shows a list of
 * the active scene's mappings with dropdowns for source, curve, and range
 * sliders.
 */

import { useEffect, useId, useState } from "react";
import { MIDI_SOURCES, VISUAL_TARGETS, CURVES } from "./MidiMapper";
import type {
  MidiMapping,
  MidiSource,
  VisualTarget,
  CurveType,
} from "./MidiMapper";
import type { SceneMeta } from "./scenes";

interface Props {
  scene: SceneMeta;
  mappings: MidiMapping[];
  onChange: (mappings: MidiMapping[]) => void;
  onClose: () => void;
}

export function MappingModal({ scene, mappings, onChange, onClose }: Props) {
  const formIdBase = useId();

  // Local draft so we can edit without live-updating every keystroke
  const [draft, setDraft] = useState<MidiMapping[]>(() =>
    mappings.map((m) => ({ ...m, range: [...m.range] as [number, number] })),
  );

  const updateMapping = (idx: number, patch: Partial<MidiMapping>) => {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const addMapping = () => {
    const usedTargets = new Set(draft.map((m) => m.target));
    const available = VISUAL_TARGETS.filter((t) => !usedTargets.has(t));
    const target: VisualTarget = available[0] ?? "hue";
    setDraft((prev) => [
      ...prev,
      {
        source: "velocity" as MidiSource,
        target,
        range: [0, 1] as [number, number],
        curve: "linear" as CurveType,
      },
    ]);
  };

  const removeMapping = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  const reset = () => {
    setDraft(
      scene.defaultMappings.map((m) => ({
        ...m,
        range: [...m.range] as [number, number],
      })),
    );
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // Backdrop — NOT aria-hidden: it is a clickable close target.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-surface border-border w-full max-w-lg rounded-xl border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="midi-mapping-title"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3
            id="midi-mapping-title"
            className="text-text text-sm font-semibold"
          >
            MIDI Mapping — {scene.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close MIDI mapping settings"
            className="text-text-muted hover:text-text text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Mapping rows */}
        <div className="space-y-3">
          {draft.map((m, i) => (
            <div
              key={i}
              className="bg-surface-alt border-border flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs"
            >
              {/* Target */}
              <label
                htmlFor={`${formIdBase}-target-${i}`}
                className="text-text-muted w-16 shrink-0"
              >
                Target
              </label>
              <select
                id={`${formIdBase}-target-${i}`}
                name={`mapping-${i}-target`}
                aria-label={`Mapping row ${i + 1} target`}
                value={m.target}
                onChange={(e) =>
                  updateMapping(i, { target: e.target.value as VisualTarget })
                }
                className="bg-surface border-border text-text rounded border px-1.5 py-0.5 text-xs"
              >
                {VISUAL_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* Source */}
              <label
                htmlFor={`${formIdBase}-source-${i}`}
                className="text-text-muted ml-2 w-14 shrink-0"
              >
                Source
              </label>
              <select
                id={`${formIdBase}-source-${i}`}
                name={`mapping-${i}-source`}
                aria-label={`Mapping row ${i + 1} source`}
                value={m.source}
                onChange={(e) =>
                  updateMapping(i, { source: e.target.value as MidiSource })
                }
                className="bg-surface border-border text-text rounded border px-1.5 py-0.5 text-xs"
              >
                {MIDI_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* CC number (only when source=cc) */}
              {m.source === "cc" && (
                <>
                  <label
                    htmlFor={`${formIdBase}-cc-${i}`}
                    className="text-text-muted ml-2"
                  >
                    CC#
                  </label>
                  <input
                    id={`${formIdBase}-cc-${i}`}
                    name={`mapping-${i}-cc`}
                    aria-label={`Mapping row ${i + 1} CC number`}
                    type="number"
                    min={0}
                    max={127}
                    value={m.ccNumber ?? 1}
                    onChange={(e) =>
                      updateMapping(i, {
                        ccNumber: parseInt(e.target.value, 10),
                      })
                    }
                    className="bg-surface border-border text-text w-12 rounded border px-1 py-0.5 text-xs"
                  />
                </>
              )}

              {/* Curve */}
              <label
                htmlFor={`${formIdBase}-curve-${i}`}
                className="text-text-muted ml-2 w-12 shrink-0"
              >
                Curve
              </label>
              <select
                id={`${formIdBase}-curve-${i}`}
                name={`mapping-${i}-curve`}
                aria-label={`Mapping row ${i + 1} curve`}
                value={m.curve}
                onChange={(e) =>
                  updateMapping(i, { curve: e.target.value as CurveType })
                }
                className="bg-surface border-border text-text rounded border px-1.5 py-0.5 text-xs"
              >
                {CURVES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Range */}
              <label
                htmlFor={`${formIdBase}-range-min-${i}`}
                className="text-text-muted ml-2"
              >
                Range
              </label>
              <input
                id={`${formIdBase}-range-min-${i}`}
                name={`mapping-${i}-range-min`}
                aria-label={`Mapping row ${i + 1} range minimum`}
                type="number"
                step={0.05}
                min={0}
                max={10}
                value={m.range[0]}
                onChange={(e) =>
                  updateMapping(i, {
                    range: [parseFloat(e.target.value), m.range[1]],
                  })
                }
                className="bg-surface border-border text-text w-14 rounded border px-1 py-0.5 text-xs"
              />
              <span className="text-text-muted">–</span>
              <input
                id={`${formIdBase}-range-max-${i}`}
                name={`mapping-${i}-range-max`}
                aria-label={`Mapping row ${i + 1} range maximum`}
                type="number"
                step={0.05}
                min={0}
                max={10}
                value={m.range[1]}
                onChange={(e) =>
                  updateMapping(i, {
                    range: [m.range[0], parseFloat(e.target.value)],
                  })
                }
                className="bg-surface border-border text-text w-14 rounded border px-1 py-0.5 text-xs"
              />

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeMapping(i)}
                className="text-danger hover:text-danger/80 ml-auto text-sm"
                title="Remove mapping"
                aria-label={`Remove mapping row ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={addMapping}
            className="border-border text-text-muted hover:text-text rounded border px-3 py-1 text-xs"
          >
            + Add Mapping
          </button>
          <button
            type="button"
            onClick={reset}
            className="border-border text-text-muted hover:text-text rounded border px-3 py-1 text-xs"
          >
            Reset Defaults
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="border-border text-text-muted rounded border px-3 py-1 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="bg-accent hover:bg-accent-hover rounded px-4 py-1 text-xs font-medium text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
