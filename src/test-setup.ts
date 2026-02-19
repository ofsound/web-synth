/**
 * Vitest global setup — runs before every test file.
 *
 * Provides minimal Web Audio API stubs so unit tests can run in jsdom
 * without a real browser.  Tests requiring full AudioContext behaviour
 * should use the OfflineAudioContext available in web-audio-test-api.
 */

// ── Stub AudioContext ────────────────────────────────────────────────────────

class StubAudioParam {
    value = 0;
    cancelScheduledValues() { return this; }
    setValueAtTime(v: number) { this.value = v; return this; }
    linearRampToValueAtTime(v: number) { this.value = v; return this; }
    exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
    setTargetAtTime() { return this; }
    cancelAndHoldAtTime() { return this; }
}

class StubAudioNode {
    connect() { return this; }
    disconnect() { return this; }
}

class StubGainNode extends StubAudioNode {
    gain = new StubAudioParam();
}

class StubAnalyserNode extends StubAudioNode {
    fftSize = 1024;
    smoothingTimeConstant = 0.8;
    frequencyBinCount = 512;
    getByteTimeDomainData(arr: Uint8Array) { void arr; }
    getByteFrequencyData(arr: Uint8Array) { void arr; }
}

class StubDynamicsCompressorNode extends StubAudioNode {
    threshold = new StubAudioParam();
    knee = new StubAudioParam();
    ratio = new StubAudioParam();
    attack = new StubAudioParam();
    release = new StubAudioParam();
}

class StubChannelSplitterNode extends StubAudioNode { }

class MockAudioContext {
    currentTime = 0;
    state: AudioContextState = "running";
    destination = new StubAudioNode();
    sampleRate = 44100;

    createGain() { return new StubGainNode(); }
    createAnalyser() { return new StubAnalyserNode(); }
    createDynamicsCompressor() { return new StubDynamicsCompressorNode(); }
    createChannelSplitter() { return new StubChannelSplitterNode(); }
    createOscillator() {
        const n = new StubAudioNode() as unknown as OscillatorNode;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).frequency = new StubAudioParam();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).start = () => { };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).stop = () => { };
        return n;
    }
    createDelay() {
        const n = new StubAudioNode() as unknown as DelayNode;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).delayTime = new StubAudioParam();
        return n;
    }
    createBiquadFilter() {
        const n = new StubAudioNode() as unknown as BiquadFilterNode;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).frequency = new StubAudioParam();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).Q = new StubAudioParam();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).type = "allpass";
        return n;
    }
    createWaveShaper() {
        const n = new StubAudioNode() as unknown as WaveShaperNode;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).curve = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n as any).oversample = "none";
        return n;
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    getOutputTimestamp() { return { contextTime: this.currentTime }; }
}

// Install the stub globally so hooks that call `new AudioContext()` don't crash.
Object.defineProperty(globalThis, "AudioContext", {
    writable: true,
    value: MockAudioContext,
});

// ── ResizeObserver stub ──────────────────────────────────────────────────────

class MockResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: MockResizeObserver,
});
