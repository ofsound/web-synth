import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Knob } from "../../components/Knob";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

/*
 * 6-Operator FM Synth (DX7-style)
 *
 * Operators are numbered 1-6. Each has a frequency ratio and output level.
 * An "algorithm" defines how operators are connected:
 *   - An operator can modulate another operator's frequency (modulator)
 *   - Or it can output directly to the audio bus (carrier)
 *
 * Algorithm 1: 6→5→4→3→2→1→out  (serial chain)
 * Algorithm 2: (3→2, 6→5, 4) all modulate 1→out  (3 modulators into carrier)
 * Algorithm 3: (2→1)+(4→3)+(6→5)→out  (3 parallel 2-op pairs)
 */

const NUM_OPS = 6;

interface OpParams {
  ratio: number;
  level: number;
}

interface FM6Voice {
  oscs: OscillatorNode[];
  opGains: GainNode[];
  vca: GainNode;
}

type Algorithm = (
  oscs: OscillatorNode[],
  opGains: GainNode[],
  vca: GainNode,
) => void;

/** Algorithm 1: 6→5→4→3→2→1→out */
const algorithm1: Algorithm = (oscs, opGains, vca) => {
  for (let i = NUM_OPS - 1; i >= 1; i--) {
    oscs[i].connect(opGains[i]);
    opGains[i].connect(oscs[i - 1].frequency);
  }
  oscs[0].connect(opGains[0]);
  opGains[0].connect(vca);
};

/** Algorithm 2: (3→2, 6→5, 4) all into op1→out */
const algorithm2: Algorithm = (oscs, opGains, vca) => {
  /* pair 3→2 */
  oscs[2].connect(opGains[2]);
  opGains[2].connect(oscs[1].frequency);
  oscs[1].connect(opGains[1]);
  opGains[1].connect(oscs[0].frequency);

  /* pair 6→5 */
  oscs[5].connect(opGains[5]);
  opGains[5].connect(oscs[4].frequency);
  oscs[4].connect(opGains[4]);
  opGains[4].connect(oscs[0].frequency);

  /* op4 direct into op1 */
  oscs[3].connect(opGains[3]);
  opGains[3].connect(oscs[0].frequency);

  /* op1 → out */
  oscs[0].connect(opGains[0]);
  opGains[0].connect(vca);
};

/** Algorithm 3: (2→1)+(4→3)+(6→5)→out */
const algorithm3: Algorithm = (oscs, opGains, vca) => {
  /* pair 2→1 */
  oscs[1].connect(opGains[1]);
  opGains[1].connect(oscs[0].frequency);
  oscs[0].connect(opGains[0]);
  opGains[0].connect(vca);

  /* pair 4→3 */
  oscs[3].connect(opGains[3]);
  opGains[3].connect(oscs[2].frequency);
  oscs[2].connect(opGains[2]);
  opGains[2].connect(vca);

  /* pair 6→5 */
  oscs[5].connect(opGains[5]);
  opGains[5].connect(oscs[4].frequency);
  oscs[4].connect(opGains[4]);
  opGains[4].connect(vca);
};

const ALGORITHMS: Algorithm[] = [algorithm1, algorithm2, algorithm3];

const ALGO_LABELS: string[] = [
  "1: 6→5→4→3→2→1→out",
  "2: (3→2, 6→5, 4)→1→out",
  "3: (2→1)+(4→3)+(6→5)→out",
];

function defaultOps(): OpParams[] {
  return Array.from({ length: NUM_OPS }, (_, i) => ({
    ratio: i + 1,
    level: i === 0 ? 1 : 0.5,
  }));
}

