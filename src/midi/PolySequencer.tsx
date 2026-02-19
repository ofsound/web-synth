/**
 * Polyphonic Step Sequencer — MIDI input source.
 *
 * A 16/32 step grid where each step can hold multiple MIDI notes (chords).
 * Features: per-step velocity, gate length, probability, swing, BPM control.
 * Emits noteOn/noteOff events to the shared MidiBus.
 *
 * Uses the Scheduler class (Chris Wilson look-ahead) for timing accuracy.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Scheduler } from "../utils/scheduler";
import { midiToNoteName } from "../utils/midiUtils";
import type { MidiBus } from "./MidiBus";
import { resolveMidiChannel } from "./channelPolicy";
import type { MidiChannelMode } from "./channelPolicy";

/* ── Types ── */

export interface StepData {
  notes: Set<number>; // MIDI note numbers active on this step
  velocity: number; // 0–127
  gate: number; // 0.1–1.0 (fraction of step duration)
  probability: number; // 0–100 (%)
}

function createEmptyStep(): StepData {
  return { notes: new Set(), velocity: 100, gate: 0.5, probability: 100 };
}

/* —— Scale definitions — intervals from root in semitones — */
const SCALES: Record<string, { label: string; intervals: number[] }> = {
  major: { label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  penta_maj: { label: "Penta Maj", intervals: [0, 2, 4, 7, 9] },
  penta_min: { label: "Penta Min", intervals: [0, 3, 5, 7, 10] },
  blues: { label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  chromatic: {
    label: "Chromatic",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
} as const;
const ROOT_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/* ── Memoised sub-components — isolate per-tick re-renders ── */

/**
 * Translucent column overlay that moves to the active step each tick.
 * Now driven imperatively via a forwarded ref — zero React re-renders.
 */
const StepHighlightOverlay = memo(function StepHighlightOverlay({
  highlightRef,
  rowCount,
}: {
  highlightRef: React.RefObject<HTMLDivElement | null>;
  rowCount: number;
}) {
  // 24px header + rowCount * 24px note rows + 20px per sub-row (vel/gate/prob)
  const height = 24 + rowCount * 24 + 3 * 20;
  return (
    <div
      ref={highlightRef}
      className="bg-accent/10 border-accent/30 pointer-events-none absolute top-0 w-8 border-x"
      style={{ height, display: "none" }}
      aria-hidden="true"
    />
  );
});

/** A single note-cell row — memoised, receives NO currentStep. */
const NoteRow = memo(function NoteRow({
  note,
  numSteps,
  stepNotes,
  onToggle,
}: {
  note: number;
  numSteps: number;
  /** Per-step active set for this note */
  stepNotes: boolean[];
  onToggle: (stepIdx: number, note: number) => void;
}) {
  return (
    <>
      {Array.from({ length: numSteps }, (_, stepIdx) => {
        const isActive = stepNotes[stepIdx];
        return (
          <button
            type="button"
            key={stepIdx}
            onClick={() => onToggle(stepIdx, note)}
            aria-label={`Toggle ${midiToNoteName(note)} on step ${stepIdx + 1}`}
            className={`h-6 w-8 shrink-0 border transition-colors ${
              isActive
                ? "border-accent/60 bg-accent/40"
                : stepIdx % 4 === 0
                  ? "border-border bg-surface-alt"
                  : "border-border/50 bg-surface"
            }`}
          />
        );
      })}
    </>
  );
});

/* ── Component ── */

interface PolySequencerProps {
  midiBus: MidiBus;
  ctx: AudioContext | null;
  channelMode?: MidiChannelMode;
  sourceChannel?: number;
  normalizedChannel?: number;
  onTransportStopRegister?: (stop: (() => void) | null) => void;
}

export function PolySequencer({
  midiBus,
  ctx,
  channelMode = "normalized",
  sourceChannel = 0,
  normalizedChannel = 0,
  onTransportStopRegister,
}: PolySequencerProps) {
  const idBase = useId();
  const bpmInputId = `${idBase}-bpm`;
  const stepsSelectId = `${idBase}-steps`;
  const swingInputId = `${idBase}-swing`;

  const [numSteps, setNumSteps] = useState(16);
  const [bpm, setBpm] = useState(120);
  const [swing, setSwing] = useState(0); // 0–0.5
  const [playing, setPlaying] = useState(false);
  const currentStepRef = useRef(-1);
  const highlightRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);

  // Scale and root note — determine which MIDI notes the grid rows represent
  const [scaleName, setScaleName] = useState<keyof typeof SCALES>("major");
  const [rootNote, setRootNote] = useState(0); // 0 = C

  // Row notes derived from the selected scale + root (base octave: C3 = MIDI 48)
  const rowNotes = useMemo(() => {
    const { intervals } = SCALES[scaleName];
    const base = 48 + rootNote;
    return intervals.map((i) => base + i).filter((n) => n >= 0 && n <= 127);
  }, [scaleName, rootNote]);

  // Grid: array of StepData, one per step
  const [steps, setSteps] = useState<StepData[]>(() =>
    Array.from({ length: 32 }, () => createEmptyStep()),
  );

  // Refs for scheduler callbacks
  const stepsRef = useRef(steps);
  const swingRef = useRef(swing);
  const schedulerRef = useRef<Scheduler | null>(null);
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeSequencerNotesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    swingRef.current = swing;
  }, [swing]);

  // Update scheduler tempo
  useEffect(() => {
    if (schedulerRef.current) schedulerRef.current.setTempo(bpm);
  }, [bpm]);

  const clearPendingTimeouts = useCallback(() => {
    for (const id of pendingTimeoutsRef.current) {
      clearTimeout(id);
    }
    pendingTimeoutsRef.current = [];
  }, []);

  const flushSequencerNotes = useCallback(() => {
    const channel = resolveMidiChannel({
      mode: channelMode,
      sourceChannel,
      normalizedChannel,
    });
    for (const note of activeSequencerNotesRef.current) {
      midiBus.emit({
        type: "noteoff",
        channel,
        note,
        velocity: 0,
      });
    }
    activeSequencerNotesRef.current.clear();
  }, [channelMode, midiBus, normalizedChannel, sourceChannel]);

  const scheduleEvent = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(
      () => {
        fn();
        pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter(
          (t) => t !== id,
        );
      },
      Math.max(0, delayMs),
    );
    pendingTimeoutsRef.current.push(id);
  }, []);

  /** Toggle a note in a step */
  const toggleNote = useCallback((stepIdx: number, note: number) => {
    setSteps((prev) => {
      const copy = [...prev];
      const step = { ...copy[stepIdx], notes: new Set(copy[stepIdx].notes) };
      if (step.notes.has(note)) {
        step.notes.delete(note);
      } else {
        step.notes.add(note);
      }
      copy[stepIdx] = step;
      return copy;
    });
  }, []);

  /** Update per-step velocity */
  const setStepVelocity = useCallback((stepIdx: number, vel: number) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[stepIdx] = { ...copy[stepIdx], velocity: vel };
      return copy;
    });
  }, []);

  /** Update per-step gate */
  const setStepGate = useCallback((stepIdx: number, gate: number) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[stepIdx] = { ...copy[stepIdx], gate };
      return copy;
    });
  }, []);

  /** Update per-step probability */
  const setStepProbability = useCallback((stepIdx: number, prob: number) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[stepIdx] = { ...copy[stepIdx], probability: prob };
      return copy;
    });
  }, []);

  // Scheduler callback ref
  const onStepRef = useRef<(time: number, step: number) => void>(() => {});

  useEffect(() => {
    onStepRef.current = (time: number, step: number) => {
      const wrappedStep = step % numSteps;
      // Imperatively update highlight + headers (no React re-render)
      currentStepRef.current = wrappedStep;
      if (highlightRef.current) {
        highlightRef.current.style.display = "";
        highlightRef.current.style.left = `${48 + wrappedStep * 32}px`;
      }
      if (headerRowRef.current) {
        const children = headerRowRef.current.children;
        for (let c = 1; c < children.length; c++) {
          const el = children[c] as HTMLElement;
          if (c - 1 === wrappedStep) {
            el.classList.add("text-accent", "font-bold");
            el.classList.remove("text-text-muted");
          } else {
            el.classList.remove("text-accent", "font-bold");
            el.classList.add("text-text-muted");
          }
        }
      }

      const data = stepsRef.current[wrappedStep];
      if (!data || data.notes.size === 0) return;

      // Probability check
      if (Math.random() * 100 > data.probability) return;

      // Swing: delay even-numbered steps
      let swingOffset = 0;
      if (wrappedStep % 2 === 1 && swingRef.current > 0) {
        const stepDuration = 60 / (bpm * 4); // 16th note duration
        swingOffset = swingRef.current * stepDuration;
      }

      const stepDuration = 60 / (bpm * 4);
      const gateTime = stepDuration * data.gate;
      const channel = resolveMidiChannel({
        mode: channelMode,
        sourceChannel,
        normalizedChannel,
      });

      // Align note timing to the scheduler's audio-time clock.
      // Use getOutputTimestamp() for better accuracy between audio and document time
      const audioTs = ctx?.getOutputTimestamp?.() ?? {
        contextTime: ctx?.currentTime ?? 0,
      };
      const now = audioTs.contextTime ?? ctx?.currentTime ?? 0;
      const startDelaySec = Math.max(0, time + swingOffset - now);
      const noteOnDelayMs = startDelaySec * 1000;
      // Floor the note-off delay so it can’t arrive before note-on under timer drift.
      const noteOffDelayMs = Math.max(
        noteOnDelayMs + 20,
        (startDelaySec + gateTime) * 1000,
      );

      for (const note of data.notes) {
        // Schedule noteOn and noteOff using scheduler-aligned delays.
        scheduleEvent(() => {
          midiBus.emit({
            type: "noteon",
            channel,
            note,
            velocity: data.velocity,
          });
          activeSequencerNotesRef.current.add(note);
        }, noteOnDelayMs);

        scheduleEvent(() => {
          midiBus.emit({
            type: "noteoff",
            channel,
            note,
            velocity: 0,
          });
          activeSequencerNotesRef.current.delete(note);
        }, noteOffDelayMs);
      }
    };
  }, [
    numSteps,
    bpm,
    midiBus,
    ctx,
    scheduleEvent,
    channelMode,
    sourceChannel,
    normalizedChannel,
  ]);

  const stopTransport = useCallback(() => {
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!onTransportStopRegister) return;
    onTransportStopRegister(stopTransport);
    return () => {
      onTransportStopRegister(null);
    };
  }, [onTransportStopRegister, stopTransport]);

  // Start / Stop
  useEffect(() => {
    if (!ctx) return;

    // Capture DOM refs for use in the cleanup to avoid stale-ref lint warning.
    const highlightEl = highlightRef.current;
    const headerEl = headerRowRef.current;

    if (playing) {
      const scheduler = new Scheduler(
        ctx,
        (time, step) => onStepRef.current(time, step),
        // Use MAX_SAFE_INTEGER so the scheduler's internal step counter never
        // wraps mid-pattern.  The sequencer handles its own step % numSteps
        // wrapping via `wrappedStep` in the onStep callback.
        { tempo: bpm, totalSteps: Number.MAX_SAFE_INTEGER, subdivision: 0.25 },
      );
      scheduler.start();
      schedulerRef.current = scheduler;

      return () => {
        scheduler.stop();
        schedulerRef.current = null;
        clearPendingTimeouts();
        flushSequencerNotes();
        currentStepRef.current = -1;
        if (highlightEl) highlightEl.style.display = "none";
        if (headerEl) {
          for (let c = 1; c < headerEl.children.length; c++) {
            const el = headerEl.children[c] as HTMLElement;
            el.classList.remove("text-accent", "font-bold");
            el.classList.add("text-text-muted");
          }
        }
      };
    } else {
      if (schedulerRef.current) {
        schedulerRef.current.stop();
        schedulerRef.current = null;
      }
      clearPendingTimeouts();
      flushSequencerNotes();
      queueMicrotask(() => {
        currentStepRef.current = -1;
        if (highlightRef.current) highlightRef.current.style.display = "none";
        if (headerRowRef.current) {
          for (let c = 1; c < headerRowRef.current.children.length; c++) {
            const el = headerRowRef.current.children[c] as HTMLElement;
            el.classList.remove("text-accent", "font-bold");
            el.classList.add("text-text-muted");
          }
        }
      });
    }
    // NOTE: `bpm` is intentionally excluded — tempo changes are handled via
    // scheduler.setTempo() in a separate effect to avoid restarting playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, playing, clearPendingTimeouts, flushSequencerNotes]);

  /** Clear all steps */
  const clearAll = useCallback(() => {
    setSteps(Array.from({ length: 32 }, () => createEmptyStep()));
  }, []);

  /** Randomise pattern */
  const randomize = useCallback(() => {
    setSteps((prev) =>
      prev.map((_step, i) => {
        if (i >= numSteps) return createEmptyStep();
        const notes = new Set<number>();
        for (const n of rowNotes) {
          if (Math.random() < 0.25) notes.add(n);
        }
        return {
          notes,
          velocity: 60 + Math.floor(Math.random() * 67),
          gate: 0.2 + Math.random() * 0.6,
          probability: 70 + Math.floor(Math.random() * 30),
        };
      }),
    );
  }, [numSteps, rowNotes]);

  return (
    <div className="space-y-3">
      {/* Transport controls */}
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="border-border bg-surface-alt/40 flex flex-wrap items-end gap-2 rounded border p-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={`rounded border px-3 py-2 text-sm font-medium ${
              playing
                ? "border-accent bg-accent/20 text-accent"
                : "border-border text-text-muted"
            }`}
          >
            {playing ? "■ Stop" : "▶ Play"}
          </button>

          <div className="flex items-center gap-2">
            <label htmlFor={bpmInputId} className="text-text-muted text-xs">
              BPM
            </label>
            <input
              id={bpmInputId}
              name="bpm"
              aria-label="Sequencer BPM"
              type="number"
              min={40}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="border-border bg-surface-alt text-text w-20 rounded border px-2 py-1.5 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={stepsSelectId} className="text-text-muted text-xs">
              Steps
            </label>
            <select
              id={stepsSelectId}
              name="steps"
              aria-label="Sequencer steps"
              value={numSteps}
              onChange={(e) => setNumSteps(Number(e.target.value))}
              className="border-border bg-surface-alt text-text rounded border px-2 py-1.5 text-sm"
            >
              <option value={8}>8</option>
              <option value={16}>16</option>
              <option value={32}>32</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={swingInputId} className="text-text-muted text-xs">
              Swing
            </label>
            <input
              id={swingInputId}
              name="swing"
              aria-label="Sequencer swing amount"
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={swing}
              onChange={(e) => setSwing(Number(e.target.value))}
              className="accent-accent h-6 w-28"
            />
            <span className="text-text-muted w-10 text-xs">
              {Math.round(swing * 200)}%
            </span>
          </div>
        </div>

        <div className="border-border bg-surface-alt/40 flex flex-wrap items-end gap-2 rounded border p-2">
          <button
            type="button"
            onClick={randomize}
            className="border-border text-text-muted hover:text-text rounded border px-3 py-1.5 text-xs"
          >
            Randomize
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="border-border text-text-muted hover:text-text rounded border px-3 py-1.5 text-xs"
          >
            Clear
          </button>

          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Scale</span>
            <select
              id={`${idBase}-scale`}
              value={scaleName as string}
              onChange={(e) =>
                setScaleName(e.target.value as keyof typeof SCALES)
              }
              aria-label="Sequencer scale"
              name="scale"
              className="border-border bg-surface-alt text-text rounded border px-2 py-1.5 text-sm"
            >
              {Object.entries(SCALES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              id={`${idBase}-root-note`}
              value={rootNote}
              onChange={(e) => setRootNote(Number(e.target.value))}
              aria-label="Sequencer root note"
              name="root-note"
              className="border-border bg-surface-alt text-text rounded border px-2 py-1.5 text-sm"
            >
              {ROOT_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Step grid */}
      <div className="overflow-x-auto">
        <div className="relative inline-block min-w-full">
          {/* Current-step overlay — driven imperatively, zero re-renders */}
          <StepHighlightOverlay
            highlightRef={highlightRef}
            rowCount={rowNotes.length}
          />

          {/* Column headers (step numbers) — highlight toggled imperatively */}
          <div ref={headerRowRef} className="flex">
            <div className="w-12 shrink-0" /> {/* Row label spacer */}
            {Array.from({ length: numSteps }, (_, i) => (
              <div
                key={i}
                className="text-text-muted flex h-6 w-8 shrink-0 items-center justify-center text-[10px]"
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Note rows — memoised; do NOT depend on currentStep */}
          {[...rowNotes].reverse().map((note) => {
            const stepNotes = Array.from({ length: numSteps }, (_, idx) =>
              steps[idx].notes.has(note),
            );
            return (
              <div key={note} className="flex">
                <div className="text-text-muted flex w-12 shrink-0 items-center text-xs">
                  {midiToNoteName(note)}
                </div>
                <NoteRow
                  note={note}
                  numSteps={numSteps}
                  stepNotes={stepNotes}
                  onToggle={toggleNote}
                />
              </div>
            );
          })}

          {/* Per-step velocity row */}
          <div className="mt-1 flex">
            <div className="text-text-muted flex w-12 shrink-0 items-center text-[10px]">
              Vel
            </div>
            {Array.from({ length: numSteps }, (_, i) => (
              <div key={i} className="flex w-8 shrink-0 justify-center">
                <input
                  id={`${idBase}-vel-${i}`}
                  name={`step-${i + 1}-velocity`}
                  aria-label={`Step ${i + 1} velocity`}
                  type="range"
                  min={0}
                  max={127}
                  value={steps[i].velocity}
                  onChange={(e) => setStepVelocity(i, Number(e.target.value))}
                  className="accent-accent h-7 w-7 cursor-pointer"
                  style={{ writingMode: "vertical-lr" as never }}
                  title={`Vel: ${steps[i].velocity}`}
                />
              </div>
            ))}
          </div>

          {/* Per-step gate row */}
          <div className="flex">
            <div className="text-text-muted flex w-12 shrink-0 items-center text-[10px]">
              Gate
            </div>
            {Array.from({ length: numSteps }, (_, i) => (
              <div key={i} className="flex w-8 shrink-0 justify-center">
                <button
                  type="button"
                  className="border-border bg-surface-alt mt-0.5 flex h-4 w-7 items-center rounded-sm border px-0.5"
                  title={`Gate: ${Math.round(steps[i].gate * 100)}%`}
                  aria-label={`Step ${i + 1} gate ${Math.round(steps[i].gate * 100)} percent`}
                  onClick={() => {
                    const next =
                      steps[i].gate >= 0.9 ? 0.1 : steps[i].gate + 0.2;
                    setStepGate(i, Math.min(next, 1));
                  }}
                >
                  <span
                    className="bg-accent/50 block h-2 rounded-xs"
                    style={{ width: `${Math.max(2, steps[i].gate * 24)}px` }}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Per-step probability row */}
          <div className="flex">
            <div className="text-text-muted flex w-12 shrink-0 items-center text-[10px]">
              Prob
            </div>
            {Array.from({ length: numSteps }, (_, i) => (
              <div key={i} className="flex w-8 shrink-0 justify-center">
                <button
                  type="button"
                  className="border-border bg-surface-alt mt-0.5 flex h-4 w-7 items-center rounded-sm border px-0.5"
                  title={`Prob: ${steps[i].probability}%`}
                  aria-label={`Step ${i + 1} probability ${steps[i].probability} percent`}
                  onClick={() => {
                    const next =
                      steps[i].probability >= 100
                        ? 25
                        : steps[i].probability + 25;
                    setStepProbability(i, Math.min(next, 100));
                  }}
                >
                  <span
                    className={`block h-2 rounded-xs ${
                      steps[i].probability >= 100
                        ? "bg-success/50"
                        : "bg-warning/50"
                    }`}
                    style={{
                      width: `${Math.max(2, (steps[i].probability / 100) * 24)}px`,
                    }}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
