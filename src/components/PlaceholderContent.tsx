/**
 * Placeholder content shown in not-yet-implemented demos.
 * Provides a consistent "coming soon" UI with the intended node graph.
 */
export function PlaceholderContent({ nodeGraph }: { nodeGraph: string }) {
  return (
    <div className="border-border flex flex-col items-center gap-4 rounded-lg border border-dashed py-16">
      <div className="text-4xl opacity-30">🔧</div>
      <p className="text-text-muted text-sm">
        This demo is scaffolded and ready for implementation.
      </p>
      <div className="bg-surface-alt text-text-muted max-w-lg rounded px-4 py-3 text-xs leading-relaxed">
        <span className="text-text mb-1 block font-medium">Signal Chain:</span>
        <code className="text-accent">{nodeGraph}</code>
      </div>
    </div>
  );
}
