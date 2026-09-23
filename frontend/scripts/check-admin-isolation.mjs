// Fails when a public page can reach admin-only code through its static module graph.
// Run after `npm run build`. The markers are string literals that survive minification:
// recharts renders a "recharts-wrapper" element and lucide-react stamps "lucide-" classes.
// The admin page is checked the other way round, as a control: if its graph does NOT
// contain the markers, they are not a valid probe and the check fails loudly.
import { readFileSync, readdirSync, statSync } from "node:fs";

const DIST = new URL("../dist/", import.meta.url);
const MARKERS = ["recharts-wrapper", "lucide-"];

function htmlFiles(dirUrl) {
  const out = [];
  for (const name of readdirSync(dirUrl)) {
    const child = new URL(name, dirUrl);
    if (statSync(child).isDirectory()) out.push(...htmlFiles(new URL(name + "/", dirUrl)));
    else if (name.endsWith(".html")) out.push(child);
  }
  return out;
}

function entryScripts(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) urls.add(m[1]);
  return [...urls].filter((u) => u.startsWith("/assets/"));
}

function staticImports(js) {
  const out = new Set();
  const re = /(?:^|[;\s}])(?:import|export)\s*(?:[^'"`;]*?\bfrom\s*)?["']([^"']+\.js)["']/g;
  for (const m of js.matchAll(re)) out.add(m[1]);
  return [...out];
}

function reachable(entryUrls) {
  const seen = new Set();
  const stack = entryUrls.map((u) => new URL("." + u, DIST));
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const js = readFileSync(url, "utf8");
    for (const spec of staticImports(js)) {
      stack.push(spec.startsWith("/") ? new URL("." + spec, DIST) : new URL(spec, url));
    }
  }
  return [...seen].map((href) => new URL(href));
}

function markersIn(urls) {
  const hits = new Set();
  for (const url of urls) {
    const js = readFileSync(url, "utf8");
    for (const m of MARKERS) if (js.includes(m)) hits.add(m);
  }
  return hits;
}

let failed = false;
let publicCount = 0;
for (const file of htmlFiles(DIST)) {
  const rel = file.pathname.slice(DIST.pathname.length);
  const graph = reachable(entryScripts(readFileSync(file, "utf8")));
  const hits = markersIn(graph);
  if (rel === "admin.html") {
    for (const m of MARKERS) {
      if (!hits.has(m)) {
        console.error(`control failed: admin.html does not reach "${m}", so the probe is invalid`);
        failed = true;
      }
    }
    continue;
  }
  if (rel === "maintenance.html" || rel.startsWith("google")) continue;
  publicCount += 1;
  if (hits.size) {
    console.error(`${rel} reaches admin-only code: ${[...hits].join(", ")}`);
    failed = true;
  }
}
if (publicCount !== 15) {
  console.error(`expected 15 public pages, found ${publicCount}`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`ok: ${publicCount} public pages, none reaches admin-only code; admin.html reaches both markers`);
