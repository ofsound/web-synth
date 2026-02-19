import { useCallback, useMemo } from "react";
import { isBlackKey, midiToNoteName } from "../utils/midiUtils";

interface PianoKeyboardProps {
  startNote?: number; /* MIDI note number */
  endNote?: number;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
  activeNotes?: Set<number>;
}

export function PianoKeyboard({
  startNote = 48 /* C3 */,
  endNote = 72 /* C5 */,
  onNoteOn,
  onNoteOff,
  activeNotes = new Set(),
}: PianoKeyboardProps) {
  const notes = useMemo(() => {
    const arr: number[] = [];
    for (let n = startNote; n <= endNote; n++) arr.push(n);
    return arr;
  }, [startNote, endNote]);

  const whiteNotes = useMemo(
    () => notes.filter((n) => !isBlackKey(n)),
    [notes],
  );
  const blackNotes = useMemo(() => notes.filter((n) => isBlackKey(n)), [notes]);

  const whiteKeyWidth = useMemo(() => 100 / whiteNotes.length, [whiteNotes]);

  /* Compute x-position for a black key based on its left white-key index */
  const getBlackKeyX = useCallback(
    (note: number) => {
      const prevWhiteNote = note - 1;
      const whiteIdx = whiteNotes.indexOf(prevWhiteNote);
      if (whiteIdx === -1) return -1;
      return (whiteIdx + 1) * whiteKeyWidth - whiteKeyWidth * 0.3;
    },
    [whiteNotes, whiteKeyWidth],
  );

  return (
    <div className="border-border bg-surface relative h-32 w-full overflow-hidden rounded border select-none">
      {/* White keys */}
      {whiteNotes.map((note, i) => (
        <button
          key={note}
          onPointerDown={(e) => {
            e.preventDefault();
            onNoteOn(note);
          }}
          onPointerUp={() => onNoteOff(note)}
          onPointerLeave={() => onNoteOff(note)}
          className={`border-border absolute top-0 bottom-0 border-r transition-colors ${
            activeNotes.has(note)
              ? "bg-accent/40"
              : "bg-white hover:bg-gray-100"
          }`}
          style={{
            left: `${i * whiteKeyWidth}%`,
            width: `${whiteKeyWidth}%`,
          }}
          title={midiToNoteName(note)}
        >
          {note % 12 === 0 && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-gray-400">
              {midiToNoteName(note)}
            </span>
          )}
        </button>
      ))}
      {/* Black keys */}
      {blackNotes.map((note) => {
        const x = getBlackKeyX(note);
        if (x < 0) return null;
        return (
          <button
            key={note}
            onPointerDown={(e) => {
              e.preventDefault();
              onNoteOn(note);
            }}
            onPointerUp={() => onNoteOff(note)}
            onPointerLeave={() => onNoteOff(note)}
            className={`absolute top-0 z-10 h-[60%] rounded-b transition-colors ${
              activeNotes.has(note)
                ? "bg-accent"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
            style={{
              left: `${x}%`,
              width: `${whiteKeyWidth * 0.6}%`,
            }}
            title={midiToNoteName(note)}
          />
        );
      })}
    </div>
  );
}
