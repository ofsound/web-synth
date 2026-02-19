/**
 * Shared Web Audio utility helpers.
 *
 * Extracted from the three effect hooks (useDelay / usePhaser / useBitcrusher)
 * which previously each held an identical copy.
 */

import { PARAM_RAMP_TIME } from "../constants";

/**
 * Smoothly ramp an AudioParam to a target value using a linear ramp.
 *
 * The `setValueAtTime` anchor before the ramp is required by the Web Audio
 * spec to guarantee a well-defined start point when earlier automations have
 * been cancelled.  Without it, the start value is browser-dependent.
 *
 * @param param     The AudioParam to automate.
 * @param value     Target value.
 * @param ctx       AudioContext (for currentTime).
 * @param rampTime  Duration of the linear ramp in seconds (default 20 ms).
 * @param maxValue  Optional upper clamp applied before scheduling.
 */
export function setParamSmoothly(
    param: AudioParam | null,
    value: number,
    ctx: AudioContext,
    rampTime = PARAM_RAMP_TIME,
    maxValue?: number,
): void {
    if (!param) return;
    const clamped = maxValue !== undefined ? Math.min(value, maxValue) : value;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    // Anchor the current value so the ramp starts from the right place.
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(clamped, now + rampTime);
}
