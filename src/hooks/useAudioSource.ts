import { useCallback, useRef, useState } from "react";

/**
 * Load & decode a bundled audio sample, and provide a play() helper
 * that creates a fresh AudioBufferSourceNode each time.
 */
export function useAudioSource(ctx: AudioContext | null) {
    const bufferRef = useRef<AudioBuffer | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = useCallback(
        async (url: string) => {
            if (!ctx) return null;
            setLoading(true);
            try {
                const res = await fetch(url);
                const arrayBuf = await res.arrayBuffer();
                const audioBuf = await ctx.decodeAudioData(arrayBuf);
                bufferRef.current = audioBuf;
                setLoaded(true);
                return audioBuf;
            } finally {
                setLoading(false);
            }
        },
        [ctx],
    );

    const play = useCallback(
        (destination?: AudioNode, loop = true) => {
            if (!ctx || !bufferRef.current) return null;
            /* Stop any existing source */
            try {
                sourceRef.current?.stop();
            } catch {
                /* already stopped */
            }
            const src = ctx.createBufferSource();
            src.buffer = bufferRef.current;
            src.loop = loop;
            src.connect(destination ?? ctx.destination);
            src.start();
            sourceRef.current = src;
            return src;
        },
        [ctx],
    );

    const stop = useCallback(() => {
        try {
            sourceRef.current?.stop();
        } catch {
            /* already stopped */
        }
        sourceRef.current = null;
    }, []);

    return { load, play, stop, loaded, loading, bufferRef };
}
