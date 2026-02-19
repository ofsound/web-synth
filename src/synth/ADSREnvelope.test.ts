/**
 * ADSREnvelope — unit tests.
 *
 * Validates that applyAttack and applyRelease schedule the correct
 * automation events.  The `cancelAndHoldAtTime` fallback path is also
 * tested.
 */

import { describe, it, expect, vi } from "vitest";
import { applyAttack, applyRelease } from "./ADSREnvelope";
import type { ADSRParams } from "./ADSREnvelope";

function makeParam(value = 0.5) {
    return {
        value,
        cancelScheduledValues: vi.fn().mockReturnThis(),
        cancelAndHoldAtTime: vi.fn().mockReturnThis(),
        setValueAtTime: vi.fn().mockReturnThis(),
        linearRampToValueAtTime: vi.fn().mockReturnThis(),
        exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
        setTargetAtTime: vi.fn().mockReturnThis(),
    } as unknown as AudioParam;
}

const adsr: ADSRParams = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 };

describe("applyAttack", () => {
    it("cancels existing schedules and starts from near-zero", () => {
        const p = makeParam();
        applyAttack(p, 1, adsr, 0);
        expect(p.cancelScheduledValues).toHaveBeenCalledWith(0);
        expect(p.setValueAtTime).toHaveBeenCalledWith(0.001, 0);
    });

    it("ramps to peak with exponential mode (default)", () => {
        const p = makeParam();
        applyAttack(p, 0.8, adsr, 0);
        expect(p.exponentialRampToValueAtTime).toHaveBeenCalledWith(
            0.8,
            expect.any(Number),
        );
    });

    it("uses linear ramp in linear mode", () => {
        const p = makeParam();
        applyAttack(p, 0.8, adsr, 0, "linear");
        expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, expect.any(Number));
    });

    it("targets sustain level via setTargetAtTime", () => {
        const p = makeParam();
        applyAttack(p, 1, adsr, 0);
        // sustain * peak = 0.5 * 1 = 0.5
        expect(p.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number));
    });
});

describe("applyRelease", () => {
    it("uses cancelAndHoldAtTime when available", () => {
        const p = makeParam(0.4);
        applyRelease(p, adsr, 1);
        expect(p.cancelAndHoldAtTime).toHaveBeenCalledWith(1);
    });

    it("falls back to cancelScheduledValues + setValueAtTime when cancelAndHoldAtTime missing", () => {
        const p = makeParam(0.4);
        // Remove cancelAndHoldAtTime to simulate older browser
        (p as unknown as Record<string, unknown>).cancelAndHoldAtTime = undefined;
        applyRelease(p, adsr, 1);
        expect(p.cancelScheduledValues).toHaveBeenCalledWith(1);
        expect(p.setValueAtTime).toHaveBeenCalledWith(0.4, 1);
    });

    it("schedules decay to near-zero via setTargetAtTime", () => {
        const p = makeParam();
        applyRelease(p, adsr, 0);
        expect(p.setTargetAtTime).toHaveBeenCalledWith(0.001, 0, expect.any(Number));
    });
});
