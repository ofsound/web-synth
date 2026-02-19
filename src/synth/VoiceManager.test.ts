import { describe, expect, it, vi } from "vitest";
import { VoiceManager } from "./VoiceManager";

type TestVoice = { id: number };

function setup(maxVoices = 4) {
  const createVoice = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (note: number, _velocity: number, _time: number): TestVoice => ({
      id: note,
    }),
  );
  const releaseVoice = vi.fn();
  const killVoice = vi.fn();

  const manager = new VoiceManager<TestVoice>({
    maxVoices,
    createVoice,
    releaseVoice,
    killVoice,
  });

  return { manager, createVoice, releaseVoice, killVoice };
}

describe("VoiceManager", () => {
  it("creates and tracks a voice on noteOn", () => {
    const { manager, createVoice, releaseVoice, killVoice } = setup();

    manager.noteOn(60, 100, 0);

    expect(createVoice).toHaveBeenCalledWith(60, 100, 0);
    expect(manager.activeCount).toBe(1);
    expect(manager.activeNotes.has(60)).toBe(true);
    expect(releaseVoice).not.toHaveBeenCalled();
    expect(killVoice).not.toHaveBeenCalled();
  });

  it("releases voice on noteOff and removes it from active set", () => {
    const { manager, releaseVoice, killVoice } = setup();

    manager.noteOn(62, 90, 1.0);
    manager.noteOff(62, 1.5);

    expect(releaseVoice).toHaveBeenCalledTimes(1);
    expect(releaseVoice).toHaveBeenCalledWith({ id: 62 }, 62, 1.5);
    expect(manager.activeCount).toBe(0);
    expect(manager.activeNotes.has(62)).toBe(false);
    expect(killVoice).not.toHaveBeenCalled();
  });

  it("kills existing voice when retriggering same note", () => {
    const { manager, createVoice, killVoice } = setup();

    manager.noteOn(64, 70, 0);
    manager.noteOn(64, 110, 0.2);

    expect(killVoice).toHaveBeenCalledTimes(1);
    expect(killVoice).toHaveBeenCalledWith({ id: 64 }, 64);
    expect(createVoice).toHaveBeenCalledTimes(2);
    expect(createVoice).toHaveBeenNthCalledWith(2, 64, 110, 0.2);
    expect(manager.activeCount).toBe(1);
    expect(manager.activeNotes.has(64)).toBe(true);
  });

  it("steals oldest voice when max polyphony is reached", () => {
    const { manager, releaseVoice, killVoice } = setup(2);

    manager.noteOn(60, 100, 0.0); // oldest
    manager.noteOn(64, 100, 0.1);
    manager.noteOn(67, 100, 0.2); // should steal note 60

    expect(killVoice).toHaveBeenCalledTimes(1);
    expect(killVoice).toHaveBeenCalledWith({ id: 60 }, 60);
    expect(manager.activeCount).toBe(2);
    expect(manager.activeNotes.has(60)).toBe(false);
    expect(manager.activeNotes.has(64)).toBe(true);
    expect(manager.activeNotes.has(67)).toBe(true);
    expect(releaseVoice).not.toHaveBeenCalled();
  });

  it("kills all active voices on allNotesOff", () => {
    const { manager, releaseVoice, killVoice } = setup();

    manager.noteOn(60, 80, 0);
    manager.noteOn(64, 80, 0.1);
    manager.noteOn(67, 80, 0.2);

    manager.allNotesOff();

    expect(killVoice).toHaveBeenCalledTimes(3);
    expect(manager.activeCount).toBe(0);
    expect(manager.activeNotes.size).toBe(0);
    expect(releaseVoice).not.toHaveBeenCalled();
  });
});
