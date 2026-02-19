/**
 * ThumbnailStrip — horizontal row of scene selector thumbnails.
 */

import type { SceneMeta } from "./scenes";

interface Props {
  scenes: SceneMeta[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}

export function ThumbnailStrip({ scenes, activeIdx, onSelect }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {scenes.map((scene, i) => (
        <button
          type="button"
          key={scene.id}
          onClick={() => onSelect(i)}
          aria-label={`Switch to ${scene.name} scene`}
          aria-pressed={i === activeIdx}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
            i === activeIdx
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-text-muted hover:border-text-muted/50 hover:text-text"
          }`}
          title={scene.name}
        >
          <span className="text-sm">{scene.thumbnail}</span>
          <span className="hidden sm:inline">{scene.name}</span>
        </button>
      ))}
    </div>
  );
}
