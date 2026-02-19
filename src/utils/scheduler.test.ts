import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler";

// Minimal AudioContext stub for Scheduler
function makeCtx(currentTime = 0): AudioContext {
    return { currentTime } as unknown as AudioContext;
}

describe("Scheduler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts and fires callback ahead of time", () => {
        const ctx = makeCtx(0);
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, {
            tempo: 120,
            totalSteps: 4,
        });

        scheduler.start();
        expect(scheduler.running).toBe(true);

        // The scheduler should have immediately invoked the callback
        // for notes within the scheduleAhead window (0.1s).
        // At 120BPM quarter-note subdivision=1 → 0.5s per step.
        // So only step 0 (time=0) is within the 0.1s window.
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(0, 0);

        scheduler.stop();
        expect(scheduler.running).toBe(false);
    });

    it("advances steps over time", () => {
        let time = 0;
        const ctx = { get currentTime() { return time; } } as unknown as AudioContext;
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, {
            tempo: 120,
            totalSteps: 4,
            subdivision: 1,
        });

        scheduler.start();
        cb.mockClear();

        // Advance time to 0.5s (one step at 120 BPM)
        time = 0.5;
        vi.advanceTimersByTime(30); // trigger scheduler tick

        // Step 1 should now be scheduled (at time=0.5, within 0.6 window)
        expect(cb).toHaveBeenCalled();
        const stepArgs = cb.mock.calls.map((c: unknown[]) => c[1]);
        expect(stepArgs).toContain(1);

        scheduler.stop();
    });

    it("wraps around totalSteps", () => {
        let time = 0;
        const ctx = { get currentTime() { return time; } } as unknown as AudioContext;
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, {
            tempo: 600, // 0.1s per step
            totalSteps: 4,
            subdivision: 1,
        });

        scheduler.start();
        cb.mockClear();

        // Fast-forward past 4 steps (0.4s at 600 BPM)
        time = 0.5;
        vi.advanceTimersByTime(30);

        const steps = cb.mock.calls.map((c: unknown[]) => c[1]);
        // Should have wrapped back to step 0
        expect(steps).toContain(0);

        scheduler.stop();
    });

    it("stops cleanly and does not fire after stop", () => {
        const ctx = makeCtx(0);
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, { tempo: 120, totalSteps: 4 });

        scheduler.start();
        scheduler.stop();
        cb.mockClear();

        vi.advanceTimersByTime(100);

        expect(cb).not.toHaveBeenCalled();
        expect(scheduler.running).toBe(false);
    });

    it("setTempo changes the playback speed", () => {
        let time = 0;
        const ctx = { get currentTime() { return time; } } as unknown as AudioContext;
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, {
            tempo: 120, // 0.5s per step
            totalSteps: 16,
        });

        scheduler.start();
        // step 0 fired at t=0; nextNoteTime is now 0.5 (120 BPM)

        // Advance past step 1 at 0.5s
        time = 0.55;
        vi.advanceTimersByTime(30);
        // step 1 fired at 0.5; nextNoteTime is now 1.0 (still 120 BPM interval)

        // Change tempo — the interval *after* the already-queued step 2 uses 240 BPM
        scheduler.setTempo(240);
        cb.mockClear();

        // Advance past step 2 at 1.0s
        time = 1.05;
        vi.advanceTimersByTime(30);
        // step 2 fires at 1.0; nextNoteTime = 1.0 + 0.25 = 1.25 (new 240 BPM)

        // Advance past step 3 at 1.25s (proves new tempo is in effect)
        time = 1.3;
        vi.advanceTimersByTime(30);

        const steps = cb.mock.calls.map((c: unknown[]) => c[1]);
        expect(steps).toContain(2);
        expect(steps).toContain(3);

        // At old 120 BPM step 3 would be at 1.5, not 1.25 — verify it fired at 1.25
        const step3Call = cb.mock.calls.find((c: unknown[]) => c[1] === 3);
        expect(step3Call![0]).toBeCloseTo(1.25, 5);

        scheduler.stop();
    });

    it("does not double-start", () => {
        const ctx = makeCtx(0);
        const cb = vi.fn();
        const scheduler = new Scheduler(ctx, cb, { tempo: 120, totalSteps: 4 });

        scheduler.start();
        const countAfterFirst = cb.mock.calls.length;
        scheduler.start(); // should be no-op
        expect(cb.mock.calls.length).toBe(countAfterFirst);

        scheduler.stop();
    });
});
