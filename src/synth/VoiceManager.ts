/**
 * Generic polyphonic voice manager.
 *
 * Handles voice allocation & deallocation keyed by MIDI note number.
 * Supports max polyphony with oldest-voice stealing.
 *
 * Voices transition through two phases:
 *   1. **Active** — held in `voices`, producing sound while key is down.
 *   2. **Releasing** — held in `releasing`, playing their release tail.
 *      A timer auto-kills the voice once the release period elapses.
 *      Re-triggering the same note during release kills the old voice
 *      immediately to avoid overlaps.
 *
 * Usage: instantiate with factory/release/kill callbacks,
 * then call noteOn / noteOff.
 */

export interface VoiceManagerOptions<V> {
    maxVoices?: number;

    /**
     * Duration (seconds) the release tail is expected to last.  Voices are
     * auto-killed this many seconds (+50 ms safety buffer) after noteOff.
     * Defaults to 0.5 s.
     */
    releaseDuration?: number;

    /** Create a new voice. Return the voice object. */
    createVoice: (note: number, velocity: number, time: number) => V;

    /** Begin the release phase of a voice (schedule envelope release). */
    releaseVoice: (voice: V, note: number, time: number) => void;

    /** Immediately kill a voice (hard stop + disconnect). */
    killVoice: (voice: V, note: number) => void;
}

interface ReleasingEntry<V> {
    voice: V;
    timer: ReturnType<typeof setTimeout>;
}

export class VoiceManager<V> {
    private voices = new Map<number, V>();
    private releasing = new Map<number, ReleasingEntry<V>>();
    private noteOrder: number[] = []; // oldest first
    private maxVoices: number;
    private releaseDuration: number;
    private opts: VoiceManagerOptions<V>;

    constructor(opts: VoiceManagerOptions<V>) {
        this.opts = opts;
        this.maxVoices = opts.maxVoices ?? 16;
        this.releaseDuration = opts.releaseDuration ?? 0.5;
    }

    get activeNotes(): Set<number> {
        return new Set(this.voices.keys());
    }

    get activeCount(): number {
        return this.voices.size;
    }

    get releasingCount(): number {
        return this.releasing.size;
    }

    /** Get the voice object for a specific active note (not releasing). */
    getVoice(note: number): V | undefined {
        return this.voices.get(note);
    }

    /** Iterate over all active (non-releasing) voices. */
    forEachActive(fn: (voice: V, note: number) => void): void {
        for (const [note, voice] of this.voices) {
            fn(voice, note);
        }
    }

    noteOn(note: number, velocity: number, time: number) {
        // Kill any voice still in release phase for this note
        this.killReleasing(note);

        // Re-trigger: kill existing active voice for this note
        if (this.voices.has(note)) {
            const existing = this.voices.get(note)!;
            this.opts.killVoice(existing, note);
            this.voices.delete(note);
            this.noteOrder = this.noteOrder.filter((n) => n !== note);
        }

        // Voice stealing: if at max capacity, kill the oldest voice
        if (this.maxVoices > 0 && this.voices.size >= this.maxVoices && this.noteOrder.length > 0) {
            const oldest = this.noteOrder.shift()!;
            const oldVoice = this.voices.get(oldest);
            if (oldVoice) {
                this.opts.killVoice(oldVoice, oldest);
                this.voices.delete(oldest);
            }
        }

        const voice = this.opts.createVoice(note, velocity, time);
        this.voices.set(note, voice);
        this.noteOrder.push(note);
    }

    noteOff(note: number, time: number) {
        const voice = this.voices.get(note);
        if (!voice) return;

        this.opts.releaseVoice(voice, note, time);

        // Move voice to releasing set so the release tail keeps playing
        this.voices.delete(note);
        this.noteOrder = this.noteOrder.filter((n) => n !== note);

        // Kill any prior releasing voice on this note (fast retrigger edge-case)
        this.killReleasing(note);

        const timer = setTimeout(() => {
            const entry = this.releasing.get(note);
            if (entry && entry.voice === voice) {
                this.opts.killVoice(voice, note);
                this.releasing.delete(note);
            }
        }, (this.releaseDuration + 0.05) * 1000);

        this.releasing.set(note, { voice, timer });
    }

    /** Kill all voices immediately (active + releasing). */
    allNotesOff() {
        for (const [note, voice] of this.voices) {
            this.opts.killVoice(voice, note);
        }
        this.voices.clear();
        this.noteOrder = [];

        for (const [note, entry] of this.releasing) {
            clearTimeout(entry.timer);
            this.opts.killVoice(entry.voice, note);
        }
        this.releasing.clear();
    }

    /** Kill a single voice in the releasing set, if any. */
    private killReleasing(note: number) {
        const entry = this.releasing.get(note);
        if (entry) {
            clearTimeout(entry.timer);
            this.opts.killVoice(entry.voice, note);
            this.releasing.delete(note);
        }
    }
}
