import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Waveform } from "../../components/Waveform";
import { Scheduler } from "../../utils/scheduler";
import { createNoiseBuffer } from "../../utils/noiseGenerators";

const NUM_STEPS = 16;

interface DrumVoice {
  name: string;
  color: string;
  play: (
    ctx: AudioContext,
    dest: AudioNode,
    noiseBuffer: AudioBuffer,
    time: number,
    velocity: number,
  ) => void;
}

/* --- Drum synthesis functions --- */

function playKick(
  ctx: AudioContext,
  dest: AudioNode,
  _nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(300, time);
  osc.frequency.exponentialRampToValueAtTime(60, time + 0.08);
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);

  const gain = ctx.createGain();
  const v = vel / 127;
  gain.gain.setValueAtTime(v * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.55);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function playSnare(
  ctx: AudioContext,
  dest: AudioNode,
  nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  /* Noise part */
  const noise = ctx.createBufferSource();
  noise.buffer = nb;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(3000, time);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.4, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  noise.connect(filt).connect(ng).connect(dest);
  noise.start(time);
  noise.stop(time + 0.2);

  /* Body */
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, time);
  const og = ctx.createGain();
  og.gain.setValueAtTime(v * 0.5, time);
  og.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  osc.connect(og).connect(dest);
  osc.start(time);
  osc.stop(time + 0.15);
  osc.onended = () => {
    osc.disconnect();
    og.disconnect();
  };
  noise.onended = () => {
    noise.disconnect();
    filt.disconnect();
    ng.disconnect();
  };
}

