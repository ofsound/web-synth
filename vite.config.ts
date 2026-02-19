import { defineConfig } from "vite";
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
        // Vite React dev preamble uses an inline bootstrap script.
        // Allowing 'unsafe-inline' here keeps dev server functional.
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // 'unsafe-eval' required by Three.js in dev
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
});
