import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

/*
 * Wavetable presets — each is an array of harmonic amplitudes.
 * A PeriodicWave is built from these coefficients.
 */
const WAVETABLE_DEFS: Record<string, number[]> = {
  organ: [0, 1, 0, 0.5, 0, 0.33, 0, 0.25, 0, 0.2, 0, 0.16, 0, 0.14, 0, 0.12],
  brass: [
    0.8, 1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05, 0.03, 0.02, 0, 0, 0,
    0,
  ],
  pad: [
    1, 0.6, 0.3, 0.15, 0.4, 0.1, 0.2, 0.05, 0.1, 0.03, 0.05, 0.01, 0.02, 0.01,
    0, 0,
  ],
  bell: [1, 0, 0.5, 0, 0.3, 0, 0.7, 0, 0.1, 0, 0.4, 0, 0.05, 0, 0.2, 0],
};

const TABLE_NAMES = Object.keys(WAVETABLE_DEFS);
const NUM_HARMONICS = 16;

function buildWave(ctx: AudioContext, amplitudes: number[]): PeriodicWave {
  const real = new Float32Array(NUM_HARMONICS + 1);
  const imag = new Float32Array(NUM_HARMONICS + 1);
  for (let i = 0; i < NUM_HARMONICS; i++) {
    imag[i + 1] = amplitudes[i] ?? 0;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Linearly interpolate two coefficient arrays */
function lerpArrays(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v * (1 - t) + (b[i] ?? 0) * t);
}

interface WTVoice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gainA: GainNode;
  gainB: GainNode;
  vca: GainNode;
}

