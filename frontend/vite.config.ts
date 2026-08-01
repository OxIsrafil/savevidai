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
      // The es shells have landed, taking this to 11; the 5 hi inputs pointing
      // at ./hi/*.html arrive with their shells, for 16 total. Nested inputs
      // keep their path in dist (dist/es/index.html), and their asset refs stay
      // root-absolute, so no base or public-path change is needed.
      input: {
        main: entry("./index.html"),
        admin: entry("./admin.html"),
        tiktok: entry("./tiktokvideodownloader.html"),
        instagram: entry("./instagramvideodownloader.html"),
        reddit: entry("./redditvideodownloader.html"),
        facebook: entry("./facebookvideodownloader.html"),
        esMain: entry("./es/index.html"),
        esTiktok: entry("./es/tiktokvideodownloader.html"),
        esInstagram: entry("./es/instagramvideodownloader.html"),
        esReddit: entry("./es/redditvideodownloader.html"),
        esFacebook: entry("./es/facebookvideodownloader.html"),
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
