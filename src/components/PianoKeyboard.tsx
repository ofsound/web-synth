import { memo, useCallback, useMemo, useRef } from "react";
import { isBlackKey, midiToNoteName } from "../utils/midiUtils";

interface PianoKeyboardProps {
  startNote?: number; /* MIDI note number */
  endNote?: number;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
  activeNotes?: Set<number>;
}

export const PianoKeyboard = memo(function PianoKeyboard({
  startNote = 48 /* C3 */,
  endNote = 72 /* C5 */,
  onNoteOn,
  onNoteOff,
  activeNotes = new Set(),
}: PianoKeyboardProps) {
  // Track which notes were actually pressed by pointer so we don't
  // emit phantom noteOff on mere hover-leave.
  const pressedByPointer = useRef(new Set<number>());

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

  /**
   * Precomputed Map from black-key MIDI note → x% position.
   * O(1) lookup per key vs O(n) indexOf scan.
   */
  const blackKeyXMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const note of blackNotes) {
      const prevWhiteNote = note - 1;
      const whiteIdx = whiteNotes.indexOf(prevWhiteNote);
      if (whiteIdx !== -1) {
        m.set(note, (whiteIdx + 1) * whiteKeyWidth - whiteKeyWidth * 0.3);
      }
    }
    return m;
  }, [blackNotes, whiteNotes, whiteKeyWidth]);

  const handlePointerDown = useCallback(
    (note: number, e: React.PointerEvent) => {
      e.preventDefault();
      pressedByPointer.current.add(note);
      onNoteOn(note);
    },
    [onNoteOn],
  );

  const handlePointerUp = useCallback(
    (note: number) => {
      if (pressedByPointer.current.has(note)) {
        pressedByPointer.current.delete(note);
        onNoteOff(note);
      }
    },
    [onNoteOff],
  );

  const handlePointerLeave = useCallback(
    (note: number) => {
      if (pressedByPointer.current.has(note)) {
        pressedByPointer.current.delete(note);
        onNoteOff(note);
      }
    },
    [onNoteOff],
  );

  /**
   * Handle pointer cancel (e.g. iOS scroll interrupt) — release any held notes
   * so keys don't get stuck in the down state.
   */
  const handlePointerCancel = useCallback(
    (note: number) => {
      if (pressedByPointer.current.has(note)) {
        pressedByPointer.current.delete(note);
        onNoteOff(note);
      }
    },
    [onNoteOff],
  );

  return (
    <div className="border-border bg-surface relative h-32 w-full overflow-hidden rounded border select-none">
      {/* White keys */}
      {whiteNotes.map((note, i) => (
        <button
          key={note}
          onPointerDown={(e) => handlePointerDown(note, e)}
          onPointerUp={() => handlePointerUp(note)}
          onPointerLeave={() => handlePointerLeave(note)}
          onPointerCancel={() => handlePointerCancel(note)}
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
        const x = blackKeyXMap.get(note);
        if (x === undefined) return null;
        return (
          <button
            key={note}
            onPointerDown={(e) => handlePointerDown(note, e)}
            onPointerUp={() => handlePointerUp(note)}
            onPointerLeave={() => handlePointerLeave(note)}
            onPointerCancel={() => handlePointerCancel(note)}
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
});
