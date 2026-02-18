/**
 * Noise buffer generators for white, pink, and brown noise.
 */

export type NoiseType = "white" | "pink" | "brown";

export function createNoiseBuffer(
    ctx: AudioContext,
    type: NoiseType,
    seconds = 2,
): AudioBuffer {
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    switch (type) {
        case "white":
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            break;

        case "pink": {
            /* Paul Kellet's refined pink-noise approximation */
            let b0 = 0,
                b1 = 0,
                b2 = 0,
                b3 = 0,
                b4 = 0,
                b5 = 0,
                b6 = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.969 * b2 + white * 0.153852;
                b3 = 0.8665 * b3 + white * 0.3104856;
                b4 = 0.55 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.016898;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
            break;
        }

        case "brown": {
            let last = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = (last + 0.02 * white) / 1.02;
                last = data[i];
                data[i] *= 3.5;
            }
            break;
        }
    }

    return buffer;
}
