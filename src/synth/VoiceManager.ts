/**
 * Generic polyphonic voice manager.
 *
 * Handles voice allocation & deallocation keyed by MIDI note number.
 * Supports max polyphony with oldest-voice stealing.
 *
 * Usage: instantiate with factory/release/kill callbacks,
 * then call noteOn / noteOff.
 */

export interface VoiceManagerOptions<V> {
    maxVoices?: number;

    /** Create a new voice. Return the voice object. */
    createVoice: (note: number, velocity: number, time: number) => V;

    /** Begin the release phase of a voice (schedule envelope release). */
    releaseVoice: (voice: V, note: number, time: number) => void;

    /** Immediately kill a voice (hard stop + disconnect). */
    killVoice: (voice: V, note: number) => void;
}

export class VoiceManager<V> {
    private voices = new Map<number, V>();
    private noteOrder: number[] = []; // oldest first
    private maxVoices: number;
    private opts: VoiceManagerOptions<V>;

    constructor(opts: VoiceManagerOptions<V>) {
        this.opts = opts;
        this.maxVoices = opts.maxVoices ?? 16;
    }

    get activeNotes(): Set<number> {
        return new Set(this.voices.keys());
    }

    get activeCount(): number {
        return this.voices.size;
    }

    noteOn(note: number, velocity: number, time: number) {
        // If already playing, ignore (no re-trigger)
        if (this.voices.has(note)) return;

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
        this.voices.delete(note);
        this.noteOrder = this.noteOrder.filter((n) => n !== note);
    }

    /** Kill all voices immediately. */
    allNotesOff() {
        for (const [note, voice] of this.voices) {
            this.opts.killVoice(voice, note);
        }
        this.voices.clear();
        this.noteOrder = [];
    }
}
