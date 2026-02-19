export type MidiChannelMode = "source" | "normalized";

export interface ResolveMidiChannelOptions {
    mode: MidiChannelMode;
    sourceChannel: number;
    normalizedChannel?: number;
}

export function resolveMidiChannel({
    mode,
    sourceChannel,
    normalizedChannel = 0,
}: ResolveMidiChannelOptions): number {
    if (mode === "normalized") return normalizedChannel;
    return sourceChannel;
}
