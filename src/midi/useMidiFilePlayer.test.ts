import { describe, expect, it } from "vitest";
import { resolveMidiChannel } from "./channelPolicy";
import {
    filterNotesByTracks,
    findNextNoteIndex,
    type MidiFileNote,
} from "./useMidiFilePlayer";

function note(overrides: Partial<MidiFileNote>): MidiFileNote {
    return {
        note: 60,
        velocity: 100,
        time: 0,
        duration: 0.5,
        trackIndex: 0,
        channel: 0,
        ...overrides,
    };
}

describe("useMidiFilePlayer helpers", () => {
    it("filters notes by selected track set", () => {
        const notes = [
            note({ note: 60, trackIndex: 0 }),
            note({ note: 61, trackIndex: 1 }),
            note({ note: 62, trackIndex: 2 }),
        ];

        const filtered = filterNotesByTracks(notes, new Set([0, 2]));

        expect(filtered.map((n) => n.note)).toEqual([60, 62]);
    });

    it("finds first note not fully elapsed for a cursor time", () => {
        const notes = [
            note({ note: 60, time: 0, duration: 0.25 }),
            note({ note: 62, time: 0.25, duration: 0.25 }),
            note({ note: 64, time: 0.5, duration: 0.25 }),
        ];

        expect(findNextNoteIndex(notes, 0)).toBe(0);
        expect(findNextNoteIndex(notes, 0.2)).toBe(0);
        expect(findNextNoteIndex(notes, 0.26)).toBe(1);
        expect(findNextNoteIndex(notes, 0.8)).toBe(3);
    });
});

describe("channel policy", () => {
    it("preserves source channel in source mode", () => {
        const channel = resolveMidiChannel({
            mode: "source",
            sourceChannel: 3,
            normalizedChannel: 0,
        });
        expect(channel).toBe(3);
    });

    it("normalizes channel in normalized mode", () => {
        const channel = resolveMidiChannel({
            mode: "normalized",
            sourceChannel: 9,
            normalizedChannel: 1,
        });
        expect(channel).toBe(1);
    });
});
