/**
 * Load an impulse response from a URL and decode it into an AudioBuffer.
 */
export async function loadImpulseResponse(
    ctx: AudioContext,
    url: string,
): Promise<AudioBuffer> {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    return ctx.decodeAudioData(arrayBuf);
}

/**
 * Generate a simple synthetic impulse response (exponential decay).
 * Useful as a fallback when no real IR files are bundled.
 */
export function generateSyntheticIR(
    ctx: AudioContext,
    duration = 2,
    decay = 2,
): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t);
        }
    }

    return buffer;
}

export type IRPreset = "hall" | "plate" | "spring" | "room" | "cathedral";

/**
 * Generate a synthetic IR with characteristics matching the preset name.
 */
export function generatePresetIR(
    ctx: AudioContext,
    preset: IRPreset,
): AudioBuffer {
    switch (preset) {
        case "hall":
            return generateSyntheticIR(ctx, 3, 1.5);
        case "plate":
            return generateSyntheticIR(ctx, 1.5, 3);
        case "spring":
            return generateSyntheticIR(ctx, 1, 5);
        case "room":
            return generateSyntheticIR(ctx, 0.8, 6);
        case "cathedral":
            return generateSyntheticIR(ctx, 5, 0.8);
    }
}
