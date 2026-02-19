/**
 * Chris Wilson look-ahead scheduler for timing-accurate sequencing.
 * Used by arpeggiator, step sequencer, and drum machine demos.
 */

import {
    SCHEDULER_LOOKAHEAD_MS,
    SCHEDULE_AHEAD_SECONDS,
} from "../constants";

export type ScheduleCallback = (time: number, step: number) => void;

export class Scheduler {
    private ctx: AudioContext;
    private tempo: number; /* BPM */
    private lookAhead = SCHEDULER_LOOKAHEAD_MS;       /* ms — how often scheduler runs */
    private scheduleAhead = SCHEDULE_AHEAD_SECONDS;   /* seconds — how far ahead to schedule */
    private timerId: ReturnType<typeof setTimeout> | null = null;
    private nextNoteTime = 0;
    private currentStep = 0;
    private totalSteps: number;
    private callback: ScheduleCallback;
    private _running = false;
    private subdivision: number; /* 1 = quarter, 0.5 = eighth, etc. */

    constructor(
        ctx: AudioContext,
        callback: ScheduleCallback,
        options: {
            tempo?: number;
            /**
             * Hard cap on step counter before it wraps back to 0.
             * Use Number.MAX_SAFE_INTEGER (default) to avoid musical skip
             * artefacts — the sequencer should wrap via its own `step % numSteps`
             * logic rather than the scheduler's totalSteps boundary.
             */
            totalSteps?: number;
            subdivision?: number;
        } = {},
    ) {
        this.ctx = ctx;
        this.callback = callback;
        this.tempo = options.tempo ?? 120;
        this.totalSteps = options.totalSteps ?? Number.MAX_SAFE_INTEGER;
        this.subdivision = options.subdivision ?? 1;
    }

    get running() {
        return this._running;
    }

    setTempo(bpm: number) {
        this.tempo = bpm;
    }

    private secondsPerStep(): number {
        return (60 / this.tempo) * this.subdivision;
    }

    private schedule = () => {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
            this.callback(this.nextNoteTime, this.currentStep);
            this.nextNoteTime += this.secondsPerStep();
            this.currentStep = (this.currentStep + 1) % this.totalSteps;
        }
        this.timerId = setTimeout(this.schedule, this.lookAhead);
    };

    start() {
        if (this._running) return;
        this._running = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime;
        this.schedule();
    }

    stop() {
        this._running = false;
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }
}
