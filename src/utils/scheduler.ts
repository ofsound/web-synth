/**
 * Chris Wilson look-ahead scheduler for timing-accurate sequencing.
 * Used by arpeggiator, step sequencer, and drum machine demos.
 */

export type ScheduleCallback = (time: number, step: number) => void;

export class Scheduler {
    private ctx: AudioContext;
    private tempo: number; /* BPM */
    private lookAhead = 25; /* ms — how often scheduler runs */
    private scheduleAhead = 0.1; /* seconds — how far ahead to schedule */
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
            totalSteps?: number;
            subdivision?: number;
        } = {},
    ) {
        this.ctx = ctx;
        this.callback = callback;
        this.tempo = options.tempo ?? 120;
        this.totalSteps = options.totalSteps ?? 16;
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
