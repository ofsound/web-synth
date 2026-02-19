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
