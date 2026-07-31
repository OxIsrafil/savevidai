// Raw shell sources, read straight off disk at test time (Vite's ?raw), so the
// assertions run against the files a crawler is served, not a build artifact.
import twitterShell from "../../index.html?raw";
import tiktokShell from "../../tiktokvideodownloader.html?raw";
import redditShell from "../../redditvideodownloader.html?raw";
import instagramShell from "../../instagramvideodownloader.html?raw";
import facebookShell from "../../facebookvideodownloader.html?raw";

// The JSON-LD FAQPage on every shell must be a SUBSET of the visible FAQ:
// every Question name and Answer text has to appear, character for character,
// as a <summary> and its <p> in the same <details> on the same page. Google
// treats structured data that is not on the page as a manual-action risk, and
// divergence is invisible in a browser, so only a test catches it. The reverse
// is allowed on purpose: visible entries (e.g. "Who runs this?") may exist
// with no JSON-LD counterpart, which is how new FAQ copy gets added without
// growing the JSON-LD.
type Shell = [name: string, shell: string];

const shells: Shell[] = [
  ["twitter", twitterShell],
  ["tiktok", tiktokShell],
  ["reddit", redditShell],
  ["instagram", instagramShell],
  ["facebook", facebookShell],
];

type Entry = { question: string; answer: string };

// Both sides are reduced to plain text before comparing, and identically:
// JSON.parse undoes the JSON escaping on the JSON-LD side, textContent undoes
// the HTML entity escaping and drops inline markup on the visible side. Only
// runs of whitespace are collapsed (source line wrapping is not a wording
// difference); every other character has to match.
const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const parse = (shell: string) => new DOMParser().parseFromString(shell, "text/html");

function jsonLdEntries(shell: string): Entry[] {
  const doc = parse(shell);
  const blocks = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const entries: Entry[] = [];

  for (const block of blocks) {
    const raw = block.textContent ?? "";
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(`ld+json block is not valid JSON: ${String(error)}`);
    }
    // A shell may grow other structured-data types later; only FAQPage is
    // under this invariant.
    for (const node of Array.isArray(data) ? data : [data]) {
      const page = node as { "@type"?: string; mainEntity?: unknown };
      if (page?.["@type"] !== "FAQPage") continue;
      const mainEntity = Array.isArray(page.mainEntity) ? page.mainEntity : [];
      for (const item of mainEntity) {
        const question = item as { "@type"?: string; name?: string; acceptedAnswer?: { text?: string } };
        expect(question["@type"]).toBe("Question");
        entries.push({
          question: norm(question.name),
          answer: norm(question.acceptedAnswer?.text),
        });
      }
    }
  }

  return entries;
}

function visibleEntries(shell: string): Entry[] {
  const doc = parse(shell);
  return Array.from(doc.querySelectorAll(".faq details")).map((details) => ({
    question: norm(details.querySelector("summary")?.textContent),
    answer: norm(details.querySelector("p")?.textContent),
  }));
}

test.each(shells)("%s shell has a non-empty FAQPage and a visible FAQ to check it against", (_name, shell) => {
  // Without this the subset assertion below would pass trivially on a page
  // that lost its JSON-LD or its FAQ section altogether.
  const jsonLd = jsonLdEntries(shell);
  const visible = visibleEntries(shell);

  expect(jsonLd.length).toBeGreaterThan(0);
  expect(visible.length).toBeGreaterThanOrEqual(jsonLd.length);
  for (const entry of [...jsonLd, ...visible]) {
    expect(entry.question).not.toBe("");
    expect(entry.answer).not.toBe("");
  }
});

test.each(shells)("%s shell JSON-LD FAQ is a subset of the visible FAQ", (_name, shell) => {
  const visible = visibleEntries(shell);
  const visibleQuestions = visible.map((entry) => entry.question);

  for (const entry of jsonLdEntries(shell)) {
    // Matching by question first gives a readable diff on the answer: a
    // whole-pair lookup would only ever report "not found".
    const match = visible.find((candidate) => candidate.question === entry.question);
    expect(
      match,
      `JSON-LD question is not a visible FAQ question:\n  ${entry.question}\nvisible questions:\n  ${visibleQuestions.join("\n  ")}`,
    ).toBeDefined();
    expect(match?.answer).toBe(entry.answer);
  }
});

test.each(shells)("%s shell keeps visible-only FAQ entries legal (subset, not equality)", (_name, shell) => {
  const jsonLdQuestions = jsonLdEntries(shell).map((entry) => entry.question);
  const visibleOnly = visibleEntries(shell).filter((entry) => !jsonLdQuestions.includes(entry.question));

  // "Who runs this?" is visible on all five pages and deliberately absent from
  // the JSON-LD. If this ever hits zero, someone has quietly turned the
  // invariant into equality and future visible-only copy will start failing.
  expect(visibleOnly.length).toBeGreaterThan(0);
});
