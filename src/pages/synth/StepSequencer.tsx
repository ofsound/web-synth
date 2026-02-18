import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Waveform } from "../../components/Waveform";
import { Scheduler } from "../../utils/scheduler";
import { createNoiseBuffer } from "../../utils/noiseGenerators";
import { midiToFreq, midiToNoteName } from "../../utils/midiUtils";

const NUM_STEPS = 16;
const TRACK_NAMES = ["Kick", "Snare", "HiHat", "Bass"];

/* Default bass notes per step (MIDI) */
const DEFAULT_BASS_NOTES = [
  36, 36, 36, 36, 38, 38, 38, 38, 36, 36, 36, 36, 41, 41, 40, 40,
];

export default function StepSequencer() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [tempo, setTempo] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  /* Grid: 4 tracks × 16 steps */
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: 4 }, () => Array(NUM_STEPS).fill(false)),
  );
  /* Bass note per step */
  const [bassNotes, setBassNotes] = useState<number[]>(() => [
    ...DEFAULT_BASS_NOTES,
  ]);

  const schedulerRef = useRef<Scheduler | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const gridRef = useRef(grid);
  const bassNotesRef = useRef(bassNotes);
  const tempoRef = useRef(tempo);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  useEffect(() => {
    bassNotesRef.current = bassNotes;
  }, [bassNotes]);
  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  /* Setup analyser + noise buffer */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.connect(masterGain);
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));
    noiseBufferRef.current = createNoiseBuffer(ctx, "white", 0.5);
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* --- Drum synth functions --- */

  const playKick = useCallback(
    (time: number) => {
      if (!ctx || !analyserRef.current) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.07);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

      osc.connect(gain).connect(analyserRef.current!);
      osc.start(time);
      osc.stop(time + 0.4);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
    [ctx],
  );

  const playSnare = useCallback(
    (time: number) => {
      if (!ctx || !analyserRef.current || !noiseBufferRef.current) return;
      /* Noise part */
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufferRef.current;
      const noiseFilt = ctx.createBiquadFilter();
      noiseFilt.type = "bandpass";
      noiseFilt.frequency.setValueAtTime(3000, time);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      noise.connect(noiseFilt).connect(noiseGain).connect(analyserRef.current!);
      noise.start(time);
      noise.stop(time + 0.2);

      /* Sine body */
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, time);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.5, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(oscGain).connect(analyserRef.current!);
      osc.start(time);
      osc.stop(time + 0.15);

      osc.onended = () => {
        osc.disconnect();
        oscGain.disconnect();
      };
      noise.onended = () => {
        noise.disconnect();
        noiseFilt.disconnect();
        noiseGain.disconnect();
      };
    },
    [ctx],
  );

  const playHiHat = useCallback(
    (time: number) => {
      if (!ctx || !analyserRef.current || !noiseBufferRef.current) return;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBufferRef.current;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(8000, time);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
      noise.connect(filter).connect(gain).connect(analyserRef.current!);
      noise.start(time);
      noise.stop(time + 0.08);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    },
    [ctx],
  );

  const playBass = useCallback(
    (time: number, midiNote: number) => {
      if (!ctx || !analyserRef.current) return;
      const freq = midiToFreq(midiNote);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(800, time);
      filter.Q.setValueAtTime(2, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, time);
      gain.gain.setTargetAtTime(0.001, time + 0.15, 0.05);

      osc.connect(filter).connect(gain).connect(analyserRef.current!);
      osc.start(time);
      osc.stop(time + 0.35);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    },
    [ctx],
  );

  /* Create scheduler once */
  useEffect(() => {
    if (!ctx) return;
    const sched = new Scheduler(
      ctx,
      (time, step) => {
        setCurrentStep(step);
        const g = gridRef.current;
        if (g[0][step]) playKick(time);
        if (g[1][step]) playSnare(time);
        if (g[2][step]) playHiHat(time);
        if (g[3][step]) playBass(time, bassNotesRef.current[step]);
      },
      { tempo: tempoRef.current, totalSteps: NUM_STEPS, subdivision: 0.25 },
    );
    schedulerRef.current = sched;
    return () => {
      sched.stop();
      schedulerRef.current = null;
    };
  }, [ctx, playKick, playSnare, playHiHat, playBass]);

  useEffect(() => {
    schedulerRef.current?.setTempo(tempo);
  }, [tempo]);

  const togglePlay = useCallback(async () => {
    await resume();
    const sched = schedulerRef.current;
    if (!sched) return;
    if (playing) {
      sched.stop();
      setPlaying(false);
      setCurrentStep(-1);
    } else {
      sched.start();
      setPlaying(true);
    }
  }, [playing, resume]);

  const toggleCell = (track: number, step: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[track][step] = !next[track][step];
      return next;
    });
  };

  const clearAll = () => {
    setGrid(Array.from({ length: 4 }, () => Array(NUM_STEPS).fill(false)));
  };

  const changeBassNote = (step: number, delta: number) => {
    setBassNotes((prev) => {
      const next = [...prev];
      next[step] = Math.max(24, Math.min(60, next[step] + delta));
      return next;
    });
  };

  const trackColors = [
    "bg-orange-500" /* kick */,
    "bg-yellow-400" /* snare */,
    "bg-cyan-400" /* hihat */,
    "bg-purple-500" /* bass */,
  ];

  return (
    <DemoShell
      title="Step Sequencer"
      description="16-step sequencer with 4 tracks: Kick, Snare, HiHat, and Synth Bass. Toggle cells to build a pattern."
      nodes={[
        "OscillatorNode",
        "AudioBufferSourceNode",
        "BiquadFilterNode",
        "GainNode",
      ]}
    >
      {/* Transport */}
      <div className="bg-surface-alt flex flex-wrap items-center gap-4 rounded-lg p-4">
        <button
          onClick={togglePlay}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            playing
              ? "border border-red-500/40 bg-red-500/20 text-red-400"
              : "bg-accent/20 text-accent border-accent/40 border"
          }`}
        >
          {playing ? "⏹ Stop" : "▶ Play"}
        </button>
        <button
          onClick={clearAll}
          className="bg-surface border-border text-text-muted rounded-md border px-3 py-2 text-sm"
        >
          Clear All
        </button>
        <div className="w-48">
          <Slider
            label="Tempo"
            min={80}
            max={200}
            step={1}
            value={tempo}
            onChange={setTempo}
            unit=" BPM"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="bg-surface-alt overflow-x-auto rounded-lg p-4">
        <div
          className="inline-grid gap-1"
          style={{ gridTemplateColumns: `5rem repeat(${NUM_STEPS}, 1fr)` }}
        >
          {/* Header: step numbers */}
          <div />
          {Array.from({ length: NUM_STEPS }, (_, i) => (
            <div
              key={i}
              className={`text-center font-mono text-[10px] ${
                currentStep === i ? "text-accent font-bold" : "text-text-muted"
              }`}
            >
              {i + 1}
            </div>
          ))}

          {/* Track rows */}
          {TRACK_NAMES.map((name, track) => (
            <>
              <div
                key={`label-${track}`}
                className="text-text flex items-center text-xs font-medium"
              >
                {name}
              </div>
              {Array.from({ length: NUM_STEPS }, (_, step) => (
                <button
                  key={`${track}-${step}`}
                  onClick={() => toggleCell(track, step)}
                  className={`h-8 w-8 rounded border transition-all ${
                    currentStep === step ? "ring-accent/60 ring-2" : ""
                  } ${
                    grid[track][step]
                      ? `${trackColors[track]} border-transparent`
                      : "bg-surface border-border hover:bg-surface-alt"
                  }`}
                />
              ))}
            </>
          ))}

          {/* Bass note row */}
          <div className="text-text-muted flex items-center text-[10px]">
            Note
          </div>
          {Array.from({ length: NUM_STEPS }, (_, step) => (
            <div key={`bass-${step}`} className="flex flex-col items-center">
              <button
                onClick={() => changeBassNote(step, 1)}
                className="text-text-muted hover:text-accent text-[10px] leading-none"
              >
                ▲
              </button>
              <span className="text-text font-mono text-[9px]">
                {midiToNoteName(bassNotes[step])}
              </span>
              <button
                onClick={() => changeBassNote(step, -1)}
                className="text-text-muted hover:text-accent text-[10px] leading-none"
              >
                ▼
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Step indicator bar */}
      <div className="flex gap-1">
        {Array.from({ length: NUM_STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              currentStep === i ? "bg-accent" : "bg-surface-alt"
            }`}
          />
        ))}
      </div>

      {/* Waveform */}
      <div className="bg-surface-alt rounded-lg p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
