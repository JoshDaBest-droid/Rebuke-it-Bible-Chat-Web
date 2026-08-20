/* Rebuke it: Bible Chat — AI grounding corpus (King James Version, public domain).
   This small tagged subset powers the AI chat's local retrieval (which verses
   to cite for a given topic). The full 66-book KJV text lives in kjvFull.js
   and is what the Bible Reader and Search actually read from —
   this file's `text` fields are kept in exact KJV wording so citations shown
   in chat match what the reader shows when tapped.

   VERSES itself now lives in /shared/verses.json — the AI worker (worker/)
   also runs semantic search over this exact same list, so it's kept in one
   place instead of duplicated between the app and the worker. */
import { KJV_DATA } from "./kjvFull";
import versesData from "../../shared/verses.json";

export const VERSES = versesData;

// Public-domain-style short commentary notes (demo subset — condensed, Matthew Henry-influenced).
export const COMMENTARY = {
  "John 3:16": "Often called 'the gospel in a sentence.' The verse moves from God's love (motive), to the gift of the Son (means), to belief (response), to eternal life (result). 'Whosoever' signals the offer is universal, not restricted to one nation or class.",
  "Psalm 23:1": "Written by David, a literal shepherd. Calling the LORD 'my shepherd' is intensely personal, not abstract theology — it claims a relationship, not just a doctrine.",
  "Philippians 4:6": "Paul wrote this from prison. The command to 'be careful for nothing' isn't naive positivity — it's paired immediately with a concrete action: bring it to God in prayer and supplication, with thanksgiving even before the outcome is known.",
  "Romans 8:28": "'All things work together for good' does not mean all things ARE good. It means God is able to weave hardship into a good purpose for those who love him — a promise about God's faithfulness, not a denial of pain.",
};

export const CROSS_REFS = {
  "John 3:16": ["Romans 5:8", "1 John 4:9", "John 3:17"],
  "Psalm 23:1": ["John 10:11", "Psalm 100:3", "Isaiah 40:11"],
  "Philippians 4:6": ["1 Peter 5:7", "Matthew 6:25", "Philippians 4:7"],
  "Romans 8:28": ["Genesis 50:20", "Jeremiah 29:11"],
};

/* Resolve any "Book Chapter:Verse" reference against the full offline KJV
   text (kjvFull.js). Used as the fallback whenever a ref isn't in the
   small curated VERSES set above — e.g. cross-references and search results. */
export function parseRef(ref) {
  const m = ref.match(/^(.*)\s(\d+):(\d+)$/);
  if (!m) return null;
  let book = m[1].trim();
  if (book === "Psalm") book = "Psalms";
  return { book, chapter: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
}
export function lookupKJVVerse(ref) {
  const p = parseRef(ref);
  if (!p) return null;
  const b = KJV_DATA.find(x => x.name === p.book);
  if (!b) return null;
  const ch = b.chapters[p.chapter - 1];
  if (!ch) return null;
  return ch[p.verse - 1] || null;
}

/* The verses immediately before/after a reference, within the same chapter.
   This is how "AI explanation" features stay Bible-only: instead of
   generating interpretive commentary, they surface the actual surrounding
   scripture and let it speak for itself — no invented theology. */
export function getChapterContext(ref, span = 1) {
  const p = parseRef(ref);
  if (!p) return [];
  const b = KJV_DATA.find(x => x.name === p.book);
  if (!b) return [];
  const ch = b.chapters[p.chapter - 1];
  if (!ch) return [];
  const out = [];
  const start = Math.max(1, p.verse - span);
  const end = Math.min(ch.length, p.verse + span);
  for (let v = start; v <= end; v++) {
    if (v === p.verse) continue;
    out.push({ ref: `${b.name} ${p.chapter}:${v}`, text: ch[v - 1] });
  }
  return out;
}

/* Shared by chatEngine.js (scholarly voice) and the verse-sheet AI Insight
   so both "AI explains this verse" surfaces use the same Bible-only source:
   immediate chapter context + cross-references, never invented commentary. */
export function getBibleOnlyExplanation(ref) {
  const context = getChapterContext(ref, 1);
  const cross = (CROSS_REFS[ref] || [])
    .map(r => ({ ref: r, text: lookupKJVVerse(r) }))
    .filter(c => c.text);
  return { context, cross };
}
