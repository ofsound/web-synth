/**
 * useMidiState — MIDI activity accumulator for visualizer consumption.
 *
 * Subscribes to the MidiBus and maintains a rolling snapshot of MIDI
 * state that visualizer scenes can read every animation frame via a
 * stable ref (no React re-renders).
 */

import { useEffect, useRef } from "react";
import type { MidiBus, MidiEvent } from "../midi/MidiBus";
import { VISUAL_NOTE_HOLD_MS } from "../constants";

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
  lastNoteOnEvent: MidiEvent | null;
  lastNoteOnId: number;
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
    lastNoteOnEvent: null,
    lastNoteOnId: -1,
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
    const noteOffTimers = new Map<number, ReturnType<typeof setTimeout>>();

    const clearNoteOffTimer = (note: number) => {
      const timer = noteOffTimers.get(note);
      if (timer) {
        clearTimeout(timer);
        noteOffTimers.delete(note);
      }
    };

    const finalizeNoteOff = (note: number, releaseNow: number) => {
      const active = s.activeNotes.get(note);
      if (!active) return;
      for (const rec of s.noteHistory) {
        if (rec.note === note && !rec.released) {
          rec.released = true;
          rec.duration = releaseNow - rec.time;
          break;
        }
      }
      s.activeNotes.delete(note);
      recalcDerived(s, releaseNow);
    };

    const unsub = midiBus.subscribe((e) => {
      const now = performance.now();
      s.lastEvent = e;
      s.lastEventId = ++globalEventId;

      if (e.type === "noteon" && e.velocity > 0) {
        clearNoteOffTimer(e.note);
        s.activeNotes.set(e.note, {
          velocity: e.velocity,
          startTime: now,
          channel: e.channel,
        });
        s.lastNoteOnEvent = e;
        s.lastNoteOnId = s.lastEventId;
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
          const aliveFor = now - active.startTime;
          if (aliveFor < VISUAL_NOTE_HOLD_MS) {
            clearNoteOffTimer(e.note);
            const timer = setTimeout(() => {
              finalizeNoteOff(e.note, performance.now());
              noteOffTimers.delete(e.note);
            }, VISUAL_NOTE_HOLD_MS - aliveFor);
            noteOffTimers.set(e.note, timer);
          } else {
            finalizeNoteOff(e.note, now);
          }
        }
      } else if (e.type === "cc") {
        s.ccValues.set(e.cc, e.value);
      }

      recalcDerived(s, now);
    });

    return () => {
      unsub();
      noteOffTimers.forEach((timer) => clearTimeout(timer));
      noteOffTimers.clear();
    };
  }, [midiBus]);

  return ref;
}
