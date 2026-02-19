/**
 * useMidiState — MIDI activity accumulator for visualizer consumption.
 *
 * Subscribes to the MidiBus and maintains a rolling snapshot of MIDI
 * state that visualizer scenes can read every animation frame via a
 * stable ref (no React re-renders).
 */

import { useEffect, useRef } from "react";
import type { MidiBus, MidiEvent } from "../midi/MidiBus";

/* ------------------------------------------------------------------ */
/*  Ring buffer for note history                                      */
/* ------------------------------------------------------------------ */

export interface NoteRecord {
  note: number;
  velocity: number;
  time: number;
  duration: number;
  released: boolean;
}

class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(item: T) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
  }

  *[Symbol.iterator](): Generator<T> {
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const v = this.buf[idx];
      if (v !== undefined) yield v;
    }
  }

  toArray(): T[] {
    return [...this];
  }
}

/* ------------------------------------------------------------------ */
/*  MIDI State snapshot                                               */
/* ------------------------------------------------------------------ */

export interface ActiveNote {
  velocity: number;
  startTime: number;
  channel: number;
}

export interface MidiState {
  activeNotes: Map<number, ActiveNote>;
  noteHistory: RingBuffer<NoteRecord>;
  polyphony: number;
  density: number;
  centroid: number;
  lastEvent: MidiEvent | null;
  lastEventId: number;
  ccValues: Map<number, number>;
  recentOnsets: number[];
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

let globalEventId = 0;

function createInitialState(): MidiState {
  return {
    activeNotes: new Map(),
    noteHistory: new RingBuffer(256),
    polyphony: 0,
    density: 0,
    centroid: 60,
    lastEvent: null,
    lastEventId: -1,
    ccValues: new Map(),
    recentOnsets: [],
  };
}

function recalcDerived(s: MidiState, now: number) {
  s.polyphony = s.activeNotes.size;

  const cutoff = now - 1000;
  s.recentOnsets = s.recentOnsets.filter((t) => t > cutoff);
  s.density = s.recentOnsets.length;

  if (s.polyphony === 0) return;
  let sumPitch = 0;
  let sumWeight = 0;
  for (const [note, info] of s.activeNotes) {
    sumPitch += note * info.velocity;
    sumWeight += info.velocity;
  }
  if (sumWeight > 0) s.centroid = sumPitch / sumWeight;
}

export function useMidiState(midiBus: MidiBus) {
  const ref = useRef<MidiState>(createInitialState());

  useEffect(() => {
    const s = ref.current;

    const unsub = midiBus.subscribe((e) => {
      const now = performance.now();
      s.lastEvent = e;
      s.lastEventId = ++globalEventId;

      if (e.type === "noteon" && e.velocity > 0) {
        s.activeNotes.set(e.note, {
          velocity: e.velocity,
          startTime: now,
          channel: e.channel,
        });
        s.noteHistory.push({
          note: e.note,
          velocity: e.velocity,
          time: now,
          duration: 0,
          released: false,
        });
        s.recentOnsets.push(now);
      } else if (
        e.type === "noteoff" ||
        (e.type === "noteon" && e.velocity === 0)
      ) {
        const active = s.activeNotes.get(e.note);
        if (active) {
          for (const rec of s.noteHistory) {
            if (rec.note === e.note && !rec.released) {
              rec.released = true;
              rec.duration = now - rec.time;
              break;
            }
          }
          s.activeNotes.delete(e.note);
        }
      } else if (e.type === "cc") {
        s.ccValues.set(e.cc, e.value);
      }

      recalcDerived(s, now);
    });

    return unsub;
  }, [midiBus]);

  return ref;
}
