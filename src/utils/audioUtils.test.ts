/**
 * audioUtils — unit tests.
 *
 * Validates that setParamSmoothly correctly anchors the current value
 * before the ramp and applies the optional max-value clamp.
 */

import { describe, it, expect, vi } from "vitest";
import { setParamSmoothly } from "./audioUtils";

function makeParam(value = 0) {
    return {
        value,
        cancelScheduledValues: vi.fn().mockReturnThis(),
        setValueAtTime: vi.fn().mockReturnThis(),
        linearRampToValueAtTime: vi.fn().mockReturnThis(),
    } as unknown as AudioParam;
}

function makeCtx(currentTime = 0) {
    return { currentTime } as AudioContext;
}

describe("setParamSmoothly", () => {
    it("does nothing when param is null", () => {
        // Should not throw
        expect(() => setParamSmoothly(null, 0.5, makeCtx())).not.toThrow();
    });

    it("cancels previous schedules", () => {
        const p = makeParam(0.3);
        setParamSmoothly(p, 0.8, makeCtx(1));
        expect(p.cancelScheduledValues).toHaveBeenCalledWith(1);
    });

    it("anchors current value before ramp (fixes browser-dependence)", () => {
        const p = makeParam(0.3);
        setParamSmoothly(p, 0.8, makeCtx(1));
        // setValueAtTime must be called with current value BEFORE linearRamp
        expect(p.setValueAtTime).toHaveBeenCalledWith(0.3, 1);
        const setOrder = (p.setValueAtTime as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        const rampOrder = (p.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        expect(setOrder).toBeLessThan(rampOrder);
    });

    it("ramps to target value", () => {
        const p = makeParam(0);
        setParamSmoothly(p, 0.75, makeCtx(0), 0.02);
        expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0.75, 0.02);
    });

    it("clamps to maxValue when provided", () => {
        const p = makeParam(0);
        setParamSmoothly(p, 1.5, makeCtx(0), 0.02, 0.95);
        // value clamped to 0.95
        expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0.95, 0.02);
    });

    it("does not clamp when value is below maxValue", () => {
        const p = makeParam(0);
        setParamSmoothly(p, 0.5, makeCtx(0), 0.02, 0.95);
        expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.02);
    });
});
