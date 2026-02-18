import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioContext } from "../../hooks/useAudioContext";
import { DemoShell } from "../../components/DemoShell";
import { Toggle } from "../../components/Toggle";
import { Waveform } from "../../components/Waveform";

type SourceType = "oscillator" | "microphone";

export default function AudioRecorder() {
  const { ctx, resume, masterGain } = useAudioContext();
  const [sourceType, setSourceType] = useState<SourceType>("oscillator");
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const oscRef = useRef<OscillatorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef(0);
  const startTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  /* Build graph: source → analyser → masterGain + destination */
  const startRecording = useCallback(async () => {
    await resume();
    if (!ctx || !masterGain) return;

    /* Clean up previous blob */
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    analyserRef.current = an;
    setAnalyser(an);

    const dest = ctx.createMediaStreamDestination();
    destRef.current = dest;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    gainRef.current = gain;

    gain.connect(an);
    an.connect(masterGain);
    an.connect(dest);

    if (sourceType === "oscillator") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        micStreamRef.current = stream;
        const micSource = ctx.createMediaStreamSource(stream);
        micSource.connect(gain);
        micSourceRef.current = micSource;
        setError(null);
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone permission denied."
            : "Could not access microphone.",
        );
        an.disconnect();
        gain.disconnect();
        dest.disconnect();
        return;
      }
    }

    /* MediaRecorder */
    chunksRef.current = [];
    const recorder = new MediaRecorder(dest.stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    };
    recorder.start();
    recorderRef.current = recorder;

    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 200);

    setRecording(true);
    setDuration(0);
  }, [ctx, resume, masterGain, sourceType, blobUrl]);

  const stopRecording = useCallback(() => {
    window.clearInterval(timerRef.current);

    try {
      recorderRef.current?.stop();
    } catch {
      /* ok */
    }
    recorderRef.current = null;

    try {
      oscRef.current?.stop();
    } catch {
      /* ok */
    }
    oscRef.current = null;

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    try {
      micSourceRef.current?.disconnect();
    } catch {
      /* ok */
    }
    micSourceRef.current = null;

    try {
      gainRef.current?.disconnect();
    } catch {
      /* ok */
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* ok */
    }
    try {
      destRef.current?.disconnect();
    } catch {
      /* ok */
    }

    setRecording(false);
    setAnalyser(null);
  }, []);

  const togglePlayback = useCallback(() => {
    if (!blobUrl) return;

    if (playing && audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
      setPlaying(false);
      return;
    }

    const audio = new Audio(blobUrl);
    audio.onended = () => setPlaying(false);
    audio.play();
    audioElRef.current = audio;
    setPlaying(true);
  }, [blobUrl, playing]);

  const download = useCallback(() => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `recording-${Date.now()}.webm`;
    a.click();
  }, [blobUrl]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        oscRef.current?.stop();
      } catch {
        /* ok */
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        gainRef.current?.disconnect();
      } catch {
        /* ok */
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        /* ok */
      }
      try {
        destRef.current?.disconnect();
      } catch {
        /* ok */
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DemoShell
      title="Audio Recorder"
      description="Record audio from an oscillator or microphone using MediaRecorder API and AudioContext's createMediaStreamDestination(). Play back or download recorded audio."
      nodes={[
        "MediaStreamAudioDestinationNode",
        "OscillatorNode",
        "MediaStreamSourceNode",
      ]}
    >
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="bg-surface-alt border-border space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs">Source:</span>
          <Toggle
            label="Oscillator"
            value={sourceType === "oscillator"}
            onChange={() => !recording && setSourceType("oscillator")}
          />
          <Toggle
            label="Microphone"
            value={sourceType === "microphone"}
            onChange={() => !recording && setSourceType("microphone")}
          />
        </div>

        <div className="flex items-center gap-4">
          {!recording ? (
            <button
              onClick={startRecording}
              className="rounded-lg border border-red-500 bg-red-500/20 px-5 py-2 text-sm font-medium text-red-400 transition"
            >
              ● Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-accent/20 text-accent border-accent rounded-lg border px-5 py-2 text-sm font-medium transition"
            >
              ■ Stop
            </button>
          )}

          {recording && (
            <span className="font-mono text-sm text-red-400 tabular-nums">
              ● {formatTime(duration)}
            </span>
          )}
        </div>
      </div>

      <Waveform analyser={analyser} />

      {blobUrl && (
        <div className="bg-surface-alt border-border space-y-3 rounded-lg border p-4">
          <p className="text-text text-sm font-medium">Recording ready</p>
          <div className="flex gap-3">
            <button
              onClick={togglePlayback}
              className="bg-accent/20 text-accent border-accent rounded-lg border px-4 py-1.5 text-xs font-medium transition"
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              onClick={download}
              className="bg-accent/20 text-accent border-accent rounded-lg border px-4 py-1.5 text-xs font-medium transition"
            >
              ⬇ Download
            </button>
          </div>
        </div>
      )}
    </DemoShell>
  );
}
