import { type ReactNode } from "react";

interface DemoShellProps {
  title: string;
  description: string;
  children: ReactNode;
  badge?: "implemented" | "placeholder";
  nodes?: string[];
}

/**
 * Standard wrapper for every demo page — provides consistent heading,
 * description, node-graph listing, and status badge.
 */
export function DemoShell({
  title,
  description,
  children,
  badge = "implemented",
  nodes = [],
}: DemoShellProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-text text-2xl font-bold">{title}</h1>
          {badge === "placeholder" && (
            <span className="bg-warning/20 text-warning rounded-full px-2.5 py-0.5 text-[10px] font-medium">
              Coming Soon
            </span>
          )}
        </div>
        <p className="text-text-muted mt-1 text-sm leading-relaxed">
          {description}
        </p>
        {nodes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nodes.map((node) => (
              <span
                key={node}
                className="bg-surface-alt text-accent rounded px-2 py-0.5 text-[10px]"
              >
                {node}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
