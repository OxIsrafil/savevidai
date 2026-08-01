/**
 * Minimal ambient types for the two Node bindings a test needs.
 *
 * This project deliberately ships no `@types/node` (see the comment in
 * vite.config.ts about resolving sibling files by URL rather than node:path),
 * and `localeFit.test.ts` has to read `src/styles/index.css` off disk: vitest
 * runs with `css: false`, which makes every CSS module resolve to an empty
 * string, `?raw` and `import.meta.glob(..., { query: "?raw" })` included, so a
 * stylesheet assertion driven by an import would pass vacuously.
 *
 * Declaring the two members used here is cheaper and narrower than pulling in
 * the whole Node type surface for one test.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export function resolve(...segments: string[]): string;
}

declare const process: { cwd(): string };
