import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      // Allows navigator.requestMIDIAccess() without triggering Chrome's
      // "NoSysexWebMIDIWithoutPermission" deprecation warning.
      "Permissions-Policy": "midi=(self)",
      // Basic CSP — tightens XSS surface while allowing Three.js/GSAP inline styles.
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval'", // 'unsafe-eval' required by Three.js in dev
        "style-src 'self' 'unsafe-inline'",
        "worker-src blob:",
        "connect-src 'self'",
      ].join("; "),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three-vendor";
          if (id.includes("node_modules/gsap")) return "gsap-vendor";
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    // Use jsdom so browser globals (AudioContext, ResizeObserver, etc.) are available
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test-setup.ts",
        "src/**/*.d.ts",
        "src/main.tsx",
      ],
    },
  },
});
