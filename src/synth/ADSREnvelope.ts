/**
 * Shared ADSR envelope utility.
 *
 * Encapsulates the Web Audio "cancel → set → ramp → target" pattern
 * used consistently across all synth engines.
 */

export interface ADSRParams {
    attack: number;  // seconds
    decay: number;   // seconds
    sustain: number; // 0-1
    release: number; // seconds
}

export const DEFAULT_AMP_ADSR: ADSRParams = {
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 0.3,
};

/**
 * Schedule the attack + decay + sustain phases on an AudioParam.
 *
 * @param param   The AudioParam to automate (e.g. gain, filter frequency)
 * @param peak    Peak value at end of attack (e.g. 0.3 for gain)
 * @param adsr    Envelope timings
 * @param time    AudioContext.currentTime at note-on
 * @param mode    "exponential" (for gain) or "linear" (for frequency)
 */
export function applyAttack(
    param: AudioParam,
    peak: number,
    adsr: ADSRParams,
    time: number,
    mode: "exponential" | "linear" = "exponential",
) {
    const atk = Math.max(adsr.attack, 0.005);
    const dec = Math.max(adsr.decay, 0.01);

    param.cancelScheduledValues(time);
    param.setValueAtTime(mode === "exponential" ? 0.001 : 0, time);

    if (mode === "exponential") {
        param.exponentialRampToValueAtTime(peak, time + atk);
    } else {
        param.linearRampToValueAtTime(peak, time + atk);
    }

    param.setTargetAtTime(peak * adsr.sustain, time + atk, dec / 4);
}

/**
 * Schedule the release phase on an AudioParam.
 *
 * @param param   The AudioParam
 * @param adsr    Envelope timings
 * @param time    AudioContext.currentTime at note-off
 * @param mode    "exponential" or "linear"
 */
export function applyRelease(
    param: AudioParam,
    adsr: ADSRParams,
    time: number,
    mode: "exponential" | "linear" = "exponential",
) {
    const rel = Math.max(adsr.release, 0.01);

    // cancelAndHoldAtTime freezes the scheduled value at `time`, correctly
    // capturing a mid-automation value (e.g. mid-attack release).
    // Falls back to cancelScheduledValues + setValueAtTime(current) on older
    // browsers — which reads the wrong instant value if time > currentTime,
    // but is still correct when called right at note-off.
    if (typeof param.cancelAndHoldAtTime === "function") {
        param.cancelAndHoldAtTime(time);
    } else {
        param.cancelScheduledValues(time);
        param.setValueAtTime(param.value, time);
    }
    param.setTargetAtTime(mode === "exponential" ? 0.001 : 0, time, rel / 4);
}
