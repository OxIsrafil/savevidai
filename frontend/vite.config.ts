import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Resolve sibling files by URL rather than node:path/__dirname - this project
// has no @types/node, and import.meta.url is already typed via vite/client.
const entry = (file: string) => new URL(file, import.meta.url).pathname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  build: {
    rollupOptions: {
      // One input per HTML shell: rollup resolves each of these as a file on
      // disk, so an input may only be added in the same change as its shell.
      // The 10 locale pages therefore land here with their shells: 5 es inputs
      // pointing at ./es/*.html, then 5 hi inputs at ./hi/*.html, for 16 total.
      // Their entry modules (src/entries/<locale>-<platform>.tsx) already exist
      // and build; only the shells that load them are still missing.
      input: {
        main: entry("./index.html"),
        admin: entry("./admin.html"),
        tiktok: entry("./tiktokvideodownloader.html"),
        instagram: entry("./instagramvideodownloader.html"),
        reddit: entry("./redditvideodownloader.html"),
        facebook: entry("./facebookvideodownloader.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
