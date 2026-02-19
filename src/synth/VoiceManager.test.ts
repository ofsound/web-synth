import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VoiceManager } from "./VoiceManager";

type TestVoice = { id: number };

function setup(maxVoices = 4, releaseDuration = 0.3) {
    const createVoice = vi.fn(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (note: number, _velocity: number, _time: number): TestVoice => ({
            id: note,
        }),
    );
    const releaseVoice = vi.fn();
    const killVoice = vi.fn();

    const manager = new VoiceManager<TestVoice>({
        maxVoices,
        releaseDuration,
        createVoice,
        releaseVoice,
        killVoice,
    });

    return { manager, createVoice, releaseVoice, killVoice };
}

describe("VoiceManager", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("creates and tracks a voice on noteOn", () => {
        const { manager, createVoice, releaseVoice, killVoice } = setup();

        manager.noteOn(60, 100, 0);

        expect(createVoice).toHaveBeenCalledWith(60, 100, 0);
        expect(manager.activeCount).toBe(1);
        expect(manager.activeNotes.has(60)).toBe(true);
        expect(releaseVoice).not.toHaveBeenCalled();
        expect(killVoice).not.toHaveBeenCalled();
    });

    it("releases voice on noteOff, moves to releasing set", () => {
        const { manager, releaseVoice, killVoice } = setup();

        manager.noteOn(62, 90, 1.0);
        manager.noteOff(62, 1.5);

        expect(releaseVoice).toHaveBeenCalledTimes(1);
        expect(releaseVoice).toHaveBeenCalledWith({ id: 62 }, 62, 1.5);
        // Voice is no longer active but is in releasing set
        expect(manager.activeCount).toBe(0);
        expect(manager.activeNotes.has(62)).toBe(false);
        expect(manager.releasingCount).toBe(1);
        expect(killVoice).not.toHaveBeenCalled();
    });

    it("auto-kills releasing voice after release duration elapses", () => {
        const { manager, killVoice } = setup(4, 0.3);

        manager.noteOn(62, 90, 1.0);
        manager.noteOff(62, 1.5);
        expect(manager.releasingCount).toBe(1);

        // Advance past releaseDuration + 50ms buffer = 350ms
        vi.advanceTimersByTime(400);

        expect(killVoice).toHaveBeenCalledTimes(1);
        expect(killVoice).toHaveBeenCalledWith({ id: 62 }, 62);
        expect(manager.releasingCount).toBe(0);
    });

    it("kills releasing voice when retriggering same note", () => {
        const { manager, createVoice, killVoice } = setup();

        manager.noteOn(64, 70, 0);
        manager.noteOff(64, 0.1);
        expect(manager.releasingCount).toBe(1);

        // Re-trigger while still releasing
        manager.noteOn(64, 110, 0.2);

        // killVoice called once for the releasing voice
        expect(killVoice).toHaveBeenCalledTimes(1);
        expect(killVoice).toHaveBeenCalledWith({ id: 64 }, 64);
        expect(createVoice).toHaveBeenCalledTimes(2);
        expect(createVoice).toHaveBeenNthCalledWith(2, 64, 110, 0.2);
        expect(manager.activeCount).toBe(1);
        expect(manager.releasingCount).toBe(0);
    });

    it("kills existing active voice when retriggering same note", () => {
        const { manager, createVoice, killVoice } = setup();

        manager.noteOn(64, 70, 0);
        manager.noteOn(64, 110, 0.2);

        expect(killVoice).toHaveBeenCalledTimes(1);
        expect(killVoice).toHaveBeenCalledWith({ id: 64 }, 64);
        expect(createVoice).toHaveBeenCalledTimes(2);
        expect(manager.activeCount).toBe(1);
    });

    it("steals oldest voice when max polyphony is reached", () => {
        const { manager, releaseVoice, killVoice } = setup(2);

        manager.noteOn(60, 100, 0.0); // oldest
        manager.noteOn(64, 100, 0.1);
        manager.noteOn(67, 100, 0.2); // should steal note 60

        expect(killVoice).toHaveBeenCalledTimes(1);
        expect(killVoice).toHaveBeenCalledWith({ id: 60 }, 60);
        expect(manager.activeCount).toBe(2);
        expect(manager.activeNotes.has(60)).toBe(false);
        expect(manager.activeNotes.has(64)).toBe(true);
        expect(manager.activeNotes.has(67)).toBe(true);
        expect(releaseVoice).not.toHaveBeenCalled();
    });

    it("kills all active and releasing voices on allNotesOff", () => {
        const { manager, killVoice } = setup();

        manager.noteOn(60, 80, 0);
        manager.noteOn(64, 80, 0.1);
        manager.noteOn(67, 80, 0.2);

        // Release one voice so it enters releasing set
        manager.noteOff(60, 0.3);
        expect(manager.releasingCount).toBe(1);

        manager.allNotesOff();

        // 3 kills: 1 for the releasing voice, 2 for the active voices
        expect(killVoice).toHaveBeenCalledTimes(3);
        expect(manager.activeCount).toBe(0);
        expect(manager.activeNotes.size).toBe(0);
        expect(manager.releasingCount).toBe(0);
    });

    it("handles noteOff for non-existent note gracefully", () => {
        const { manager, releaseVoice, killVoice } = setup();

        manager.noteOff(60, 1.0);

        expect(releaseVoice).not.toHaveBeenCalled();
        expect(killVoice).not.toHaveBeenCalled();
    });

    it("clears releasing timer when allNotesOff is called", () => {
        const { manager, killVoice } = setup(4, 0.3);

        manager.noteOn(60, 80, 0);
        manager.noteOff(60, 0.1);
        expect(manager.releasingCount).toBe(1);

        manager.allNotesOff();
        expect(killVoice).toHaveBeenCalledTimes(1);

        // Timer should be cleared — advancing should NOT cause another kill
        vi.advanceTimersByTime(500);
        expect(killVoice).toHaveBeenCalledTimes(1);
    });
});
