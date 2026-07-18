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
      input: {
        main: entry("./index.html"),
        admin: entry("./admin.html"),
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
