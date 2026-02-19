/**
 * Piano keyboard MIDI input adapter.
 *
 * Wraps the existing PianoKeyboard component and emits
 * noteOn/noteOff events to the shared MidiBus.
 */

import { useCallback, useState } from "react";
import { PianoKeyboard } from "../components/PianoKeyboard";
import type { MidiBus } from "./MidiBus";
import { resolveMidiChannel } from "./channelPolicy";
import type { MidiChannelMode } from "./channelPolicy";

interface KeyboardInputProps {
  midiBus: MidiBus;
  startNote?: number;
  endNote?: number;
  channelMode?: MidiChannelMode;
  sourceChannel?: number;
  normalizedChannel?: number;
}

export function KeyboardInput({
  midiBus,
  startNote = 36, // C2
  endNote = 84, // C6
  channelMode = "normalized",
  sourceChannel = 0,
  normalizedChannel = 0,
}: KeyboardInputProps) {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [latchMode, setLatchMode] = useState(false);

  const releaseAllActiveNotes = useCallback(() => {
    const channel = resolveMidiChannel({
      mode: channelMode,
      sourceChannel,
      normalizedChannel,
    });
    setActiveNotes((prev) => {
      if (prev.size === 0) return prev;
      for (const note of prev) {
        midiBus.emit({ type: "noteoff", channel, note, velocity: 0 });
      }
      return new Set();
    });
  }, [channelMode, midiBus, normalizedChannel, sourceChannel]);

  const onNoteOn = useCallback(
    (note: number) => {
      const channel = resolveMidiChannel({
        mode: channelMode,
        sourceChannel,
        normalizedChannel,
      });
      if (latchMode) {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          if (next.has(note)) {
            midiBus.emit({ type: "noteoff", channel, note, velocity: 0 });
            next.delete(note);
          } else {
            midiBus.emit({ type: "noteon", channel, note, velocity: 100 });
            next.add(note);
          }
          return next;
        });
        return;
      }

      midiBus.emit({ type: "noteon", channel, note, velocity: 100 });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [channelMode, latchMode, midiBus, normalizedChannel, sourceChannel],
  );

  const onNoteOff = useCallback(
    (note: number) => {
      if (latchMode) return;
      const channel = resolveMidiChannel({
        mode: channelMode,
        sourceChannel,
        normalizedChannel,
      });
      midiBus.emit({ type: "noteoff", channel, note, velocity: 0 });
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [channelMode, latchMode, midiBus, normalizedChannel, sourceChannel],
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
