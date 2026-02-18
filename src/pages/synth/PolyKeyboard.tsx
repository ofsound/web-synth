import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Knob } from "../../components/Knob";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { Waveform } from "../../components/Waveform";
import { midiToFreq } from "../../utils/midiUtils";

/**
 * Polyphonic keyboard with voice allocation, oldest-voice stealing,
 * and per-voice ADSR envelopes on amplitude and filter.
 */

interface Voice {
  note: number;
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  vca: GainNode;
  startTime: number;
}

export default function PolyKeyboard() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [maxPoly, setMaxPoly] = useState(8);
  const [oscType, setOscType] = useState<OscillatorType>("sawtooth");
  const [cutoff, setCutoff] = useState(3000);
  const [resonance, setResonance] = useState(4);
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.2);
  const [sustain, setSustain] = useState(0.6);
  const [release, setRelease] = useState(0.4);
  const [voiceCount, setVoiceCount] = useState(0);

  const voicesRef = useRef<Voice[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const paramsRef = useRef({
    oscType,
    cutoff,
    resonance,
    attack,
    decay,
    sustain,
    release,
    maxPoly,
  });

  useEffect(() => {
    paramsRef.current = {
      oscType,
      cutoff,
      resonance,
      attack,
      decay,
      sustain,
      release,
      maxPoly,
    };
  }, [oscType, cutoff, resonance, attack, decay, sustain, release, maxPoly]);

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

  /** Release and clean up a single voice */
  const releaseVoice = useCallback(
    (voice: Voice) => {
      if (!ctx) return;
      const p = paramsRef.current;
      const now = ctx.currentTime;

      voice.vca.gain.cancelScheduledValues(now);
      voice.vca.gain.setValueAtTime(voice.vca.gain.value, now);
      voice.vca.gain.setTargetAtTime(0.001, now, Math.max(p.release, 0.01) / 4);

      voice.filter.frequency.cancelScheduledValues(now);
      voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, now);
      voice.filter.frequency.setTargetAtTime(
        p.cutoff * 0.3,
        now,
        Math.max(p.release, 0.01) / 4,
      );

      const stopTime = now + p.release + 0.3;
      voice.osc.stop(stopTime);
      voice.osc.onended = () => {
        voice.osc.disconnect();
        voice.filter.disconnect();
        voice.vca.disconnect();
      };
    },
    [ctx],
  );

  const noteOn = useCallback(
    async (note: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;

      /* Prevent double-trigger */
      if (voicesRef.current.some((v) => v.note === note)) return;

      const p = paramsRef.current;

      /* Voice stealing: if at max, release oldest */
      while (voicesRef.current.length >= p.maxPoly) {
        const oldest = voicesRef.current.shift();
        if (oldest) {
          releaseVoice(oldest);
          setActiveNotes((prev) => {
            const next = new Set(prev);
            next.delete(oldest.note);
            return next;
          });
        }
      }

      const freq = midiToFreq(note);
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = p.oscType;
      osc.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = p.resonance;
      filter.frequency.setValueAtTime(p.cutoff * 0.3, now);
      filter.frequency.linearRampToValueAtTime(
        p.cutoff,
        now + Math.max(p.attack, 0.005),
      );
      filter.frequency.setTargetAtTime(
        p.cutoff * (0.3 + 0.7 * p.sustain),
        now + p.attack,
        Math.max(p.decay, 0.01) / 4,
      );

      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0.001, now);
      vca.gain.exponentialRampToValueAtTime(
        0.3,
        now + Math.max(p.attack, 0.005),
      );
      vca.gain.setTargetAtTime(
        0.3 * p.sustain,
        now + p.attack,
        Math.max(p.decay, 0.01) / 4,
      );

      osc.connect(filter);
      filter.connect(vca);
      vca.connect(analyserRef.current);
      osc.start(now);

      const voice: Voice = { note, osc, filter, vca, startTime: now };
      voicesRef.current.push(voice);
      setActiveNotes((prev) => new Set(prev).add(note));
      setVoiceCount(voicesRef.current.length);
    },
    [ctx, resume, releaseVoice],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (!ctx) return;
      const idx = voicesRef.current.findIndex((v) => v.note === note);
      if (idx === -1) return;

      const voice = voicesRef.current[idx];
      voicesRef.current.splice(idx, 1);
      releaseVoice(voice);

      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      setVoiceCount(voicesRef.current.length);
    },
    [ctx, releaseVoice],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        try {
          v.osc.stop();
        } catch {
          /* ok */
        }
        v.osc.disconnect();
        v.filter.disconnect();
        v.vca.disconnect();
      });
      voicesRef.current = [];
    };
  }, []);

  return (
    <DemoShell
      title="Polyphonic Keyboard"
      description="Polyphonic synthesizer with configurable voice count (1-8), oldest-voice stealing, per-voice lowpass filter, and ADSR amplitude envelope. Play chords and watch voice allocation in action."
      nodes={["OscillatorNode", "BiquadFilterNode", "GainNode (ADSR)"]}
    >
      <Waveform analyser={analyser} height={120} />

      {/* Voice counter */}
      <div className="bg-surface flex items-center gap-4 rounded-lg border border-white/5 p-3">
        <span className="text-text-muted text-xs">Active Voices:</span>
        <span className="text-accent text-lg font-bold tabular-nums">
          {voiceCount} / {maxPoly}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: maxPoly }).map((_, i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < voiceCount ? "bg-accent" : "bg-surface-alt"
              }`}
            />
          ))}
        </div>
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
        {/* Voice & Filter */}
        <div className="border-border rounded-lg border p-4">
          <h3 className="text-text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
            Voice & Filter
          </h3>
          <Slider
            label="Max Polyphony"
            min={1}
            max={8}
            step={1}
            value={maxPoly}
            onChange={setMaxPoly}
          />
          <div className="mt-3 flex flex-wrap justify-center gap-4">
            <Knob
              label="Cutoff"
              min={100}
              max={15000}
              value={cutoff}
              onChange={setCutoff}
              unit="Hz"
            />
            <Knob
              label="Resonance"
              min={0.1}
              max={25}
              value={resonance}
              onChange={setResonance}
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
        endNote={84}
        onNoteOn={noteOn}
        onNoteOff={noteOff}
        activeNotes={activeNotes}
      />
    </DemoShell>
  );
}
