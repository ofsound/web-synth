/**
 * Centralised MIDI event bus.
 *
 * All three input sources (Web MIDI hardware, on-screen keyboard, poly
 * sequencer) emit MidiEvent objects through a single bus.  Every synth
 * engine subscribes to the bus and reacts to noteOn / noteOff / cc.
 */

export type MidiEvent =
    | { type: "noteon"; channel: number; note: number; velocity: number }
    | { type: "noteoff"; channel: number; note: number; velocity: number }
    | { type: "cc"; channel: number; note: number; velocity: number; cc: number; value: number };

export type MidiSubscriber = (e: MidiEvent) => void;

export class MidiBus {
    private listeners = new Set<MidiSubscriber>();

    /** Emit an event to all subscribers. */
    emit(event: MidiEvent) {
        this.listeners.forEach((fn) => fn(event));
    }

    /** Subscribe to all events. Returns an unsubscribe function. */
    subscribe(fn: MidiSubscriber): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    /** Send noteOff for all 128 notes — "panic" button. */
    allNotesOff() {
        for (let note = 0; note < 128; note++) {
            this.emit({ type: "noteoff", channel: 0, note, velocity: 0 });
        }
    }

    /** Current subscriber count (useful for debugging). */
    get size() {
        return this.listeners.size;
    }
}
