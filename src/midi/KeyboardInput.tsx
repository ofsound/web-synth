/**
 * Piano keyboard MIDI input adapter.
 *
 * Wraps the existing PianoKeyboard component and emits
 * noteOn/noteOff events to the shared MidiBus.
 */

import { useCallback, useState } from "react";
import { PianoKeyboard } from "../components/PianoKeyboard";
import type { MidiBus } from "./MidiBus";

interface KeyboardInputProps {
  midiBus: MidiBus;
  startNote?: number;
  endNote?: number;
}

export function KeyboardInput({
  midiBus,
  startNote = 36, // C2
  endNote = 84, // C6
}: KeyboardInputProps) {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [latchMode, setLatchMode] = useState(false);

  const releaseAllActiveNotes = useCallback(() => {
    setActiveNotes((prev) => {
      if (prev.size === 0) return prev;
      for (const note of prev) {
        midiBus.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
      }
      return new Set();
    });
  }, [midiBus]);

  const onNoteOn = useCallback(
    (note: number) => {
      if (latchMode) {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          if (next.has(note)) {
            midiBus.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
            next.delete(note);
          } else {
            midiBus.emit({ type: "noteon", channel: 0, note, velocity: 100 });
            next.add(note);
          }
          return next;
        });
        return;
      }

      midiBus.emit({ type: "noteon", channel: 0, note, velocity: 100 });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [latchMode, midiBus],
  );

  const onNoteOff = useCallback(
    (note: number) => {
      if (latchMode) return;
      midiBus.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [latchMode, midiBus],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-text-muted text-xs">Touch</span>
        <button
          type="button"
          aria-label="Toggle keyboard latch mode"
          aria-pressed={latchMode}
          onClick={() => {
            setLatchMode((prev) => {
              const next = !prev;
              if (!next) releaseAllActiveNotes();
              return next;
            });
          }}
          className={`rounded border px-2 py-0.5 text-xs ${
            latchMode
              ? "border-accent text-accent"
              : "border-border text-text-muted"
          }`}
        >
          Latch {latchMode ? "On" : "Off"}
        </button>
      </div>

      <PianoKeyboard
        startNote={startNote}
        endNote={endNote}
        onNoteOn={onNoteOn}
        onNoteOff={onNoteOff}
        activeNotes={activeNotes}
      />
    </div>
  );
}
