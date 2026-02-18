import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

const NUM_PARTIALS = 8;

interface AdditiveVoice {
  oscs: OscillatorNode[];
  gains: GainNode[];
  vca: GainNode;
}

export default function AdditiveSynth() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [amplitudes, setAmplitudes] = useState<number[]>(() =>
    Array.from({ length: NUM_PARTIALS }, (_, i) => (i === 0 ? 1 : 0)),
  );
  const [multipliers, setMultipliers] = useState<number[]>(() =>
    Array.from({ length: NUM_PARTIALS }, (_, i) => i + 1),
  );

  /* ADSR */
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.2);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(0.4);

  const voicesRef = useRef<Map<number, AdditiveVoice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  /* Refs for latest values in callbacks */
  const amplitudesRef = useRef(amplitudes);
  const multipliersRef = useRef(multipliers);

  useEffect(() => {
    amplitudesRef.current = amplitudes;
  }, [amplitudes]);

  useEffect(() => {
    multipliersRef.current = multipliers;
  }, [multipliers]);

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
      const amps = amplitudesRef.current;
      const muls = multipliersRef.current;

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

      const oscs: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      for (let i = 0; i < NUM_PARTIALS; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = baseFreq * muls[i];

        const g = ctx.createGain();
        g.gain.value = amps[i] / NUM_PARTIALS;

        osc.connect(g);
        g.connect(vca);
        osc.start(now);

        oscs.push(osc);
        gains.push(g);
      }

      vca.connect(analyserRef.current);

      voicesRef.current.set(note, { oscs, gains, vca });
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
        voice.gains.forEach((g) => g.disconnect());
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

  /* Update running voices when amplitudes/multipliers change */
  useEffect(() => {
    voicesRef.current.forEach((voice) => {
      voice.gains.forEach((g, i) => {
        g.gain.value = amplitudes[i] / NUM_PARTIALS;
      });
    });
  }, [amplitudes]);

  useEffect(() => {
    voicesRef.current.forEach((voice, note) => {
      const baseFreq = midiToFreq(note);
      voice.oscs.forEach((o, i) => {
        o.frequency.value = baseFreq * multipliers[i];
      });
    });
  }, [multipliers]);

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

  const setAmplitude = useCallback((i: number, v: number) => {
    setAmplitudes((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }, []);

  const setMultiplier = useCallback((i: number, v: number) => {
    setMultipliers((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }, []);

  return (
    <DemoShell
      title="Additive Synth"
      description="Additive synthesis builds complex timbres by summing multiple sine oscillators at harmonic (or inharmonic) frequencies. Each partial has its own amplitude and frequency multiplier. An ADSR envelope shapes the overall amplitude."
      nodes={["OscillatorNode ×8", "GainNode ×8", "GainNode (VCA)"]}
    >
      <div>
        <h3 className="text-text-muted mb-1 text-xs font-medium">Waveform</h3>
        <Waveform analyser={analyser} height={120} />
      </div>

      {/* Partial controls */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Partials
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {amplitudes.map((amp, i) => (
            <div
              key={i}
              className="bg-surface-alt border-border rounded border p-2"
            >
              <p className="text-text mb-1 text-[11px] font-medium">
                Partial {i + 1}
              </p>
              <Slider
                label="Amp"
                min={0}
                max={1}
                step={0.01}
                value={amp}
                onChange={(v) => setAmplitude(i, v)}
              />
              <div className="mt-1 flex items-center gap-1">
                <span className="text-text-muted text-[10px]">×</span>
                <input
                  type="number"
                  min={0.5}
                  max={32}
                  step={0.5}
                  value={multipliers[i]}
                  onChange={(e) =>
                    setMultiplier(i, parseFloat(e.target.value) || 1)
                  }
                  className="bg-surface-alt border-border text-text w-16 rounded border px-1 py-0.5 text-[11px]"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ADSR */}
      <div className="border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
          Amplitude Envelope
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
