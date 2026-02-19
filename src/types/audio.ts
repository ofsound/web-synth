/**
 * Shared audio type definitions.
 */

export interface EffectIO {
  input: GainNode;
  output: GainNode;
}

/**
 * Minimum param set shared by all synth engines.
 * Defined here so synth hooks, test files, and UI components can import
 * from a stable location rather than from an internal hook file.
 */
export interface BaseSynthParams {
  gain: number;
  enabled: boolean;
}
