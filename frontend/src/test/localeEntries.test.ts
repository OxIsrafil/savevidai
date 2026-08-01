// The 10 locale browser entries, checked as source text.
//
// Types cannot catch the failure that matters here: every app accepts the same
// PageStrings shape, so wiring esReddit into the TikTok entry compiles cleanly
// and ships a Spanish Reddit page under the TikTok URL. The pairing of app,
// locale table and file name is the invariant, so it is asserted directly.
const sources = import.meta.glob("../entries/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Entry = [file: string, component: string, importPath: string, table: string];

const APPS: ReadonlyArray<[slug: string, component: string, path: string, camel: string]> = [
  ["twitter", "App", "../App", "Twitter"],
  ["tiktok", "TikTokApp", "../tiktok/TikTokApp", "TikTok"],
  ["reddit", "RedditApp", "../reddit/RedditApp", "Reddit"],
  ["instagram", "InstagramApp", "../instagram/InstagramApp", "Instagram"],
  ["facebook", "FacebookApp", "../facebook/FacebookApp", "Facebook"],
];

const entries: Entry[] = ["es", "hi"].flatMap((locale) =>
  APPS.map(
    ([slug, component, path, camel]): Entry => [
      `${locale}-${slug}.tsx`,
      component,
      path,
      `${locale}${camel}`,
    ],
  ),
);

function sourceOf(file: string) {
  const key = Object.keys(sources).find((k) => k.endsWith(`/entries/${file}`));
  expect(key, `missing src/entries/${file}`).toBeTruthy();
  return sources[key!];
}

describe("locale entries", () => {
  it("has exactly the 10 locale entries and nothing else", () => {
    expect(Object.keys(sources).map((k) => k.split("/").pop()).sort()).toEqual(
      entries.map(([file]) => file).sort(),
    );
  });

  it.each(entries)("%s mounts %s with the %s table", (file, component, path, table) => {
    const src = sourceOf(file);
    expect(src).toContain(`import ${component} from "${path}";`);
    expect(src).toContain(`import { ${table} } from "../locales/${table.slice(0, 2)}";`);
    expect(src).toContain(`<${component} strings={${table}} />`);
    // Same mount contract as the en entries: one StrictMode root, reduced motion honoured.
    expect(src).toContain('createRoot(document.getElementById("root")!).render(');
    expect(src).toContain("<StrictMode>");
    expect(src).toContain('<MotionConfig reducedMotion="user">');
  });
});
