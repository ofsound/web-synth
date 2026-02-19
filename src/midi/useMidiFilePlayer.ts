/**
 * MIDI File Player hook — parses .mid files and plays them through the MidiBus.
 *
 * Uses @tonejs/midi for parsing. Playback is driven by a look-ahead scheduler
 * (setTimeout-based, same Chris Wilson approach as the PolySequencer) that
 * schedules noteOn/noteOff events accurately against the AudioContext clock.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import {
    MIDI_PLAYER_LOOKAHEAD_MS,
    MIDI_PLAYER_SCHEDULE_AHEAD_S,
} from "../constants";
import type { MidiBus } from "./MidiBus";
import { resolveMidiChannel } from "../midi/channelPolicy";

/* ── Public types ── */

export interface MidiFileTrackInfo {
    index: number;
    name: string;
    channel: number;
    noteCount: number;
}

export interface MidiFileNote {
    /** MIDI note number 0-127 */
    note: number;
    /** Velocity 0-127 */
    velocity: number;
    /** Start time in seconds */
    time: number;
    /** Duration in seconds */
    duration: number;
    /** Track index the note belongs to */
    trackIndex: number;
    /** Source MIDI channel */
    channel: number;
}

export interface MidiFilePlayerState {
    /** Parsed file loaded? */
    loaded: boolean;
    /** File name */
    fileName: string;
    /** Total duration of the file in seconds */
    duration: number;
    /** Track metadata for track selector UI */
    tracks: MidiFileTrackInfo[];
    /** Which tracks are selected */
    selectedTracks: Set<number>;
    /** All notes from the file (sorted by time) */
    allNotes: MidiFileNote[];
    /** Whether playback is running */
    playing: boolean;
    /** Current playback position 0–1 (React state, throttled to ~10fps) */
    progress: number;
    /**
     * Ref to the always-current progress value (updated every RAF call at 60fps).
     * Use this for canvas / animation rendering to avoid 60fps React re-renders.
     */
    progressRef: React.RefObject<number>;
    /** Current elapsed time in seconds */
    elapsed: number;
    /** Playback loops when reaching end */
    loopEnabled: boolean;
    /** User-visible load/playback error */
    error: string | null;
}

export interface MidiFilePlayerActions {
    loadFile: (buffer: ArrayBuffer, name: string) => void;
    play: () => void;
    pause: () => void;
    stop: () => void;
    seek: (fraction: number) => void;
    toggleTrack: (index: number) => void;
    setError: (message: string | null) => void;
    toggleLoop: () => void;
}

type MidiChannelMode = "source" | "normalized";

export interface MidiFilePlayerOptions {
    channelMode?: MidiChannelMode;
    normalizedChannel?: number;
}

export function filterNotesByTracks(
    notes: MidiFileNote[],
    selectedTracks: Set<number>,
): MidiFileNote[] {
    return notes.filter((note) => selectedTracks.has(note.trackIndex));
}

export function findNextNoteIndex(
    notes: MidiFileNote[],
    time: number,
): number {
    let idx = 0;
    while (idx < notes.length && notes[idx].time + notes[idx].duration < time) {
        idx++;
    }
    return idx;
}

/* ── Hook ── */

