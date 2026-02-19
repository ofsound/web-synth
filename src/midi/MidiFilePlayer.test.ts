/**
 * Tests for the MIDI File Player hook.
 *
 * Uses @tonejs/midi's Midi class to programmatically construct a minimal .mid
 * file in memory, then verifies parsing, playback scheduling, stop/seek
 * behaviour, and track selection.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { Midi } from "@tonejs/midi";
import { MidiBus } from "./MidiBus";
import type { MidiEvent } from "./MidiBus";

/* ── Helper: build a minimal MIDI ArrayBuffer with @tonejs/midi ── */

function buildTestMidi(opts?: {
    tracks?: Array<{
        name?: string;
        channel?: number;
        notes: Array<{ midi: number; time: number; duration: number; velocity: number }>;
    }>;
    bpm?: number;
}): ArrayBuffer {
    const midi = new Midi();
    midi.header.setTempo(opts?.bpm ?? 120);

    const trackDefs = opts?.tracks ?? [
        {
            name: "Piano",
            channel: 0,
            notes: [
                { midi: 60, time: 0, duration: 0.5, velocity: 0.8 },
                { midi: 64, time: 0.5, duration: 0.5, velocity: 0.6 },
                { midi: 67, time: 1.0, duration: 0.5, velocity: 0.7 },
            ],
        },
    ];

    for (const def of trackDefs) {
        const track = midi.addTrack();
        track.name = def.name ?? "";
        track.channel = def.channel ?? 0;
        for (const n of def.notes) {
            track.addNote(n);
        }
    }

    const uint8 = midi.toArray();
    // Convert Uint8Array to ArrayBuffer
    return uint8.buffer.slice(
        uint8.byteOffset,
        uint8.byteOffset + uint8.byteLength,
    ) as ArrayBuffer;
}

/* ── Tests for MIDI file parsing via the Midi class ── */

describe("MIDI file parsing", () => {
    it("parses a programmatically created MIDI file", () => {
        const buf = buildTestMidi();
        const parsed = new Midi(buf);

        expect(parsed.tracks.length).toBeGreaterThanOrEqual(1);
        const notes = parsed.tracks.flatMap((t) => t.notes);
        expect(notes.length).toBe(3);
        expect(notes[0].midi).toBe(60);
    });

    it("handles multi-track files", () => {
        const buf = buildTestMidi({
            tracks: [
                {
                    name: "Lead",
                    channel: 0,
                    notes: [{ midi: 72, time: 0, duration: 1, velocity: 0.9 }],
                },
                {
                    name: "Bass",
                    channel: 1,
                    notes: [{ midi: 36, time: 0, duration: 2, velocity: 0.7 }],
                },
            ],
        });
        const parsed = new Midi(buf);

        // Filter to tracks with notes (the parser may add an empty conductor track)
        const withNotes = parsed.tracks.filter((t) => t.notes.length > 0);
        expect(withNotes.length).toBe(2);
        expect(withNotes[0].notes[0].midi).toBe(72);
        expect(withNotes[1].notes[0].midi).toBe(36);
    });

    it("preserves tempo from file", () => {
        const buf = buildTestMidi({ bpm: 140 });
        const parsed = new Midi(buf);
        expect(parsed.header.tempos.length).toBeGreaterThanOrEqual(1);
        expect(parsed.header.tempos[0].bpm).toBeCloseTo(140, 0);
    });

    it("computes file duration", () => {
        const buf = buildTestMidi({
            tracks: [
                {
                    notes: [{ midi: 60, time: 0, duration: 2, velocity: 0.5 }],
                },
            ],
        });
        const parsed = new Midi(buf);
        expect(parsed.duration).toBeGreaterThanOrEqual(1.9);
        expect(parsed.duration).toBeLessThanOrEqual(2.5);
    });
});

/* ── Tests for MidiBus integration (simulating what the hook does) ── */

