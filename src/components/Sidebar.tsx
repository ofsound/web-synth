import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { sections } from "../routes";

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside className="border-border bg-surface-alt flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r">
      {/* Logo / title */}
      <NavLink
        to="/"
        className="border-border flex items-center gap-2 border-b px-4 py-4"
      >
        <span className="text-lg">🔊</span>
        <span className="text-text text-sm font-bold tracking-wide">
          Web Audio Lab
        </span>
      </NavLink>

      <nav className="flex-1 py-2">
        {sections.map((section) => {
          const isOpen = !collapsed[section.basePath];
          const isActive = location.pathname.includes(`/${section.basePath}/`);

          return (
            <div key={section.basePath}>
              <button
                onClick={() => toggle(section.basePath)}
                className="text-text-muted hover:text-text flex w-full items-center justify-between px-4 py-2 text-left text-xs font-semibold tracking-wider uppercase"
              >
                {section.title}
                <span
                  className={`transform text-[10px] transition-transform ${
                    isOpen ? "rotate-0" : "-rotate-90"
                  }`}
                >
                  ▼
                </span>
              </button>

              {(isOpen || isActive) && (
                <ul className="mb-2">
                  {section.routes.map((route) => (
                    <li key={route.path}>
                      <NavLink
                        to={`/${section.basePath}/${route.path}`}
                        className={({ isActive: active }) =>
                          `block px-4 py-1.5 text-xs transition-colors ${
                            active
                              ? "border-accent bg-accent/10 text-accent border-l-2"
                              : "text-text-muted hover:bg-surface-raised hover:text-text border-l-2 border-transparent"
                          }`
                        }
                      >
                        {route.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-border text-text-muted border-t px-4 py-3 text-[10px]">
        Web Audio API Showcase
      </div>
    </aside>
  );
}
