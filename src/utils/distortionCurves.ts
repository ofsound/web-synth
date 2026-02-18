/**
 * Waveshaper distortion curve generators.
 * Each returns a Float32Array suitable for WaveShaperNode.curve.
 */

export function softClip(amount: number, samples = 44100): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}

export function hardClip(threshold = 0.5, samples = 44100): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.max(-threshold, Math.min(threshold, x));
    }
    return curve;
}

export function fuzz(amount = 50, samples = 44100): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        const sign = x < 0 ? -1 : 1;
        curve[i] =
            (sign * (1 - Math.exp((-amount * Math.abs(x)) / 1))) /
            (1 - Math.exp(-amount));
    }
    return curve;
}

export function tube(drive = 4, samples = 44100): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(drive * x);
    }
    return curve;
}

export const CURVE_NAMES = ["softClip", "hardClip", "fuzz", "tube"] as const;
export type CurveName = (typeof CURVE_NAMES)[number];

export function getCurve(name: CurveName, param = 20): Float32Array {
    switch (name) {
        case "softClip":
            return softClip(param);
        case "hardClip":
            return hardClip(param / 40);
        case "fuzz":
            return fuzz(param);
        case "tube":
            return tube(param / 5);
    }
}
