/**
 * MIDI utility helpers — convert MIDI note numbers to frequencies, etc.
 */

/** Convert MIDI note number to frequency (A4 = 440 Hz) */
export function midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
}

/** Convert frequency to nearest MIDI note number */
export function freqToMidi(freq: number): number {
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/** Note names for display */
const NOTE_NAMES = [
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
] as const;

export function midiToNoteName(note: number): string {
    const octave = Math.floor(note / 12) - 1;
    return `${NOTE_NAMES[note % 12]}${octave}`;
}

/** Generate a range of MIDI note numbers for a keyboard range */
export function noteRange(startNote: number, endNote: number): number[] {
    const notes: number[] = [];
    for (let n = startNote; n <= endNote; n++) {
        notes.push(n);
    }
    return notes;
}

/** Is this a black key? */
export function isBlackKey(note: number): boolean {
    const idx = note % 12;
    return [1, 3, 6, 8, 10].includes(idx);
}