function playClosedHH(
  ctx: AudioContext,
  dest: AudioNode,
  nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  const noise = ctx.createBufferSource();
  noise.buffer = nb;
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.setValueAtTime(8000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v * 0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noise.connect(filt).connect(gain).connect(dest);
  noise.start(time);
  noise.stop(time + 0.06);
  noise.onended = () => {
    noise.disconnect();
    filt.disconnect();
    gain.disconnect();
  };
}

function playOpenHH(
  ctx: AudioContext,
  dest: AudioNode,
  nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  const noise = ctx.createBufferSource();
  noise.buffer = nb;
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.setValueAtTime(8000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v * 0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  noise.connect(filt).connect(gain).connect(dest);
  noise.start(time);
  noise.stop(time + 0.25);
  noise.onended = () => {
    noise.disconnect();
    filt.disconnect();
    gain.disconnect();
  };
}

function playClap(
  ctx: AudioContext,
  dest: AudioNode,
  nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  /* Multi-trigger envelope for clap */
  for (let i = 0; i < 3; i++) {
    const t = time + i * 0.015;
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(1500, t);
    filt.Q.setValueAtTime(1.5, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.connect(filt).connect(gain).connect(dest);
    noise.start(t);
    noise.stop(t + 0.1);
    noise.onended = () => {
      noise.disconnect();
      filt.disconnect();
      gain.disconnect();
    };
  }
}

function playRimshot(
  ctx: AudioContext,
  dest: AudioNode,
  nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, time);
  const og = ctx.createGain();
  og.gain.setValueAtTime(v * 0.3, time);
  og.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  osc.connect(og).connect(dest);
  osc.start(time);
  osc.stop(time + 0.05);

  const noise = ctx.createBufferSource();
  noise.buffer = nb;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(3500, time);
  filt.Q.setValueAtTime(3, time);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.2, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  noise.connect(filt).connect(ng).connect(dest);
  noise.start(time);
  noise.stop(time + 0.05);

  osc.onended = () => {
    osc.disconnect();
    og.disconnect();
  };
  noise.onended = () => {
    noise.disconnect();
    filt.disconnect();
    ng.disconnect();
  };
}

function playTom(
  ctx: AudioContext,
  dest: AudioNode,
  _nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, time);
  osc.frequency.exponentialRampToValueAtTime(80, time + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v * 0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.35);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function playCowbell(
  ctx: AudioContext,
  dest: AudioNode,
  _nb: AudioBuffer,
  time: number,
  vel: number,
) {
  const v = vel / 127;
  const osc1 = ctx.createOscillator();
  osc1.type = "square";
  osc1.frequency.setValueAtTime(560, time);
  const osc2 = ctx.createOscillator();
  osc2.type = "square";
  osc2.frequency.setValueAtTime(845, time);

  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(700, time);
  filt.Q.setValueAtTime(3, time);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v * 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

  osc1.connect(filt);
  osc2.connect(filt);
  filt.connect(gain).connect(dest);
  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + 0.35);
  osc2.stop(time + 0.35);
  osc1.onended = () => {
    osc1.disconnect();
    osc2.disconnect();
    filt.disconnect();
    gain.disconnect();
  };
}

const VOICES: DrumVoice[] = [
  { name: "Kick", color: "bg-orange-500", play: playKick },
  { name: "Snare", color: "bg-yellow-400", play: playSnare },
  { name: "CH", color: "bg-cyan-400", play: playClosedHH },
  { name: "OH", color: "bg-teal-400", play: playOpenHH },
  { name: "Clap", color: "bg-pink-500", play: playClap },
  { name: "Rim", color: "bg-rose-400", play: playRimshot },
  { name: "Tom", color: "bg-amber-500", play: playTom },
  { name: "Cow", color: "bg-purple-400", play: playCowbell },
];

export default function DrumMachine() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [tempo, setTempo] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: 8 }, () => Array(NUM_STEPS).fill(false)),
  );

  const schedulerRef = useRef<Scheduler | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  /* Setup analyser + noise buffer */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.connect(masterGain);
    analyserRef.current = an;
    setAnalyser(an);
    noiseBufferRef.current = createNoiseBuffer(ctx, "white", 0.5);
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Step callback ref */
  const onStepRef = useRef<(time: number, step: number) => void>(() => {});
  onStepRef.current = (time: number, step: number) => {
    setCurrentStep(step);
    const g = gridRef.current;
    const nb = noiseBufferRef.current;
    if (!ctx || !analyserRef.current || !nb) return;
    for (let t = 0; t < 8; t++) {
      if (g[t][step]) {
        VOICES[t].play(ctx, analyserRef.current, nb, time, 100);
      }
    }
  };

  /* Create scheduler */
  useEffect(() => {
    if (!ctx) return;
    const sched = new Scheduler(
      ctx,
      (time, step) => onStepRef.current(time, step),
      { tempo, totalSteps: NUM_STEPS, subdivision: 0.25 },
    );
    schedulerRef.current = sched;
    return () => {
      sched.stop();
      schedulerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

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

  const triggerPad = useCallback(
    async (voiceIdx: number) => {
      await resume();
      if (!ctx || !analyserRef.current || !noiseBufferRef.current) return;
      VOICES[voiceIdx].play(
        ctx,
        analyserRef.current,
        noiseBufferRef.current,
        ctx.currentTime,
        100,
      );
    },
    [ctx, resume],
  );

  const toggleCell = (track: number, step: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[track][step] = !next[track][step];
      return next;
    });
  };

  const clearAll = () => {
    setGrid(Array.from({ length: 8 }, () => Array(NUM_STEPS).fill(false)));
  };

  return (
    <DemoShell
      title="Drum Machine"
      description="8 synthesized drum sounds with velocity pads and a 16-step pattern sequencer. Click pads to audition, toggle the grid to sequence."
      nodes={["OscillatorNode", "GainNode", "BiquadFilterNode"]}
    >
      {/* Pads — 2×4 grid */}
      <div className="bg-surface-alt rounded-lg p-4">
        <h3 className="text-text-muted mb-3 text-xs font-medium tracking-wider uppercase">
          Pads
        </h3>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
          {VOICES.map((voice, i) => (
            <button
              key={voice.name}
              onPointerDown={() => triggerPad(i)}
              className={`${voice.color} h-16 rounded-lg text-xs font-bold text-white shadow-md transition-transform select-none active:scale-95`}
            >
              {voice.name}
            </button>
          ))}
        </div>
      </div>

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
          Clear
        </button>
        <div className="w-48">
          <Slider
            label="Tempo"
            min={60}
            max={200}
            step={1}
            value={tempo}
            onChange={setTempo}
            unit=" BPM"
          />
        </div>
      </div>

      {/* Step sequencer grid */}
      <div className="bg-surface-alt overflow-x-auto rounded-lg p-4">
        {/* Step indicator */}
        <div className="mb-1 flex gap-[3px]" style={{ marginLeft: "3.5rem" }}>
          {Array.from({ length: NUM_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${
                currentStep === i ? "bg-accent" : "bg-surface"
              }`}
            />
          ))}
        </div>

        {VOICES.map((voice, track) => (
          <div key={voice.name} className="mb-[3px] flex items-center gap-1">
            <span className="text-text-muted w-14 shrink-0 text-right text-[10px] font-medium">
              {voice.name}
            </span>
            <div className="flex gap-[3px]">
              {Array.from({ length: NUM_STEPS }, (_, step) => (
                <button
                  key={step}
                  onClick={() => toggleCell(track, step)}
                  className={`h-6 w-6 rounded-sm border transition-all sm:h-7 sm:w-7 ${
                    currentStep === step ? "ring-accent/60 ring-1" : ""
                  } ${step % 4 === 0 ? "ml-[2px]" : ""} ${
                    grid[track][step]
                      ? `${voice.color} border-transparent`
                      : "bg-surface border-border hover:bg-surface-alt"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Waveform */}
      <div className="bg-surface-alt rounded-lg p-4">
        <Waveform analyser={analyser} />
      </div>
    </DemoShell>
  );
}
