/**
 * Centralized constants for the synthesizer.
 *
 * This file contains all magic numbers used across the application
 * to make them easy to find and modify.
 */

/* ------------------------------------------------------------------ */
/*  Audio Engine Constants                                            */
/* ------------------------------------------------------------------ */

/** Maximum polyphony for synth voices */
export const MAX_VOICES = 16;

/** Maximum voices for granular synth (lower due to grain processing cost) */
export const MAX_GRANULAR_VOICES = 8;

/** Default sample rate for offline rendering */
export const DEFAULT_SAMPLE_RATE = 44100;

/* ------------------------------------------------------------------ */
/*  Visualizer Constants                                              */
/* ------------------------------------------------------------------ */

/** Maximum particles in particle storm scene */
export const MAX_PARTICLES = 3000;

/** Burst size when note is triggered */
export const PARTICLE_BURST_SIZE = 40;

/** Particle lifetime in seconds */
export const PARTICLE_LIFETIME = 3;

/** Maximum device pixel ratio for canvas rendering */
export const MAX_DPR = 2;

/** History buffer size for note events */
export const NOTE_HISTORY_SIZE = 256;

/** Maximum cached window functions for granular synth */
export const MAX_WINDOW_CACHE = 64;

/* ------------------------------------------------------------------ */
/*  MIDI Constants                                                    */
/* ------------------------------------------------------------------ */

/** MIDI note range */
export const MIN_MIDI_NOTE = 0;
export const MAX_MIDI_NOTE = 127;

/** MIDI velocity range */
export const MIN_VELOCITY = 0;
export const MAX_VELOCITY = 127;

/** Default MIDI channel */
export const DEFAULT_MIDI_CHANNEL = 0;

/* ------------------------------------------------------------------ */
/*  Scheduler Constants                                               */
/* ------------------------------------------------------------------ */

/** Scheduler lookahead in milliseconds */
export const SCHEDULER_LOOKAHEAD_MS = 25;

/** Scheduler idle lookahead (when no voices active) */
export const SCHEDULER_IDLE_LOOKAHEAD_MS = 150;

/** How far ahead to schedule grains in seconds */
export const SCHEDULE_AHEAD_SECONDS = 0.1;

/** Default BPM */
export const DEFAULT_BPM = 120;

/** Minimum BPM */
export const MIN_BPM = 40;

/** Maximum BPM */
export const MAX_BPM = 300;

/* ------------------------------------------------------------------ */
/*  VU Meter Constants                                                */
/* ------------------------------------------------------------------ */

/** FFT size for analysers */
export const VU_METER_FFT_SIZE = 1024;

/** Smoothing time constant for analysers */
export const VU_METER_SMOOTHING = 0.8;

/** Silence threshold in dB */
export const SILENCE_THRESHOLD_DB = -60;

/** Frames to wait before pausing render when silent */
export const SILENCE_FRAMES_BEFORE_PAUSE = 30;

/** Peak decay rate in dB per second */
export const PEAK_DECAY_RATE = 10;

/* ------------------------------------------------------------------ */
/*  ADSR Constants                                                    */
/* ------------------------------------------------------------------ */

/** Minimum attack time to prevent clicks */
export const MIN_ATTACK_TIME = 0.005;

/** Minimum decay time */
export const MIN_DECAY_TIME = 0.01;

/** Minimum release time */
export const MIN_RELEASE_TIME = 0.01;

/* ------------------------------------------------------------------ */
/*  Effect Constants                                                  */
/* ------------------------------------------------------------------ */

/** Maximum delay time in seconds */
export const MAX_DELAY_TIME = 2;

/** Smooth ramp time for parameter changes */
export const PARAM_RAMP_TIME = 0.02;

/* ------------------------------------------------------------------ */
/*  Master Output Constants                                           */
/* ------------------------------------------------------------------ */

/** Limiter threshold in dB */
export const LIMITER_THRESHOLD = -3;

/** Limiter knee in dB */
export const LIMITER_KNEE = 6;

/** Limiter ratio */
export const LIMITER_RATIO = 20;

/** Limiter attack time */
export const LIMITER_ATTACK = 0.001;

/** Limiter release time */
export const LIMITER_RELEASE = 0.1;

/** Default master volume */
export const DEFAULT_MASTER_VOLUME = 0.8;

/* ------------------------------------------------------------------ */
/*  Granular Synth Constants                                          */
/* ------------------------------------------------------------------ */

/** Base frequency for granular sample */
export const GRANULAR_BASE_FREQ = 220;

/** Default grain size in milliseconds */
export const DEFAULT_GRAIN_SIZE = 60;

/** Minimum grain size */
export const MIN_GRAIN_SIZE = 10;

/** Maximum grain size */
export const MAX_GRAIN_SIZE = 200;

/** Default grain density */
export const DEFAULT_GRAIN_DENSITY = 15;

/** Maximum grain density */
export const MAX_GRAIN_DENSITY = 50;

/** Source buffer duration in seconds */
export const SOURCE_BUFFER_DURATION = 2;

/* ------------------------------------------------------------------ */
/*  MIDI File Player Constants                                        */
/* ------------------------------------------------------------------ */

/** Look-ahead interval in ms for MIDI file playback scheduling */
export const MIDI_PLAYER_LOOKAHEAD_MS = 50;

/** How far ahead to schedule MIDI file events in seconds */
export const MIDI_PLAYER_SCHEDULE_AHEAD_S = 0.15;

/** Default velocity for MIDI file noteOn events (when file has 0) */
export const MIDI_PLAYER_DEFAULT_VELOCITY = 100;
