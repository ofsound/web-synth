import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Slider } from "../../components/Slider";
import { Waveform } from "../../components/Waveform";
import { PianoKeyboard } from "../../components/PianoKeyboard";
import { midiToFreq } from "../../utils/midiUtils";

/**
 * Karplus-Strong plucked-string synthesis.
 *
 * Noise burst → DelayNode (feedback loop with lowpass filter + feedback gain) → output.
 * Delay time = 1/frequency. Lowpass smooths each cycle (damping). Feedback gain controls decay.
 */

interface Voice {
  source: AudioBufferSourceNode;
  delay: DelayNode;
  filter: BiquadFilterNode;
  fbGain: GainNode;
  vcaGain: GainNode;
}

export default function KarplusStrong() {
  const { ctx, resume, masterGain } = useAudioContext();

  const [frequency, setFrequency] = useState(220);
  const [damping, setDamping] = useState(4000);
  const [feedback, setFeedback] = useState(0.994);
  const [decayTime, setDecayTime] = useState(3);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  /* Keep latest params in refs for callbacks */
  const dampingRef = useRef(damping);
  const feedbackRef = useRef(feedback);
  const decayTimeRef = useRef(decayTime);

  useEffect(() => {
    dampingRef.current = damping;
  }, [damping]);

  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  useEffect(() => {
    decayTimeRef.current = decayTime;
  }, [decayTime]);

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

  const pluck = useCallback(
    async (freq: number, key?: number) => {
      await resume();
      if (!ctx || !analyserRef.current) return;

      /* Stop existing voice on the same key */
      if (key !== undefined && voicesRef.current.has(key)) {
        const old = voicesRef.current.get(key)!;
        try {
          old.source.stop();
        } catch {
          /* already stopped */
        }
        old.vcaGain.disconnect();
        voicesRef.current.delete(key);
      }

      const now = ctx.currentTime;
      const delaySeconds = 1 / freq;
      const burstLen = Math.max(Math.round(ctx.sampleRate / freq), 2);

      /* Noise burst buffer */
      const buf = ctx.createBuffer(1, burstLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < burstLen; i++) data[i] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = buf;

      /* Delay for feedback loop */
      const delay = ctx.createDelay(1);
      delay.delayTime.value = delaySeconds;

      /* Lowpass filter for damping */
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = dampingRef.current;
      filter.Q.value = 0;

      /* Feedback gain */
      const fbGain = ctx.createGain();
      fbGain.gain.value = feedbackRef.current;

      /* Output VCA with timed decay envelope */
      const vcaGain = ctx.createGain();
      vcaGain.gain.setValueAtTime(0.5, now);
      vcaGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + decayTimeRef.current,
      );

      /* Routing:
         source → delay → filter → fbGain → delay (feedback)
                  delay → vcaGain → analyser */
      source.connect(delay);
      delay.connect(filter);
      filter.connect(fbGain);
      fbGain.connect(delay);
      delay.connect(vcaGain);
      vcaGain.connect(analyserRef.current);

      source.start(now);

      const voice: Voice = { source, delay, filter, fbGain, vcaGain };
      const voiceKey = key ?? Date.now();
      voicesRef.current.set(voiceKey, voice);

      if (key !== undefined) {
        setActiveNotes((prev) => new Set(prev).add(key));
      }

      /* Auto-cleanup after decay using scheduled stop */
      const stopTime = now + decayTimeRef.current + 0.5;
      source.stop(stopTime);
      source.onended = () => {
        vcaGain.disconnect();
        voicesRef.current.delete(voiceKey);
        if (key !== undefined) {
          setActiveNotes((prev) => {
            const s = new Set(prev);
            s.delete(key);
            return s;
          });
        }
      };
    },
    [ctx, resume],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      voices.forEach((v) => {
        try {
          v.source.stop();
        } catch {
          /* noop */
        }
        v.vcaGain.disconnect();
      });
      voices.clear();
    };
  }, []);

  const handleNoteOn = useCallback(
    (note: number) => pluck(midiToFreq(note), note),
    [pluck],
  );

  const handleNoteOff = useCallback(() => {
    /* Voices self-decay — nothing extra needed */
  }, []);

  return (
    <DemoShell
      title="Karplus-Strong Plucked String"
      description="Physical modeling synthesis using the Karplus-Strong algorithm. A short noise burst feeds into a tuned delay line with lowpass filtering in the feedback loop, producing realistic plucked-string sounds."
      nodes={[
        "AudioBufferSourceNode",
        "DelayNode",
        "BiquadFilterNode",
        "GainNode",
      ]}
    >
      {/* Controls */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Controls</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Slider
            label="Frequency"
            min={80}
            max={1000}
            step={1}
            value={frequency}
            onChange={setFrequency}
            unit="Hz"
          />
          <Slider
            label="Damping"
            min={500}
            max={8000}
            step={10}
            value={damping}
            onChange={setDamping}
            unit="Hz"
          />
          <Slider
            label="Feedback"
            min={0.9}
            max={0.999}
            step={0.001}
            value={feedback}
            onChange={setFeedback}
          />
          <Slider
            label="Decay Time"
            min={0.5}
            max={8}
            step={0.1}
            value={decayTime}
            onChange={setDecayTime}
            unit="s"
          />
        </div>

        <button
          type="button"
          className="bg-accent hover:bg-accent/80 mt-4 rounded-md px-4 py-2 text-sm font-medium text-white transition"
          onClick={() => pluck(frequency)}
        >
          Pluck
        </button>
      </div>

      {/* Waveform */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <Waveform analyser={analyser} />
      </div>

      {/* Piano Keyboard */}
      <div className="bg-surface rounded-lg border border-white/5 p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Keyboard</h2>
        <PianoKeyboard
          startNote={48}
          endNote={84}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
          activeNotes={activeNotes}
        />
      </div>
    </DemoShell>
  );
}
