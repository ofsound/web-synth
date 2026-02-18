import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq, midiToNoteName } from "../../utils/midiUtils";
import { Scheduler } from "../../utils/scheduler";

type Pattern = "up" | "down" | "up-down" | "random";

export default function Arpeggiator() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [tempo, setTempo] = useState(140);
  const [pattern, setPattern] = useState<Pattern>("up");
  const [octaveRange, setOctaveRange] = useState(1);
  const [gate, setGate] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [currentArpNote, setCurrentArpNote] = useState<number | null>(null);

  const heldNotesRef = useRef<Set<number>>(new Set());
  const schedulerRef = useRef<Scheduler | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const octaveRangeRef = useRef(octaveRange);
  octaveRangeRef.current = octaveRange;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const stepIndexRef = useRef(0);
  const upDownDirRef = useRef<1 | -1>(1);

  /* Create analyser */
  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.connect(masterGain);
    analyserRef.current = an;
    setAnalyser(an);
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  /* Build note sequence from held notes */
  const getSequence = useCallback((): number[] => {
    const held = Array.from(heldNotesRef.current).sort((a, b) => a - b);
    if (held.length === 0) return [];

    const expanded: number[] = [];
    for (let oct = 0; oct < octaveRangeRef.current; oct++) {
      for (const n of held) {
        expanded.push(n + oct * 12);
      }
    }
    return expanded;
  }, []);

  /* Pick next note based on pattern */
  const pickNext = useCallback((seq: number[]): number => {
    if (seq.length === 0) return 60;
    const pat = patternRef.current;

    if (pat === "random") {
      return seq[Math.floor(Math.random() * seq.length)];
    }

    let idx = stepIndexRef.current % seq.length;

    if (pat === "down") {
      idx = seq.length - 1 - idx;
    } else if (pat === "up-down" && seq.length > 1) {
      const cycleLen = (seq.length - 1) * 2;
      const pos = stepIndexRef.current % cycleLen;
      idx = pos < seq.length ? pos : cycleLen - pos;
    }

    stepIndexRef.current++;
    return seq[Math.max(0, Math.min(idx, seq.length - 1))];
  }, []);

  /* Play a single note at scheduled time */
  const playNoteAt = useCallback(
    (note: number, time: number) => {
      if (!ctx || !analyserRef.current) return;
      const freq = midiToFreq(note);
      const dur = (60 / tempoRef.current) * gateRef.current;

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(2000 + freq * 2, 18000), time);
      filter.Q.setValueAtTime(1, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + 0.005);
      gain.gain.setTargetAtTime(0.1, time + 0.005, 0.05);
      gain.gain.setTargetAtTime(
        0.001,
        time + Math.max(dur * 0.8, 0.01),
        Math.max(dur * 0.1, 0.01),
      );

      osc.connect(filter).connect(gain).connect(analyserRef.current);
      osc.start(time);
      osc.stop(time + dur + 0.15);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    },
    [ctx],
  );

  /* Scheduler step callback — stored in a ref so scheduler always gets latest */
  const onStepRef = useRef<(time: number, step: number) => void>(() => {});
  onStepRef.current = (time: number, step: number) => {
    setCurrentStep(step);
    const seq = getSequence();
    if (seq.length === 0) return;
    const note = pickNext(seq);
    playNoteAt(note, time);
    setCurrentArpNote(note);
  };

  /* Create scheduler once */
  useEffect(() => {
    if (!ctx) return;
    const sched = new Scheduler(
      ctx,
      (time, step) => onStepRef.current(time, step),
      { tempo, totalSteps: 9999, subdivision: 0.25 },
    );
    schedulerRef.current = sched;
    return () => {
      sched.stop();
      schedulerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  /* Sync tempo */
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
      setCurrentArpNote(null);
    } else {
      stepIndexRef.current = 0;
      upDownDirRef.current = 1;
      sched.start();
      setPlaying(true);
    }
  }, [playing, resume]);

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      heldNotesRef.current.add(note);
      setActiveNotes(new Set(heldNotesRef.current));
      stepIndexRef.current = 0;
    },
    [resume],
  );

  const noteOff = useCallback((note: number) => {
    heldNotesRef.current.delete(note);
    setActiveNotes(new Set(heldNotesRef.current));
  }, []);

  const patterns: Pattern[] = ["up", "down", "up-down", "random"];

  return (
    <DemoShell
      title="Arpeggiator"
      description="Hold notes on the keyboard and hear them played back in sequence at tempo. Supports multiple patterns and octave ranges."
      nodes={["OscillatorNode", "BiquadFilterNode", "GainNode"]}
    >
      {/* Controls */}
      <div className="bg-surface-alt rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
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

          <div className="flex gap-2">
            {patterns.map((p) => (
              <button
                key={p}
                onClick={() => setPattern(p)}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  pattern === p
                    ? "bg-accent text-white"
                    : "bg-surface text-text-muted border-border border"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Slider
            label="Tempo"
            min={60}
            max={300}
            step={1}
            value={tempo}
            onChange={setTempo}
            unit=" BPM"
          />
          <Slider
            label="Octaves"
            min={1}
            max={3}
            step={1}
            value={octaveRange}
            onChange={setOctaveRange}
          />
          <Slider
            label="Gate"
            min={0.1}
            max={0.9}
            step={0.05}
            value={gate}
            onChange={setGate}
          />
        </div>
      </div>

      {/* Current note display */}
      {currentArpNote !== null && (
        <div className="bg-surface-alt rounded-lg p-3 text-center">
          <span className="text-text-muted text-xs">
            Step {currentStep + 1} — Current Note:{" "}
          </span>
          <span className="text-accent text-lg font-bold">
            {midiToNoteName(currentArpNote)}
          </span>
          <span className="text-text-muted ml-2 text-xs">
            ({midiToFreq(currentArpNote).toFixed(1)} Hz)
          </span>
        </div>
      )}

      {/* Waveform */}
      <div className="bg-surface-alt rounded-lg p-4">
        <Waveform analyser={analyser} />
      </div>

      {/* Keyboard */}
      <PianoKeyboard
        startNote={48}
        endNote={72}
        onNoteOn={noteOn}
        onNoteOff={noteOff}
        activeNotes={activeNotes}
      />
    </DemoShell>
  );
}