export default function FMSynth6Op() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [algoIndex, setAlgoIndex] = useState(0);
  const [ops, setOps] = useState<OpParams[]>(defaultOps);

  /* ADSR */
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.3);
  const [sustain, setSustain] = useState(0.4);
  const [release, setRelease] = useState(0.5);

  const voicesRef = useRef<Map<number, FM6Voice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const opsRef = useRef(ops);
  const algoRef = useRef(algoIndex);

  useEffect(() => {
    opsRef.current = ops;
  }, [ops]);

  useEffect(() => {
    algoRef.current = algoIndex;
  }, [algoIndex]);

  useEffect(() => {
    if (!ctx || !masterGain) return;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.connect(masterGain);
    analyserRef.current = an;
    queueMicrotask(() => setAnalyser(an));
    return () => {
      an.disconnect();
    };
  }, [ctx, masterGain]);

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;
      if (voicesRef.current.has(note)) return;

      const baseFreq = midiToFreq(note);
      const now = ctx.currentTime;
      const opParams = opsRef.current;
      const algo = ALGORITHMS[algoRef.current];

      /* VCA with ADSR */
      const vca = ctx.createGain();
      vca.gain.cancelScheduledValues(now);
      vca.gain.setValueAtTime(0.001, now);
      vca.gain.exponentialRampToValueAtTime(
        0.25,
        now + Math.max(attack, 0.005),
      );
      vca.gain.setTargetAtTime(
        0.25 * sustain,
        now + attack,
        Math.max(decay, 0.01) / 4,
      );

      /* Create operators */
      const oscs: OscillatorNode[] = [];
      const opGains: GainNode[] = [];

      for (let i = 0; i < NUM_OPS; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = baseFreq * opParams[i].ratio;

        const g = ctx.createGain();
        /* Modulator gains need to be in Hz range for audible FM effect */
        g.gain.value = opParams[i].level * baseFreq * opParams[i].ratio;

        oscs.push(osc);
        opGains.push(g);
      }

      /* Wire up according to algorithm */
      algo(oscs, opGains, vca);
      vca.connect(analyserRef.current);

      /* Start all oscillators */
      for (const osc of oscs) osc.start(now);

      voicesRef.current.set(note, { oscs, opGains, vca });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [ctx, resume, attack, decay, sustain],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      const now = ctx.currentTime;
      voice.vca.gain.cancelScheduledValues(now);
      voice.vca.gain.setValueAtTime(voice.vca.gain.value, now);
      voice.vca.gain.setTargetAtTime(0.001, now, Math.max(release, 0.01) / 4);

      const stopTime = now + release + 0.3;
      voice.oscs.forEach((o) => o.stop(stopTime));
      voice.oscs[0].onended = () => {
        voice.oscs.forEach((o) => o.disconnect());
        voice.opGains.forEach((g) => g.disconnect());
        voice.vca.disconnect();
      };

      voicesRef.current.delete(note);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [ctx, release],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        v.oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* ok */
          }
        });
      });
    };
  }, []);

  const setOpParam = useCallback(
    (index: number, key: keyof OpParams, value: number) => {
      setOps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [key]: value };
        return next;
      });
    },
    [],
  );

  return (
    <DemoShell
      title="FM Synth (6-Operator)"
      description="Six-operator FM synthesis inspired by the Yamaha DX7. Each operator is a sine oscillator with a frequency ratio and output level. An 'algorithm' defines the modulation routing — operators can either modulate another operator's frequency or output directly as carriers. Different algorithms produce radically different timbres from the same parameters."
      nodes={[
        "OscillatorNode ×6",
        "GainNode ×6 (operator levels)",
        "GainNode (VCA + ADSR)",
      ]}
    >
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
        <Waveform analyser={analyser} height={120} />
      </div>

      {/* Algorithm selector */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Algorithm
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALGO_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setAlgoIndex(i)}
              className={`rounded border px-3 py-1.5 font-mono text-[11px] ${
                algoIndex === i
                  ? "border-accent text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Operator controls */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Operators
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {ops.map((op, i) => (
            <div
              key={i}
              className="bg-surface-alt border-border flex flex-col items-center gap-2 rounded border p-3"
            >
              <span className="text-text text-xs font-bold">Op {i + 1}</span>
              <Knob
                label="Ratio"
                min={0.5}
                max={16}
                value={op.ratio}
                onChange={(v) => setOpParam(i, "ratio", v)}
              />
              <Knob
                label="Level"
                min={0}
                max={1}
                value={op.level}
                onChange={(v) => setOpParam(i, "level", v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ADSR */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Envelope
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Slider
            label="Attack"
            min={0.005}
            max={2}
            step={0.005}
            value={attack}
            onChange={setAttack}
            unit="s"
          />
          <Slider
            label="Decay"
            min={0.01}
            max={2}
            step={0.01}
            value={decay}
            onChange={setDecay}
            unit="s"
          />
          <Slider
            label="Sustain"
            min={0}
            max={1}
            step={0.01}
            value={sustain}
            onChange={setSustain}
          />
          <Slider
            label="Release"
            min={0.01}
            max={3}
            step={0.01}
            value={release}
            onChange={setRelease}
            unit="s"
          />
        </div>
      </div>

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
