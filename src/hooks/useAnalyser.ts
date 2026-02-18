import { useEffect, useRef, useCallback } from "react";

interface AnalyserOptions {
    fftSize?: number;
    smoothing?: number;
    minDecibels?: number;
    maxDecibels?: number;
}

export function useAnalyser(
    ctx: AudioContext | null,
    options: AnalyserOptions = {},
) {
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number>(0);
    const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const floatDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

    useEffect(() => {
        if (!ctx) return;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = options.fftSize ?? 2048;
        analyser.smoothingTimeConstant = options.smoothing ?? 0.8;
        analyser.minDecibels = options.minDecibels ?? -90;
        analyser.maxDecibels = options.maxDecibels ?? -10;
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(
            analyser.frequencyBinCount,
        ) as Uint8Array<ArrayBuffer>;
        floatDataRef.current = new Float32Array(
            analyser.frequencyBinCount,
        ) as Float32Array<ArrayBuffer>;

        return () => {
            analyserRef.current = null;
            cancelAnimationFrame(rafRef.current);
        };
    }, [
        ctx,
        options.fftSize,
        options.smoothing,
        options.minDecibels,
        options.maxDecibels,
    ]);

    const drawWaveform = useCallback((color = "#6366f1") => {
        const draw = () => {
            const analyser = analyserRef.current;
            const canvas = canvasRef.current;
            if (!analyser || !canvas) return;
            const cctx = canvas.getContext("2d");
            if (!cctx) return;

            const data = dataRef.current!;
            analyser.getByteTimeDomainData(data);

            const w = canvas.width;
            const h = canvas.height;
            cctx.clearRect(0, 0, w, h);
            cctx.lineWidth = 2;
            cctx.strokeStyle = color;
            cctx.beginPath();

            const sliceWidth = w / data.length;
            let x = 0;
            for (let i = 0; i < data.length; i++) {
                const v = data[i] / 128.0;
                const y = (v * h) / 2;
                if (i === 0) cctx.moveTo(x, y);
                else cctx.lineTo(x, y);
                x += sliceWidth;
            }
            cctx.lineTo(w, h / 2);
            cctx.stroke();
            rafRef.current = requestAnimationFrame(draw);
        };
        draw();
    }, []);

    const drawSpectrum = useCallback((barColor = "#6366f1") => {
        const draw = () => {
            const analyser = analyserRef.current;
            const canvas = canvasRef.current;
            if (!analyser || !canvas) return;
            const cctx = canvas.getContext("2d");
            if (!cctx) return;

            const data = dataRef.current!;
            analyser.getByteFrequencyData(data);

            const w = canvas.width;
            const h = canvas.height;
            const barWidth = w / data.length;

            cctx.clearRect(0, 0, w, h);
            for (let i = 0; i < data.length; i++) {
                const barHeight = (data[i] / 255) * h;
                cctx.fillStyle = barColor;
                cctx.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight);
            }
            rafRef.current = requestAnimationFrame(draw);
        };
        draw();
    }, []);

    const stop = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
    }, []);

    return {
        analyserRef,
        canvasRef,
        drawWaveform,
        drawSpectrum,
        stop,
        dataRef,
        floatDataRef,
    };
}