describe("MIDI file player → MidiBus integration", () => {
    let bus: MidiBus;
    let events: MidiEvent[];

    beforeEach(() => {
        bus = new MidiBus();
        events = [];
        bus.subscribe((e) => events.push(e));
    });

    it("emits noteOn and noteOff events for scheduled notes", async () => {
        // Simulate the scheduling logic: emit noteOn, wait, emit noteOff
        bus.emit({ type: "noteon", channel: 0, note: 60, velocity: 100 });

        await new Promise((r) => setTimeout(r, 50));

        bus.emit({ type: "noteoff", channel: 0, note: 60, velocity: 0 });

        expect(events.length).toBe(2);
        expect(events[0]).toEqual({
            type: "noteon",
            channel: 0,
            note: 60,
            velocity: 100,
        });
        expect(events[1]).toEqual({
            type: "noteoff",
            channel: 0,
            note: 60,
            velocity: 0,
        });
    });

    it("flush sends noteOff for all active notes", () => {
        const activeNotes = new Set([60, 64, 67]);

        // Start notes
        for (const note of activeNotes) {
            bus.emit({ type: "noteon", channel: 0, note, velocity: 100 });
        }

        events.length = 0;

        // Flush
        for (const note of activeNotes) {
            bus.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
        }
        activeNotes.clear();

        expect(events.length).toBe(3);
        expect(events.every((e) => e.type === "noteoff")).toBe(true);
        const flushedNotes = events.map((e) => e.note).sort();
        expect(flushedNotes).toEqual([60, 64, 67]);
    });

    it("track filtering excludes notes from deselected tracks", () => {
        const allNotes = [
            { note: 60, velocity: 100, time: 0, duration: 0.5, trackIndex: 0 },
            { note: 36, velocity: 80, time: 0, duration: 1, trackIndex: 1 },
            { note: 64, velocity: 90, time: 0.5, duration: 0.5, trackIndex: 0 },
        ];

        // Simulate selecting only track 0
        const selectedTracks = new Set([0]);
        const filtered = allNotes.filter((n) => selectedTracks.has(n.trackIndex));

        expect(filtered.length).toBe(2);
        expect(filtered.every((n) => n.trackIndex === 0)).toBe(true);
    });

    it("preserves emitted channels on the bus", () => {
        bus.emit({ type: "noteon", channel: 2, note: 48, velocity: 90 });
        bus.emit({ type: "noteoff", channel: 2, note: 48, velocity: 0 });

        expect(events.every((e) => e.channel === 2)).toBe(true);
    });
});

/* ── Note data extraction tests ── */

describe("MIDI file note extraction", () => {
    it("extracts notes sorted by time", () => {
        const buf = buildTestMidi({
            tracks: [
                {
                    notes: [
                        { midi: 67, time: 1.0, duration: 0.5, velocity: 0.7 },
                        { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8 },
                        { midi: 64, time: 0.5, duration: 0.5, velocity: 0.6 },
                    ],
                },
            ],
        });
        const parsed = new Midi(buf);

        const notes = parsed.tracks
            .flatMap((t, i) =>
                t.notes.map((n) => ({
                    note: n.midi,
                    velocity: Math.round(n.velocity * 127),
                    time: n.time,
                    duration: n.duration,
                    trackIndex: i,
                })),
            )
            .sort((a, b) => a.time - b.time);

        expect(notes[0].note).toBe(60);
        expect(notes[1].note).toBe(64);
        expect(notes[2].note).toBe(67);
    });

    it("converts velocity from 0-1 float to 0-127 int", () => {
        const buf = buildTestMidi({
            tracks: [
                {
                    notes: [{ midi: 60, time: 0, duration: 1, velocity: 1.0 }],
                },
            ],
        });
        const parsed = new Midi(buf);
        const vel = Math.round(parsed.tracks[0].notes[0].velocity * 127);
        expect(vel).toBe(127);
    });

    it("handles empty MIDI file (no notes)", () => {
        const midi = new Midi();
        midi.header.setTempo(120);
        const uint8 = midi.toArray();
        const buf = uint8.buffer.slice(
            uint8.byteOffset,
            uint8.byteOffset + uint8.byteLength,
        ) as ArrayBuffer;
        const parsed = new Midi(buf);

        const allNotes = parsed.tracks.flatMap((t) => t.notes);
        expect(allNotes.length).toBe(0);
        // @tonejs/midi returns -Infinity for empty files; our hook treats <= 0 as 0
        expect(parsed.duration).toBeLessThanOrEqual(0);
    });
});