export function useMidiFilePlayer(
    midiBus: MidiBus,
    ctx: AudioContext | null,
    options: MidiFilePlayerOptions = {},
): [MidiFilePlayerState, MidiFilePlayerActions] {
    /* ── State ── */
    const [loaded, setLoaded] = useState(false);
    const [fileName, setFileName] = useState("");
    const [duration, setDuration] = useState(0);
    const [tracks, setTracks] = useState<MidiFileTrackInfo[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
    const [allNotes, setAllNotes] = useState<MidiFileNote[]>([]);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const channelMode = options.channelMode ?? "source";
    const normalizedChannel = options.normalizedChannel ?? 0;

    /* ── Refs for scheduler ── */
    const midiBusRef = useRef(midiBus);
    useEffect(() => { midiBusRef.current = midiBus; }, [midiBus]);

    const ctxRef = useRef(ctx);
    useEffect(() => { ctxRef.current = ctx; }, [ctx]);

    /** All notes from selected tracks, sorted by time */
    const selectedNotesRef = useRef<MidiFileNote[]>([]);
    /** Clock time (AudioContext.currentTime or performance fallback) when playback started/resumed */
    const playStartClockRef = useRef(0);
    /** Playback cursor — the file-time offset when play was started/resumed */
    const cursorOffsetRef = useRef(0);
    /** Index into selectedNotesRef of the next note to schedule */
    const nextNoteIndexRef = useRef(0);
    /** Active note-off timeouts so we can cancel on stop/seek */
    const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(
        new Set(),
    );
    /** Notes currently sounding (for flushing on stop/seek), key format: channel:note */
    const activeNotesRef = useRef<Set<string>>(new Set());
    /** Scheduler timer handle */
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Is playback running (ref for use inside scheduler) */
    const playingRef = useRef(false);
    /** Duration ref */
    const durationRef = useRef(0);
    /** RAF handle for progress updates */
    const rafRef = useRef(0);
    /**
     * Always-current progress value (fraction 0-1) — updated every RAF tick.
     * Used by PianoRollPreview canvas which draws at its own RAF rate without
     * triggering React re-renders.
     */
    const progressRef = useRef(0);
    /** Timestamp of the last setProgress / setElapsed React state update */
    const lastStateUpdateRef = useRef(0);
    /** How often (ms) to propagate progress to React state (throttle re-renders) */
    const PROGRESS_STATE_INTERVAL_MS = 100; // ~10fps for text/seek-bar display
    /** Loop flag ref for scheduler loop */
    const loopEnabledRef = useRef(loopEnabled);
    useEffect(() => {
        loopEnabledRef.current = loopEnabled;
    }, [loopEnabled]);

    const getClockSeconds = useCallback(() => {
        if (ctxRef.current) {
            return ctxRef.current.currentTime;
        }
        return performance.now() / 1000;
    }, []);

    /* ── Helpers ── */

    const flushActiveNotes = useCallback(() => {
        activeNotesRef.current.forEach((key) => {
            const [channelStr, noteStr] = key.split(":");
            const note = Number(noteStr);
            const channel = Number(channelStr);
            midiBusRef.current.emit({
                type: "noteoff",
                channel: Number.isFinite(channel) ? channel : 0,
                note,
                velocity: 0,
            });
        });
        activeNotesRef.current.clear();
    }, []);

    const clearPendingTimeouts = useCallback(() => {
        pendingTimeoutsRef.current.forEach((id) => clearTimeout(id));
        pendingTimeoutsRef.current.clear();
    }, []);

    const stopScheduler = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        cancelAnimationFrame(rafRef.current);
    }, []);

    /** Compute current file-time position based on wall clock */
    const getCurrentFileTime = useCallback(() => {
        if (!playingRef.current) return cursorOffsetRef.current;
        const now = getClockSeconds();
        return cursorOffsetRef.current + (now - playStartClockRef.current);
    }, [getClockSeconds]);

    /* ── Progress animation ── */

    const updateProgressRef = useRef<() => void>(() => { });
    useEffect(() => {
        updateProgressRef.current = () => {
            if (!playingRef.current) return;
            const t = getCurrentFileTime();
            const dur = durationRef.current;
            if (dur > 0) {
                progressRef.current = Math.min(t / dur, 1);

                // Throttle React state updates to ~10fps to avoid re-rendering
                // the whole MidiFilePlayer tree at 60fps.  The canvas preview
                // reads progressRef.current directly at its own RAF rate.
                const now = performance.now();
                if (now - lastStateUpdateRef.current >= PROGRESS_STATE_INTERVAL_MS) {
                    lastStateUpdateRef.current = now;
                    setProgress(progressRef.current);
                    setElapsed(Math.min(t, dur));
                }
            }
            rafRef.current = requestAnimationFrame(() => updateProgressRef.current());
        };
    }, [getCurrentFileTime]);

    const startProgressLoop = useCallback(() => {
        rafRef.current = requestAnimationFrame(() => updateProgressRef.current());
    }, []);

    /* ── Scheduler loop ── */

    const schedulerTickRef = useRef<() => void>(() => { });
    useEffect(() => {
        schedulerTickRef.current = () => {
            if (!playingRef.current) return;

            const now = getCurrentFileTime();
            const horizon = now + MIDI_PLAYER_SCHEDULE_AHEAD_S;
            const notes = selectedNotesRef.current;

            // Schedule notes whose start time falls within [now, horizon)
            while (nextNoteIndexRef.current < notes.length) {
                const n = notes[nextNoteIndexRef.current];
                if (n.time > horizon) break; // outside look-ahead window

                // Skip notes that are already past
                if (n.time + n.duration < now) {
                    nextNoteIndexRef.current++;
                    continue;
                }

                // Delay from wall-clock now to the note's wall-clock timestamp
                const noteOnDelay = Math.max(0, (n.time - now) * 1000);
                const noteOffDelay = noteOnDelay + n.duration * 1000;
                const outputChannel = resolveMidiChannel({
                    mode: channelMode,
                    sourceChannel: n.channel,
                    normalizedChannel,
                });
                const activeKey = `${outputChannel}:${n.note}`;

                // Schedule noteOn
                const onId = setTimeout(() => {
                    pendingTimeoutsRef.current.delete(onId);
                    if (!playingRef.current) return;
                    activeNotesRef.current.add(activeKey);
                    midiBusRef.current.emit({
                        type: "noteon",
                        channel: outputChannel,
                        note: n.note,
                        velocity: n.velocity,
                    });
                }, noteOnDelay);
                pendingTimeoutsRef.current.add(onId);

                // Schedule noteOff
                const offId = setTimeout(() => {
                    pendingTimeoutsRef.current.delete(offId);
                    activeNotesRef.current.delete(activeKey);
                    midiBusRef.current.emit({
                        type: "noteoff",
                        channel: outputChannel,
                        note: n.note,
                        velocity: 0,
                    });
                }, noteOffDelay);
                pendingTimeoutsRef.current.add(offId);

                nextNoteIndexRef.current++;
            }

            // Check if done (past end of file)
            if (now >= durationRef.current) {
                if (loopEnabledRef.current && durationRef.current > 0) {
                    cursorOffsetRef.current = 0;
                    nextNoteIndexRef.current = 0;
                    playStartClockRef.current = getClockSeconds();
                    setProgress(0);
                    setElapsed(0);
                    timerRef.current = setTimeout(
                        () => schedulerTickRef.current(),
                        MIDI_PLAYER_LOOKAHEAD_MS,
                    );
                    return;
                }

                // Playback finished
                playingRef.current = false;
                setPlaying(false);
                setProgress(1);
                setElapsed(durationRef.current);
                cursorOffsetRef.current = durationRef.current;
                // Let pending noteOffs finish naturally, but stop scheduling
                return;
            }

            // Schedule next tick
            timerRef.current = setTimeout(
                () => schedulerTickRef.current(),
                MIDI_PLAYER_LOOKAHEAD_MS,
            );
        };
    }, [
        channelMode,
        getClockSeconds,
        getCurrentFileTime,
        normalizedChannel,
    ]);

    const startScheduler = useCallback(() => {
        schedulerTickRef.current();
    }, []);

    /* ── Recompute selected notes when selection or allNotes change ── */

    const allNotesRef = useRef<MidiFileNote[]>([]);
    const selectedTracksRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        allNotesRef.current = allNotes;
    }, [allNotes]);

    useEffect(() => {
        selectedTracksRef.current = selectedTracks;
        selectedNotesRef.current = filterNotesByTracks(allNotesRef.current, selectedTracks);
    }, [selectedTracks, allNotes]);

    /* ── Actions ── */

    const loadFile = useCallback(
        (buffer: ArrayBuffer, name: string) => {
            // Stop any active playback
            stopScheduler();
            clearPendingTimeouts();
            flushActiveNotes();
            playingRef.current = false;
            setPlaying(false);

            try {
                const midi = new Midi(buffer);
                const trackInfos: MidiFileTrackInfo[] = [];
                const notes: MidiFileNote[] = [];

                midi.tracks.forEach((track, i) => {
                    if (track.notes.length === 0) return; // skip empty tracks
                    trackInfos.push({
                        index: i,
                        name:
                            track.name ||
                            `Track ${i + 1} (ch ${track.channel >= 0 ? track.channel : "?"})`,
                        channel: track.channel,
                        noteCount: track.notes.length,
                    });
                    for (const n of track.notes) {
                        notes.push({
                            note: n.midi,
                            velocity: Math.round(n.velocity * 127),
                            time: n.time,
                            duration: n.duration,
                            trackIndex: i,
                            channel: track.channel,
                        });
                    }
                });

                notes.sort((a, b) => a.time - b.time);

                const dur = midi.duration;
                const allTrackIndices = new Set(trackInfos.map((t) => t.index));

                allNotesRef.current = notes;
                setAllNotes(notes);
                setTracks(trackInfos);
                selectedTracksRef.current = allTrackIndices;
                setSelectedTracks(allTrackIndices);
                selectedNotesRef.current = notes;
                setDuration(dur);
                durationRef.current = dur;
                setFileName(name);
                setLoaded(true);
                setProgress(0);
                setElapsed(0);
                setError(null);
                cursorOffsetRef.current = 0;
                nextNoteIndexRef.current = 0;
            } catch (err) {
                console.error("Failed to parse MIDI file:", err);
                setLoaded(false);
                setFileName("");
                setDuration(0);
                setTracks([]);
                setSelectedTracks(new Set());
                setAllNotes([]);
                setProgress(0);
                setElapsed(0);
                durationRef.current = 0;
                cursorOffsetRef.current = 0;
                nextNoteIndexRef.current = 0;
                setError("Failed to parse MIDI file. Please choose a valid .mid file.");
            }
        },
        [stopScheduler, clearPendingTimeouts, flushActiveNotes],
    );

    const play = useCallback(() => {
        if (!loaded || playingRef.current) return;
        if (cursorOffsetRef.current >= durationRef.current) {
            // If at the end, restart from beginning
            cursorOffsetRef.current = 0;
            nextNoteIndexRef.current = 0;
        }

        // Find the correct note index for the current cursor position
        const cursor = cursorOffsetRef.current;
        const notes = selectedNotesRef.current;
        nextNoteIndexRef.current = findNextNoteIndex(notes, cursor);

        playingRef.current = true;
        setPlaying(true);
        playStartClockRef.current = getClockSeconds();

        // Start scheduler
        startScheduler();
        // Start progress animation
        startProgressLoop();
    }, [loaded, startScheduler, startProgressLoop, getClockSeconds]);

    const pause = useCallback(() => {
        if (!playingRef.current) return;
        // Save current position
        cursorOffsetRef.current = getCurrentFileTime();
        playingRef.current = false;
        setPlaying(false);
        stopScheduler();
        clearPendingTimeouts();
        flushActiveNotes();
    }, [getCurrentFileTime, stopScheduler, clearPendingTimeouts, flushActiveNotes]);

    const stop = useCallback(() => {
        playingRef.current = false;
        setPlaying(false);
        stopScheduler();
        clearPendingTimeouts();
        flushActiveNotes();
        cursorOffsetRef.current = 0;
        nextNoteIndexRef.current = 0;
        setProgress(0);
        setElapsed(0);
    }, [stopScheduler, clearPendingTimeouts, flushActiveNotes]);

    const seek = useCallback(
        (fraction: number) => {
            const clamped = Math.max(0, Math.min(1, fraction));
            const newTime = clamped * durationRef.current;

            clearPendingTimeouts();
            flushActiveNotes();

            cursorOffsetRef.current = newTime;
            setProgress(clamped);
            setElapsed(newTime);

            // Find correct note index for new position
            const notes = selectedNotesRef.current;
            nextNoteIndexRef.current = findNextNoteIndex(notes, newTime);

            if (playingRef.current) {
                // Restart scheduling from new position
                stopScheduler();
                playStartClockRef.current = getClockSeconds();
                startScheduler();
            }
        },
        [
            clearPendingTimeouts,
            flushActiveNotes,
            getClockSeconds,
            stopScheduler,
            startScheduler,
        ],
    );

    const toggleTrack = useCallback(
        (index: number) => {
            setSelectedTracks((prev) => {
                const next = new Set(prev);
                if (next.has(index)) {
                    next.delete(index);
                } else {
                    next.add(index);
                }

                selectedTracksRef.current = next;
                selectedNotesRef.current = filterNotesByTracks(allNotesRef.current, next);

                const now = playingRef.current ? getCurrentFileTime() : cursorOffsetRef.current;
                const notes = selectedNotesRef.current;
                nextNoteIndexRef.current = findNextNoteIndex(notes, now);

                if (playingRef.current) {
                    clearPendingTimeouts();
                    flushActiveNotes();
                    stopScheduler();
                    playStartClockRef.current = getClockSeconds();
                    cursorOffsetRef.current = now;
                    startScheduler();
                }

                return next;
            });
        },
        [
            clearPendingTimeouts,
            flushActiveNotes,
            getClockSeconds,
            getCurrentFileTime,
            startScheduler,
            stopScheduler,
        ],
    );

    const toggleLoop = useCallback(() => {
        setLoopEnabled((prev) => !prev);
    }, []);

    /* ── Cleanup on unmount ── */
    useEffect(
        () => () => {
            playingRef.current = false;
            stopScheduler();
            clearPendingTimeouts();
            flushActiveNotes();
        },
        [stopScheduler, clearPendingTimeouts, flushActiveNotes],
    );

    const setPlayerError = useCallback((message: string | null) => {
        setError(message);
    }, []);

    return [
        {
            loaded,
            fileName,
            duration,
            tracks,
            selectedTracks,
            allNotes,
            playing,
            progress,
            progressRef,
            elapsed,
            loopEnabled,
            error,
        },
        {
            loadFile,
            play,
            pause,
            stop,
            seek,
            toggleTrack,
            setError: setPlayerError,
            toggleLoop,
        },
    ];
}
