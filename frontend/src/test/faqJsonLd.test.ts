import { SHELLS, norm, parse } from "./shells";

// The JSON-LD FAQPage on every shell must be a SUBSET of the visible FAQ:
// every Question name and Answer text has to appear, character for character,
// as a <summary> and its <p> in the same <details> on the same page. Google
// treats structured data that is not on the page as a manual-action risk, and
// divergence is invisible in a browser, so only a test catches it. The reverse
// is allowed on purpose: visible entries (e.g. "Who runs this?") may exist
// with no JSON-LD counterpart, which is how new FAQ copy gets added without
// growing the JSON-LD.
//
// The invariant is PER LOCALE: a Spanish page's JSON-LD must mirror the Spanish
// visible FAQ, so the shells iterate straight out of the registry.
type Entry = { question: string; answer: string };

// Both sides are reduced to plain text before comparing, and identically:
// JSON.parse undoes the JSON escaping on the JSON-LD side, textContent undoes
// the HTML entity escaping and drops inline markup on the visible side (norm
// collapses whitespace runs only; see ./shells).

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

test.each(SHELLS)("$name shell has a non-empty FAQPage and a visible FAQ to check it against", ({ shell }) => {
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

test.each(SHELLS)("$name shell JSON-LD FAQ is a subset of the visible FAQ", ({ shell }) => {
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

test.each(SHELLS)("$name shell keeps visible-only FAQ entries legal (subset, not equality)", ({ shell }) => {
  const jsonLdQuestions = jsonLdEntries(shell).map((entry) => entry.question);
  const visibleOnly = visibleEntries(shell).filter((entry) => !jsonLdQuestions.includes(entry.question));

  // "Who runs this?" is visible on every page in every locale and deliberately
  // absent from the JSON-LD. If this ever hits zero, someone has quietly turned
  // the invariant into equality and future visible-only copy will start failing.
  expect(visibleOnly.length).toBeGreaterThan(0);
});

// The translations doc pins the FAQ length per page, and it is the same in every
// locale: a translated page that quietly dropped an entry would still satisfy
// the subset invariant above.
const FAQ_COUNTS: Record<string, number> = {
  twitter: 7,
  tiktok: 8,
  reddit: 8,
  instagram: 8,
  facebook: 8,
};

test.each(SHELLS)("$name shell ships the same FAQ entry count as its en twin", ({ shell, platform }) => {
  expect(visibleEntries(shell)).toHaveLength(FAQ_COUNTS[platform]);
  // Four mirrored entries per page, per the doc.
  expect(jsonLdEntries(shell)).toHaveLength(4);
});
