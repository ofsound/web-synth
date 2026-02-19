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

  const onNoteOn = useCallback(
    (note: number) => {
      midiBus.emit({ type: "noteon", channel: 0, note, velocity: 100 });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [midiBus],
  );

  const onNoteOff = useCallback(
    (note: number) => {
      midiBus.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [midiBus],
  );

  return (
    <PianoKeyboard
      startNote={startNote}
      endNote={endNote}
      onNoteOn={onNoteOn}
      onNoteOff={onNoteOff}
      activeNotes={activeNotes}
    />
  );
}
