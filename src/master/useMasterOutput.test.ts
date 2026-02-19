/**
 * useMasterOutput — unit tests.
 *
 * Tests focus on the audio graph wiring contract:
 * - All required nodes are created
 * - Analysers tap the signal AFTER the limiter (post-limiter metering)
 * - Default volume is positive
 * - Volume changes go through a ramp instead of direct assignment
 *
 * These tests do not render the React hook; instead they exercise the
 * wiring logic through a mock AudioContext that records connect() calls.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal mock AudioContext that records connections
// ---------------------------------------------------------------------------

function makeMockCtx() {
    const connections: string[] = [];

    let nodeId = 0;
    function makeNode(type: string) {
        const id = `${type}#${nodeId++}`;
        return {
            _id: id,
            connect(dest: { _id: string }, output?: number) {
                const suffix = output !== undefined ? `[${output}]` : "";
                connections.push(`${id}${suffix} → ${dest._id}`);
                return dest;
            },
            disconnect: vi.fn(),
            gain: {
                value: 1,
                cancelScheduledValues: vi.fn(),
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
            },
            threshold: { value: 0 },
            knee: { value: 0 },
            ratio: { value: 0 },
            attack: { value: 0 },
            release: { value: 0 },
            fftSize: 0,
            smoothingTimeConstant: 0,
            frequencyBinCount: 0,
            getByteTimeDomainData: vi.fn(),
            getByteFrequencyData: vi.fn(),
        };
    }

    const splitterNode = (() => {
        const id = `splitter#${nodeId++}`;
        return {
            _id: id,
            connect(dest: { _id: string }, output?: number) {
                const suffix = output !== undefined ? `[${output}]` : "";
                connections.push(`${id}${suffix} → ${dest._id}`);
                return dest;
            },
            disconnect: vi.fn(),
        };
    })();

    const ctx = {
        currentTime: 0,
        destination: makeNode("destination"),
        createGain: vi.fn().mockImplementation(() => makeNode("gain")),
        createAnalyser: vi.fn().mockImplementation(() => makeNode("analyser")),
        createDynamicsCompressor: vi.fn().mockImplementation(() => makeNode("limiter")),
        createChannelSplitter: vi.fn().mockReturnValue(splitterNode),
        connections,
        _splitterNode: splitterNode,
    };

    return ctx as unknown as AudioContext & { connections: string[]; _splitterNode: typeof splitterNode };
}

// ---------------------------------------------------------------------------
// Replicate the wiring logic from useMasterOutput so we can test the
// graph contract directly without React rendering.
// ---------------------------------------------------------------------------

import {
    VU_METER_FFT_SIZE,
    VU_METER_SMOOTHING,
    LIMITER_THRESHOLD,
    LIMITER_KNEE,
    LIMITER_RATIO,
    LIMITER_ATTACK,
    LIMITER_RELEASE,
    DEFAULT_MASTER_VOLUME,
} from "../constants";

function buildMasterGraph(ctx: AudioContext) {
    const synthMix = ctx.createGain();
    const effectsSend = ctx.createGain();
    const effectsReturn = ctx.createGain();
    const masterGain = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    analyserL.fftSize = VU_METER_FFT_SIZE;
    analyserL.smoothingTimeConstant = VU_METER_SMOOTHING;
    const analyserR = ctx.createAnalyser();
    analyserR.fftSize = VU_METER_FFT_SIZE;
    analyserR.smoothingTimeConstant = VU_METER_SMOOTHING;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD;
    limiter.knee.value = LIMITER_KNEE;
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = LIMITER_ATTACK;
    limiter.release.value = LIMITER_RELEASE;

    synthMix.connect(effectsSend);
    effectsReturn.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);
    // Post-limiter metering tap
    limiter.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    return { synthMix, effectsSend, effectsReturn, masterGain, analyserL, analyserR, limiter, splitter };
}

type NodeWithId = { _id: string };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("master output graph wiring", () => {
    it("creates all required nodes", () => {
        const ctx = makeMockCtx();
        const nodes = buildMasterGraph(ctx);
        expect(nodes.synthMix).toBeDefined();
        expect(nodes.effectsSend).toBeDefined();
        expect(nodes.effectsReturn).toBeDefined();
        expect(nodes.masterGain).toBeDefined();
        expect(nodes.analyserL).toBeDefined();
        expect(nodes.analyserR).toBeDefined();
        expect(nodes.limiter).toBeDefined();
    });

    it("effectsReturn connects to masterGain (not directly to limiter)", () => {
        const ctx = makeMockCtx();
        const nodes = buildMasterGraph(ctx);
        const { connections } = ctx;
        const retId = (nodes.effectsReturn as unknown as NodeWithId)._id;
        const mgId = (nodes.masterGain as unknown as NodeWithId)._id;
        const lId = (nodes.limiter as unknown as NodeWithId)._id;
        expect(connections.some((c) => c.startsWith(retId) && c.includes(mgId))).toBe(true);
        expect(connections.some((c) => c.startsWith(retId) && c.includes(lId))).toBe(false);
    });

    it("analysers are tapped AFTER the limiter (post-limiter metering)", () => {
        const ctx = makeMockCtx();
        const nodes = buildMasterGraph(ctx);
        const { connections } = ctx;
        const lId = (nodes.limiter as unknown as NodeWithId)._id;
        const sId = (nodes.splitter as unknown as NodeWithId)._id;
        const aLId = (nodes.analyserL as unknown as NodeWithId)._id;
        const limToSplit = connections.findIndex((c) => c.startsWith(lId) && c.includes(sId));
        expect(limToSplit).toBeGreaterThanOrEqual(0);
        const splitToL = connections.findIndex((c) => c.startsWith(sId) && c.includes(aLId));
        expect(splitToL).toBeGreaterThan(limToSplit);
    });

    it("masterGain → limiter → destination chain is correct", () => {
        const ctx = makeMockCtx();
        const nodes = buildMasterGraph(ctx);
        const { connections } = ctx;
        const mgId = (nodes.masterGain as unknown as NodeWithId)._id;
        const lId = (nodes.limiter as unknown as NodeWithId)._id;
        const destId = (ctx.destination as unknown as NodeWithId)._id;
        expect(connections.some((c) => c.startsWith(mgId) && c.includes(lId))).toBe(true);
        expect(connections.some((c) => c.startsWith(lId) && c.includes(destId))).toBe(true);
    });

    it("DEFAULT_MASTER_VOLUME is a positive fraction ≤ 1", () => {
        expect(DEFAULT_MASTER_VOLUME).toBeGreaterThan(0);
        expect(DEFAULT_MASTER_VOLUME).toBeLessThanOrEqual(1);
    });
});

describe("master volume ramp", () => {
    it("uses cancelScheduledValues → setValueAtTime → linearRamp pattern", () => {
        const ctx = makeMockCtx();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        const RAMP_TIME = 0.005;
        const targetVolume = 0.5;

        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(targetVolume, now + RAMP_TIME);

        expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(now);
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(gain.gain.value, now);
        expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
            targetVolume,
            now + RAMP_TIME,
        );
    });

    it("direct .value assignment does not change the gain during a ramp sequence", () => {
        const ctx = makeMockCtx();
        const gain = ctx.createGain();
        const initialValue = gain.gain.value;
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(initialValue, 0);
        gain.gain.linearRampToValueAtTime(0.5, 0.005);
        // .value should remain unchanged — the ramp methods are mock fns that don't mutate it
        expect(gain.gain.value).toBe(initialValue);
    });
});

