import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

/**
 * Unison Supersaw — stacks multiple slightly-detuned sawtooth oscillators
 * per note for the iconic thick "supersaw" sound used in trance/EDM.
 */

interface SupersawVoice {
  note: number;
  oscs: OscillatorNode[];
  gains: GainNode[];
  master: GainNode;
}

export default function UnisonSupersaw() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [voiceCount, setVoiceCount] = useState(5);
  const [detuneSpread, setDetuneSpread] = useState(20);
  const [mix, setMix] = useState(0.7);
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.15);
  const [sustain, setSustain] = useState(0.7);
  const [release, setRelease] = useState(0.5);

  const voicesRef = useRef<Map<number, SupersawVoice>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const paramsRef = useRef({
    voiceCount,
    detuneSpread,
    mix,
    attack,
    decay,
    sustain,
    release,
  });

  useEffect(() => {
    paramsRef.current = {
      voiceCount,
      detuneSpread,
      mix,
      attack,
      decay,
      sustain,
      release,
    };
  }, [voiceCount, detuneSpread, mix, attack, decay, sustain, release]);

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

      const p = paramsRef.current;
      const freq = midiToFreq(note);
      const now = ctx.currentTime;
      const n = p.voiceCount;

      /* Master gain for this note with ADSR */
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(0.001, now);
      mg.gain.exponentialRampToValueAtTime(
        p.mix * 0.3,
        now + Math.max(p.attack, 0.005),
      );
      mg.gain.setTargetAtTime(
        p.mix * 0.3 * p.sustain,
        now + p.attack,
        Math.max(p.decay, 0.01) / 4,
      );
      mg.connect(analyserRef.current);

      const oscs: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      for (let i = 0; i < n; i++) {
        /* Spread detune evenly: from -spread to +spread */
        const detuneCents =
          n === 1 ? 0 : -p.detuneSpread + (2 * p.detuneSpread * i) / (n - 1);

        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = detuneCents;

        const g = ctx.createGain();
        g.gain.value = 1 / n;

        osc.connect(g);
        g.connect(mg);
        osc.start(now);

        oscs.push(osc);
        gains.push(g);
      }

      voicesRef.current.set(note, { note, oscs, gains, master: mg });
      setActiveNotes((prev) => new Set(prev).add(note));
    },
    [ctx, resume],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const voice = voicesRef.current.get(note);
      if (!voice) return;

      const p = paramsRef.current;
      const now = ctx.currentTime;

      voice.master.gain.cancelScheduledValues(now);
      voice.master.gain.setValueAtTime(voice.master.gain.value, now);
      voice.master.gain.setTargetAtTime(
        0.001,
        now,
        Math.max(p.release, 0.01) / 4,
      );

      const stopTime = now + p.release + 0.3;
      voice.oscs.forEach((osc) => osc.stop(stopTime));
      voice.oscs[0].onended = () => {
        voice.oscs.forEach((osc) => osc.disconnect());
        voice.gains.forEach((g) => g.disconnect());
        voice.master.disconnect();
      };

      voicesRef.current.delete(note);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [ctx],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((voice) => {
        voice.oscs.forEach((osc) => {
          try {
            osc.stop();
          } catch {
            /* ok */
          }
          osc.disconnect();
        });
        voice.gains.forEach((g) => g.disconnect());
        voice.master.disconnect();
      });
      voices.clear();
    };
  }, []);

  return (
    <DemoShell
      title="Unison Supersaw"
      description="Stack 2-8 slightly detuned sawtooth oscillators per note for the iconic thick supersaw sound. Each oscillator is spread evenly across the detune range for a massive, chorus-like effect."
      nodes={["OscillatorNode (xN)", "GainNode (per voice + ADSR)"]}
    >
      <Waveform analyser={analyser} height={120} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Unison controls */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Unison
          </h3>
          <Slider
            label="Voice Count"
            min={2}
            max={8}
            step={1}
            value={voiceCount}
            onChange={setVoiceCount}
          />
          <div className="mt-2">
            <Slider
              label="Detune Spread"
              min={0}
              max={50}
              step={0.5}
              value={detuneSpread}
              onChange={setDetuneSpread}
              unit="ct"
            />
          </div>
          <div className="mt-2">
            <Slider
              label="Mix"
              min={0.1}
              max={1}
              step={0.01}
              value={mix}
              onChange={setMix}
            />
          </div>
        </div>

        {/* ADSR */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Envelope
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
