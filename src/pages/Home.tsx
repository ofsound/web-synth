import { Link } from "react-router-dom";
import { sections } from "../routes";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-text text-4xl font-bold tracking-tight">
          Web Audio Lab
        </h1>
        <p className="text-text-muted mt-3 text-lg leading-relaxed">
          A comprehensive showcase of the{" "}
          <span className="text-accent">Web Audio API</span> built with React.
          Explore real-time audio manipulation, effects processing, and
          synthesis — from parametric EQs and convolution reverbs to FM
          synthesis, granular textures, and step sequencers.
        </p>
        <p className="text-text-muted mt-2 text-sm">
          Click anywhere to initialize the AudioContext, then explore the demos
          in the sidebar.
        </p>
      </div>

      {/* Section cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.basePath}
            className="border-border bg-surface-alt rounded-xl border p-6"
          >
            <h2 className="text-text text-lg font-semibold">{section.title}</h2>
            <p className="text-text-muted mt-1 text-xs">
              {section.routes.length} demos
            </p>
            <ul className="mt-4 space-y-1">
              {section.routes.map((route) => (
                <li key={route.path}>
                  <Link
                    to={`/${section.basePath}/${route.path}`}
                    className="text-text-muted hover:text-accent text-sm transition-colors"
                  >
                    {route.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Quick-start highlight */}
      <div className="border-accent/30 bg-accent/5 mt-10 rounded-xl border p-6">
        <h3 className="text-accent text-sm font-semibold">
          Featured Demos (Fully Interactive)
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {[
            { to: "/manipulation/parametric-eq", label: "Parametric EQ" },
            {
              to: "/manipulation/convolution-reverb",
              label: "Convolution Reverb",
            },
            { to: "/manipulation/distortion", label: "Distortion" },
            { to: "/manipulation/oscilloscope", label: "Oscilloscope" },
            { to: "/synth/oscillator-explorer", label: "Oscillator Explorer" },
            { to: "/synth/adsr-visualizer", label: "ADSR Visualizer" },
            { to: "/synth/subtractive-synth", label: "Subtractive Synth" },
            { to: "/synth/fm-synth-2op", label: "FM Synth (2-Op)" },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="border-border bg-surface text-text hover:border-accent hover:text-accent rounded-lg border px-3 py-2 text-center text-xs transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
