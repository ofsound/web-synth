import { describe, expect, it } from "vitest";
import { resolve } from "./MidiMapper";
import type { MidiMapping } from "./MidiMapper";
import type { MidiState } from "./useMidiState";

function makeState(overrides: Partial<MidiState> = {}): MidiState {
  return {
    activeNotes: new Map(),
    polyphony: 0,
    density: 0,
    centroid: 64,
    ccValues: new Map(),
    lastEvent: null,
    lastEventId: 0,
    lastNoteOnEvent: null,
    lastNoteOnId: -1,
    noteHistory: [] as unknown as MidiState["noteHistory"],
    recentOnsets: [],
    ...overrides,
  };
}

describe("resolve", () => {
  it("maps pitch source linearly across range", () => {
    const mappings: MidiMapping[] = [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    ];
    // centroid=64 → 64/127 ≈ 0.504
    const state = makeState({ centroid: 64 });
    const result = resolve(state, mappings);
    expect(result.hue).toBeCloseTo(64 / 127, 2);
  });

  it("uses lastEvent note when available for pitch", () => {
    const mappings: MidiMapping[] = [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
    ];
    const state = makeState({
      activeNotes: new Map([[72, { velocity: 100, startTime: 0, channel: 0 }]]),
      centroid: 72,
      lastEvent: { type: "noteon", channel: 0, note: 72, velocity: 100 },
    });
    const result = resolve(state, mappings);
    expect(result.hue).toBeCloseTo(72 / 127, 2);
  });

  it("applies exponential curve (v²)", () => {
    const mappings: MidiMapping[] = [
      {
        source: "velocity",
        target: "size",
        range: [0, 1],
        curve: "exponential",
      },
    ];
    // velocity=64 → 64/127 ≈ 0.504, exponential: 0.504² ≈ 0.254
    const state = makeState({
      activeNotes: new Map([[60, { velocity: 64, startTime: 0, channel: 0 }]]),
      lastEvent: { type: "noteon", channel: 0, note: 60, velocity: 64 },
    });
    const result = resolve(state, mappings);
    const raw = 64 / 127;
    expect(result.size).toBeCloseTo(raw * raw, 2);
  });

  it("applies logarithmic curve (√v)", () => {
    const mappings: MidiMapping[] = [
      {
        source: "velocity",
        target: "brightness",
        range: [0, 1],
        curve: "logarithmic",
      },
    ];
    const state = makeState({
      activeNotes: new Map([[60, { velocity: 64, startTime: 0, channel: 0 }]]),
      lastEvent: { type: "noteon", channel: 0, note: 60, velocity: 64 },
    });
    const result = resolve(state, mappings);
    const raw = 64 / 127;
    expect(result.brightness).toBeCloseTo(Math.sqrt(raw), 2);
  });

  it("scales output to declared range", () => {
    const mappings: MidiMapping[] = [
      {
        source: "polyphony",
        target: "speed",
        range: [0.5, 2],
        curve: "linear",
      },
    ];
    // polyphony=5 → 5/10=0.5 → scaled to 0.5 + 0.5*1.5 = 1.25
    const state = makeState({ polyphony: 5 });
    const result = resolve(state, mappings);
    expect(result.speed).toBeCloseTo(1.25, 2);
  });

  it("reads CC source", () => {
    const mappings: MidiMapping[] = [
      {
        source: "cc",
        target: "intensity",
        range: [0, 1],
        curve: "linear",
        ccNumber: 1,
      },
    ];
    const state = makeState({ ccValues: new Map([[1, 127]]) });
    const result = resolve(state, mappings);
    expect(result.intensity).toBeCloseTo(1, 2);
  });

  it("returns 0 for CC when ccNumber not in state", () => {
    const mappings: MidiMapping[] = [
      {
        source: "cc",
        target: "intensity",
        range: [0, 1],
        curve: "linear",
        ccNumber: 74,
      },
    ];
    const state = makeState();
    const result = resolve(state, mappings);
    expect(result.intensity).toBeCloseTo(0, 2);
  });

  it("noteOn trigger returns 1 on frame of noteOn", () => {
    const mappings: MidiMapping[] = [
      { source: "noteOn", target: "x", range: [0, 1], curve: "linear" },
    ];
    const state = makeState({
      lastEvent: { type: "noteon", channel: 0, note: 60, velocity: 100 },
      lastNoteOnEvent: {
        type: "noteon",
        channel: 0,
        note: 60,
        velocity: 100,
      },
      lastNoteOnId: 1,
    });
    const result = resolve(state, mappings);
    expect(result.x).toBe(1);
  });

  it("noteOn trigger returns 0 when no recent noteOn", () => {
    const mappings: MidiMapping[] = [
      { source: "noteOn", target: "x", range: [0, 1], curve: "linear" },
    ];
    const state = makeState({ lastEvent: null });
    const result = resolve(state, mappings);
    expect(result.x).toBe(0);
  });

  it("density maps up to 20 nps max", () => {
    const mappings: MidiMapping[] = [
      {
        source: "density",
        target: "intensity",
        range: [0, 1],
        curve: "linear",
      },
    ];
    // density=10 → 10/20=0.5
    const stateHalf = makeState({ density: 10 });
    expect(resolve(stateHalf, mappings).intensity).toBeCloseTo(0.5, 2);

    // density=30 → clamped to 1
    const stateFull = makeState({ density: 30 });
    expect(resolve(stateFull, mappings).intensity).toBeCloseTo(1, 2);
  });

  it("resolves multiple mappings simultaneously", () => {
    const mappings: MidiMapping[] = [
      { source: "pitch", target: "hue", range: [0, 1], curve: "linear" },
      {
        source: "polyphony",
        target: "rotation",
        range: [0, 2],
        curve: "linear",
      },
    ];
    const state = makeState({ centroid: 127, polyphony: 10 });
    const result = resolve(state, mappings);
    expect(result.hue).toBeCloseTo(1, 2);
    expect(result.rotation).toBeCloseTo(2, 2);
  });

  it("returns empty object for empty mappings", () => {
    const result = resolve(makeState(), []);
    expect(result).toEqual({});
  });
});