export default function WavetableSynth() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [tableIndex, setTableIndex] = useState(0);
  const [morph, setMorph] = useState(0);

  /* ADSR */
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.3);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(0.5);

  const voicesRef = useRef<Map<number, WTVoice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const tableIndexRef = useRef(tableIndex);
  const morphRef = useRef(morph);

  useEffect(() => {
    tableIndexRef.current = tableIndex;
  }, [tableIndex]);

  useEffect(() => {
    morphRef.current = morph;
  }, [morph]);

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

  /** Get the two adjacent table names and local morph parameter */
  const getTablePair = useCallback(() => {
    const idx = tableIndexRef.current;
    const m = morphRef.current;
    const idxA = idx;
    const idxB = Math.min(idx + 1, TABLE_NAMES.length - 1);
    return { nameA: TABLE_NAMES[idxA], nameB: TABLE_NAMES[idxB], morph: m };
  }, []);

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;
      if (voicesRef.current.has(note)) return;

      const freq = midiToFreq(note);
      const now = ctx.currentTime;
      const { nameA, nameB, morph: m } = getTablePair();
      const ampsA = WAVETABLE_DEFS[nameA];
      const ampsB = WAVETABLE_DEFS[nameB];

      /* Two oscillators for crossfade morphing */
      const oscA = ctx.createOscillator();
      oscA.frequency.value = freq;
      oscA.setPeriodicWave(buildWave(ctx, ampsA));

      const oscB = ctx.createOscillator();
      oscB.frequency.value = freq;
      oscB.setPeriodicWave(buildWave(ctx, ampsB));

      const gainA = ctx.createGain();
      gainA.gain.value = 1 - m;
      const gainB = ctx.createGain();
      gainB.gain.value = m;

      /* Master VCA with ADSR */
      const vca = ctx.createGain();
      vca.gain.cancelScheduledValues(now);
      vca.gain.setValueAtTime(0.001, now);
      vca.gain.exponentialRampToValueAtTime(0.3, now + Math.max(attack, 0.005));
      vca.gain.setTargetAtTime(
        0.3 * sustain,
        now + attack,
        Math.max(decay, 0.01) / 4,
      );

      oscA.connect(gainA);
      oscB.connect(gainB);
      gainA.connect(vca);
      gainB.connect(vca);
      vca.connect(analyserRef.current);

      oscA.start(now);
      oscB.start(now);

      voicesRef.current.set(note, { oscA, oscB, gainA, gainB, vca });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [ctx, resume, attack, decay, sustain, getTablePair],
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
      voice.oscA.stop(stopTime);
      voice.oscB.stop(stopTime);
      voice.oscA.onended = () => {
        voice.oscA.disconnect();
        voice.oscB.disconnect();
        voice.gainA.disconnect();
        voice.gainB.disconnect();
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

  /* Update morph crossfade on running voices */
  useEffect(() => {
    voicesRef.current.forEach((voice) => {
      voice.gainA.gain.value = 1 - morph;
      voice.gainB.gain.value = morph;
    });
  }, [morph]);

  /* Re-build wavetables on running voices when tableIndex changes */
  useEffect(() => {
    if (!ctx) return;
    const idxA = tableIndex;
    const idxB = Math.min(tableIndex + 1, TABLE_NAMES.length - 1);
    const ampsA = WAVETABLE_DEFS[TABLE_NAMES[idxA]];
    const ampsB = WAVETABLE_DEFS[TABLE_NAMES[idxB]];
    const waveA = buildWave(ctx, ampsA);
    const waveB = buildWave(ctx, ampsB);
    voicesRef.current.forEach((voice) => {
      voice.oscA.setPeriodicWave(waveA);
      voice.oscB.setPeriodicWave(waveB);
    });
  }, [ctx, tableIndex]);

  /* Cleanup */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        [v.oscA, v.oscB].forEach((o) => {
          try {
            o.stop();
          } catch {
            /* ok */
          }
        });
      });
    };
  }, []);

  /* Compute blended amplitudes for display */
  const { nameA, nameB } = (() => {
    const idxA = tableIndex;
    const idxB = Math.min(tableIndex + 1, TABLE_NAMES.length - 1);
    return { nameA: TABLE_NAMES[idxA], nameB: TABLE_NAMES[idxB] };
  })();
  const displayAmps = lerpArrays(
    WAVETABLE_DEFS[nameA],
    WAVETABLE_DEFS[nameB],
    morph,
  );

  return (
    <DemoShell
      title="Wavetable Synth"
      description="Wavetable synthesis stores multiple timbres as PeriodicWave objects and morphs between them. Select a base wavetable and use the morph slider to crossfade between it and the next table. Two oscillators run simultaneously with gain crossfading for smooth transitions."
      nodes={[
        "OscillatorNode ×2 (crossfade pair)",
        "PeriodicWave (per table)",
        "GainNode (crossfade + VCA)",
      ]}
    >
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
        <Waveform analyser={analyser} height={120} />
      </div>

      {/* Harmonic preview */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          Current Harmonics (blended)
        </h3>
        <div className="flex items-end gap-1" style={{ height: 60 }}>
          {displayAmps.map((a, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-blue-400/70"
              style={{ height: `${Math.abs(a) * 100}%` }}
              title={`H${i + 1}: ${a.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {displayAmps.map((_, i) => (
            <span
              key={i}
              className="text-text-muted flex-1 text-center text-[8px]"
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Wavetable selector + morph */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Wavetable
          </h3>
          <div className="flex flex-wrap gap-2">
            {TABLE_NAMES.map((name, i) => (
              <button
                key={name}
                onClick={() => {
                  setTableIndex(i);
                  setMorph(0);
                }}
                className={`rounded border px-3 py-1 text-xs capitalize ${
                  tableIndex === i
                    ? "border-accent text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="text-text-muted mt-2 text-[10px]">
            Morphing: <span className="text-text capitalize">{nameA}</span>
            {" → "}
            <span className="text-text capitalize">{nameB}</span>
          </p>
        </div>

        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Morph
          </h3>
          <Slider
            label="Morph"
            min={0}
            max={1}
            step={0.01}
            value={morph}
            onChange={setMorph}
          />
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
