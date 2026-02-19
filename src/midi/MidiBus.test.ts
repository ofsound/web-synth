import { describe, expect, it, vi } from "vitest";
import { MidiBus } from "./MidiBus";
import type { MidiEvent } from "./MidiBus";

describe("MidiBus", () => {
    it("delivers events to subscribers", () => {
        const bus = new MidiBus();
        const handler = vi.fn();
        bus.subscribe(handler);

        const event: MidiEvent = {
            type: "noteon",
            channel: 0,
            note: 60,
            velocity: 100,
        };
        bus.emit(event);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(event);
    });

    it("delivers events to multiple subscribers", () => {
        const bus = new MidiBus();
        const h1 = vi.fn();
        const h2 = vi.fn();
        bus.subscribe(h1);
        bus.subscribe(h2);

        bus.emit({ type: "noteoff", channel: 0, note: 64, velocity: 0 });

        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe removes the listener", () => {
        const bus = new MidiBus();
        const handler = vi.fn();
        const unsub = bus.subscribe(handler);

        unsub();
        bus.emit({ type: "noteon", channel: 0, note: 60, velocity: 80 });

        expect(handler).not.toHaveBeenCalled();
        expect(bus.size).toBe(0);
    });

    it("reports correct size", () => {
        const bus = new MidiBus();
        expect(bus.size).toBe(0);

        const unsub1 = bus.subscribe(vi.fn());
        expect(bus.size).toBe(1);

        const unsub2 = bus.subscribe(vi.fn());
        expect(bus.size).toBe(2);

        unsub1();
        expect(bus.size).toBe(1);

        unsub2();
        expect(bus.size).toBe(0);
    });

    it("allNotesOff emits 128 noteoff events", () => {
        const bus = new MidiBus();
        const events: MidiEvent[] = [];
        bus.subscribe((e) => events.push(e));

        bus.allNotesOff();

        expect(events).toHaveLength(128);
        expect(events.every((e) => e.type === "noteoff")).toBe(true);
        expect(events.every((e) => e.velocity === 0)).toBe(true);
        // Verify all 128 notes are covered
        const notes = events.map((e) => e.note);
        expect(notes).toEqual(Array.from({ length: 128 }, (_, i) => i));
    });

    it("isolates subscriber errors — other listeners still fire", () => {
        const bus = new MidiBus();
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const badHandler = vi.fn(() => {
            throw new Error("boom");
        });
        const goodHandler = vi.fn();

        bus.subscribe(badHandler);
        bus.subscribe(goodHandler);

        bus.emit({ type: "noteon", channel: 0, note: 60, velocity: 100 });

        expect(badHandler).toHaveBeenCalledTimes(1);
        expect(goodHandler).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it("handles CC events", () => {
        const bus = new MidiBus();
        const handler = vi.fn();
        bus.subscribe(handler);

        const ccEvent: MidiEvent = {
            type: "cc",
            channel: 0,
            note: 0,
            velocity: 0,
            cc: 1,
            value: 64,
        };
        bus.emit(ccEvent);

        expect(handler).toHaveBeenCalledWith(ccEvent);
    });
});
