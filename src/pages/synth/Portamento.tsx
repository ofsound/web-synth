import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

/**
 * Portamento / Glide — monophonic synth whose frequency smoothly glides
 * between notes using AudioParam scheduling.
 */

export default function Portamento() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [glideTime, setGlideTime] = useState(0.3);
  const [glideType, setGlideType] = useState<"linear" | "exponential">(
    "exponential",
  );
  const [oscType, setOscType] = useState<OscillatorType>("sawtooth");
  const [cutoff, setCutoff] = useState(3000);
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.2);
  const [sustain, setSustain] = useState(0.7);
  const [release, setRelease] = useState(0.4);
  const [currentFreq, setCurrentFreq] = useState<number | null>(null);

  const oscRef = useRef<OscillatorNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const vcaRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const heldNotesRef = useRef<number[]>([]);
  const isPlayingRef = useRef(false);

  const paramsRef = useRef({
    glideTime,
    glideType,
    oscType,
    cutoff,
    attack,
    decay,
    sustain,
    release,
  });

  useEffect(() => {
    paramsRef.current = {
      glideTime,
      glideType,
      oscType,
      cutoff,
      attack,
      decay,
      sustain,
      release,
    };
  }, [glideTime, glideType, oscType, cutoff, attack, decay, sustain, release]);

  /* Static graph setup */
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

  /** Start or glide the persistent oscillator */
  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;

      const p = paramsRef.current;
      const freq = midiToFreq(note);
      const now = ctx.currentTime;

      /* Track held note */
      if (!heldNotesRef.current.includes(note)) {
        heldNotesRef.current.push(note);
      }

      if (!isPlayingRef.current) {
        /* Create fresh oscillator chain */
        const osc = ctx.createOscillator();
        osc.type = p.oscType;
        osc.frequency.value = freq;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = p.cutoff;
        filter.Q.value = 2;

        const vca = ctx.createGain();
        vca.gain.setValueAtTime(0.001, now);
        vca.gain.exponentialRampToValueAtTime(
          0.35,
          now + Math.max(p.attack, 0.005),
        );
        vca.gain.setTargetAtTime(
          0.35 * p.sustain,
          now + p.attack,
          Math.max(p.decay, 0.01) / 4,
        );

        osc.connect(filter);
        filter.connect(vca);
        vca.connect(analyserRef.current);
        osc.start(now);

        oscRef.current = osc;
        filterRef.current = filter;
        vcaRef.current = vca;
        isPlayingRef.current = true;
      } else if (oscRef.current && vcaRef.current) {
        /* Glide to the new frequency */
        const osc = oscRef.current;
        osc.frequency.cancelScheduledValues(now);

        if (p.glideTime < 0.005) {
          osc.frequency.setValueAtTime(freq, now);
        } else if (p.glideType === "linear") {
          osc.frequency.setValueAtTime(osc.frequency.value, now);
          osc.frequency.linearRampToValueAtTime(freq, now + p.glideTime);
        } else {
          osc.frequency.setTargetAtTime(freq, now, p.glideTime / 4);
        }

        /* Re-trigger envelope slightly for legato articulation */
        const vca = vcaRef.current;
        vca.gain.cancelScheduledValues(now);
        vca.gain.setValueAtTime(vca.gain.value, now);
        vca.gain.exponentialRampToValueAtTime(
          0.35,
          now + Math.max(p.attack * 0.5, 0.005),
        );
        vca.gain.setTargetAtTime(
          0.35 * p.sustain,
          now + p.attack * 0.5,
          Math.max(p.decay, 0.01) / 4,
        );
      }

      /* Update filter cutoff live */
      if (filterRef.current) {
        filterRef.current.frequency.value = p.cutoff;
      }

      setCurrentFreq(freq);
      setActiveNotes(new Set(heldNotesRef.current));
    },
    [ctx, resume],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;

      heldNotesRef.current = heldNotesRef.current.filter((n) => n !== note);
      setActiveNotes(new Set(heldNotesRef.current));

      /* If other notes are still held, glide to the most recent */
      if (heldNotesRef.current.length > 0) {
        const lastNote = heldNotesRef.current[heldNotesRef.current.length - 1];
        const freq = midiToFreq(lastNote);
        const now = ctx.currentTime;
        const p = paramsRef.current;

        if (oscRef.current) {
          oscRef.current.frequency.cancelScheduledValues(now);
          if (p.glideType === "linear") {
            oscRef.current.frequency.setValueAtTime(
              oscRef.current.frequency.value,
              now,
            );
            oscRef.current.frequency.linearRampToValueAtTime(
              freq,
              now + p.glideTime,
            );
          } else {
            oscRef.current.frequency.setTargetAtTime(
              freq,
              now,
              Math.max(p.glideTime, 0.01) / 4,
            );
          }
        }
        setCurrentFreq(freq);
        return;
      }

      /* No notes held — release */
      const p = paramsRef.current;
      const now = ctx.currentTime;

      if (vcaRef.current) {
        vcaRef.current.gain.cancelScheduledValues(now);
        vcaRef.current.gain.setValueAtTime(vcaRef.current.gain.value, now);
        vcaRef.current.gain.setTargetAtTime(
          0.001,
          now,
          Math.max(p.release, 0.01) / 4,
        );
      }

      const stopTime = now + p.release + 0.3;
      if (oscRef.current) {
        oscRef.current.stop(stopTime);
        oscRef.current.onended = () => {
          oscRef.current?.disconnect();
          filterRef.current?.disconnect();
          vcaRef.current?.disconnect();
          oscRef.current = null;
          filterRef.current = null;
          vcaRef.current = null;
          isPlayingRef.current = false;
        };
      }

      setCurrentFreq(null);
    },
    [ctx],
  );

  /* Live filter cutoff update */
  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.value = cutoff;
  }, [cutoff]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      oscRef.current?.disconnect();
      filterRef.current?.disconnect();
      vcaRef.current?.disconnect();
    };
  }, []);

  return (
    <DemoShell
      title="Portamento / Glide"
      description="Monophonic synthesizer with smooth pitch glide between notes. The oscillator frequency transitions smoothly from the previous note to the new note, creating a classic portamento effect."
      nodes={["OscillatorNode", "BiquadFilterNode", "GainNode (ADSR)"]}
    >
      <Waveform analyser={analyser} height={120} />

      {/* Current frequency display */}
      <div className="bg-surface flex items-center gap-4 rounded-lg border border-white/5 p-3">
        <span className="text-text-muted text-xs">Current Frequency:</span>
        <span className="text-accent text-lg font-bold tabular-nums">
          {currentFreq ? `${currentFreq.toFixed(1)} Hz` : "—"}
        </span>
      </div>

      {/* Oscillator type */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted text-xs">Oscillator:</span>
        {(["sawtooth", "square", "triangle", "sine"] as OscillatorType[]).map(
          (t) => (
            <button
              key={t}
              onClick={() => setOscType(t)}
              className={`rounded border px-3 py-1 text-xs capitalize ${
                oscType === t
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {t}
            </button>
          ),
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Glide controls */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Portamento
          </h3>
          <Slider
            label="Glide Time"
            min={0}
            max={2}
            step={0.01}
            value={glideTime}
            onChange={setGlideTime}
            unit="s"
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-text-muted text-xs">Glide Type:</span>
            {(["linear", "exponential"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setGlideType(t)}
                className={`rounded border px-3 py-1 text-xs capitalize ${
                  glideType === t
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Slider
              label="Filter Cutoff"
              min={100}
              max={15000}
              step={10}
              value={cutoff}
              onChange={setCutoff}
              unit="Hz"
            />
          </div>
        </div>

        {/* ADSR */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Amp Envelope
          </h3>
          <div className="grid grid-cols-2 gap-2">
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
