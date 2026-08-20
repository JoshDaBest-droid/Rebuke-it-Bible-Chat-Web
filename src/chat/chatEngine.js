/* AI discovery engine — NOT a chatbot. Pure logic, no UI.
   generateAIResponse() never writes a theological answer. It returns a
   discovery result — detected themes, a short list of Scripture passages
   with a one-sentence "why" each, and related topics to explore next. The
   Bible stays the authority; this only helps someone find the right place
   in it.

   This file only does LOCAL retrieval (free, on-device) + the offline
   fallback. Generation happens in worker/src/index.js, which also runs its
   own SEMANTIC (embeddings) retrieval over the curated verse corpus and
   merges it with whatever this file found locally — that merge is what
   lets the AI find passages like Job or Genesis 3 for a question like "why
   does God allow suffering?", which no literal word match here ever could.
   If the network or the proxy is unavailable, generateAIResponse() falls
   back to a local-only discovery result (same shape, built from keyword/tag
   matching), so the app still responds offline.

   Local retrieval draws on the ENTIRE offline KJV (all 31,102 verses in
   KJV_DATA), not just the small hand-tagged set — so the AI can cite any
   verse in the Bible relevant to what's asked, in this priority order:
     1. A direct reference the user typed (e.g. "explain John 3:16")
     2. Hand-verified topical matches (VERSES, for common life topics —
        kept because their context/tags are curated, not guessed)
     3. Free-text search across all 66 books for anything the curated set
        doesn't cover (specific people, places, doctrines, commands, etc.)
     4. A safe default if literally nothing matches, so a response never
        goes out without a citation. */
import { KJV_DATA } from "../data/kjvFull";
import { VERSES, lookupKJVVerse, getChapterContext } from "../data/bibleData";
import { JOURNEY_MOODS } from "../data/devotionals";
import { askClaude } from "./claudeClient";
import THEMES from "../../shared/themes.json";

// How many candidate verses this device retrieves and sends to the worker.
// Kept modest because the worker also runs its own semantic search over the
// same corpus and merges the two — this local set exists mainly to
// guarantee exact-reference and curated-topic hits aren't lost, not to be
// the whole candidate pool (see worker/src/index.js for the merge).
const AI_CANDIDATE_COUNT = 4;

/** Attaches the surrounding verse(s) to each candidate so Claude reasons
 *  over real biblical context, not an isolated line. Done here (not in the
 *  worker) because only the app has the full offline KJV text on hand. */
export function attachContext(verses) {
  return verses.map(v => ({ ...v, context: getChapterContext(v.ref, 1) }));
}

// There's no voice picker in the UI anymore — every response blends all of
// these perspectives instead of the user choosing one. Kept as a map (not
// deleted) because the worker still uses these descriptions to shape tone,
// and prose-style messages (crisis, journeys) still tag themselves with one.
export const VOICES = {
  pastoral: { label: "Pastoral", desc: "Warm, shepherding, personal" },
  scholarly: { label: "Scholarly", desc: "Historical & textual context" },
  devotional: { label: "Devotional", desc: "Reflective, quiet, contemplative" },
  wwjd: { label: "WWJD", desc: "Through the words & example of Jesus" },
  combined: { label: "Guide", desc: "A blend of pastoral, scholarly, devotional, and Jesus-centered perspectives" },
};

export const DISCLAIMER_TEXT = "Foundation's AI is a study companion, not a replacement for your pastor, therapist, or church community — especially for anything serious. Please talk to them too.";

const CRISIS_KEYWORDS = [
  "suicide", "kill myself", "end my life", "want to die", "self harm", "self-harm",
  "hurting myself", "no reason to live",
];

const KEYWORD_TO_TAG = {
  anxious: "anxious", anxiety: "anxious", worried: "anxious", worry: "anxious", stressed: "anxious", stress: "anxious", nervous: "anxious", overwhelmed: "overwhelmed",
  afraid: "fear", scared: "fear", fear: "fear", terrified: "fear",
  sad: "grieving", grief: "grieving", grieving: "grieving", loss: "grieving", died: "grieving", death: "grieving", mourning: "grieving",
  doubt: "doubt", doubting: "doubt", unsure: "doubt", questioning: "doubt", faith: "doubt",
  purpose: "purpose", meaning: "purpose", lost: "purpose", direction: "purpose", career: "purpose", job: "purpose", work: "purpose",
  love: "love", relationship: "relationships", relationships: "relationships", marriage: "relationships", dating: "relationships", friend: "relationships",
  peace: "peace", calm: "peace", rest: "rest", tired: "rest", exhausted: "rest", burned: "burden", burnt: "burden",
  hope: "hope", future: "future", uncertain: "future",
  grateful: "gratitude", thankful: "gratitude", gratitude: "gratitude", blessing: "gratitude",
  trust: "trust", decision: "decisions", decisions: "decisions", choice: "decisions", guidance: "guidance",
  joy: "joy", happy: "joy", identity: "identity", worth: "worth", enough: "worth", value: "worth",
  patience: "patience", angry: "patience", anger: "patience",

  suffer: "suffering", suffering: "suffering", pain: "suffering", painful: "suffering", hurting: "suffering",
  hardship: "suffering", hardships: "suffering", trial: "suffering", trials: "suffering", tribulation: "suffering",
  sin: "sin", sinful: "sin", sinner: "sin", sinned: "sin",
  redeem: "redemption", redemption: "redemption", redeemed: "redemption",
  grace: "grace", forgive: "forgiveness", forgiveness: "forgiveness", forgiven: "forgiveness",
  guilt: "forgiveness", guilty: "forgiveness", shame: "forgiveness",
  sovereignty: "sovereignty", sovereign: "sovereignty", control: "sovereignty",
  pray: "prayer", praying: "prayer", prayer: "prayer",
  "holy spirit": "holyspirit", spirit: "holyspirit",
  heaven: "eschatology", "second coming": "eschatology", eternity: "eschatology", eternal: "eschatology",
  temptation: "temptation", tempted: "temptation", addiction: "temptation", addicted: "temptation",
  humble: "humility", humility: "humility", pride: "pride", proud: "pride",
  obey: "obedience", obedience: "obedience", justice: "justice", unfair: "justice",
  weak: "weakness", weakness: "weakness", strong: "strength", strength: "strength",
  salvation: "salvation", saved: "salvation",
  lonely: "loneliness", loneliness: "loneliness", alone: "loneliness",
  forgotten: "abandonment", abandoned: "abandonment", abandonment: "abandonment", forsaken: "abandonment",
  parenting: "parenting", children: "parenting", kids: "parenting", parent: "parenting",
  money: "money", finances: "money", financial: "money", wealth: "money",
  health: "health", sick: "health", illness: "health", healing: "health",
};

function extractTags(message) {
  const lower = message.toLowerCase();
  const tags = new Set();
  for (const [kw, tag] of Object.entries(KEYWORD_TO_TAG)) {
    if (lower.includes(kw)) tags.add(tag);
  }
  return tags;
}

// ---- Direct "Book Chapter:Verse" detection, e.g. "explain John 3:16" ----
const BOOK_ALIASES = (() => {
  const map = {};
  KJV_DATA.forEach(b => {
    map[b.name.toLowerCase()] = b.name;
    map[b.abbr.toLowerCase()] = b.name;
  });
  map["psalm"] = "Psalms";
  map["song of songs"] = "Song of Solomon";
  map["songs"] = "Song of Solomon";
  map["revelations"] = "Revelation";
  return map;
})();
const REF_REGEX = new RegExp(
  "\\b(" + Object.keys(BOOK_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|") + ")\\s+(\\d{1,3}):(\\d{1,3})",
  "i"
);

function detectDirectReference(message) {
  const m = message.match(REF_REGEX);
  if (!m) return null;
  const bookName = BOOK_ALIASES[m[1].trim().toLowerCase()];
  if (!bookName) return null;
  const ref = `${bookName} ${parseInt(m[2], 10)}:${parseInt(m[3], 10)}`;
  const text = lookupKJVVerse(ref);
  return text ? { ref, text } : null;
}

// ---- Free-text search across the complete KJV (all 66 books, 31,102 verses) ----
const STOPWORDS = new Set(["the", "and", "for", "are", "was", "not", "but", "you", "him", "her", "his", "its", "who", "why", "how", "get", "got", "just", "feel", "feels", "feeling", "that", "this", "with", "from", "have", "has", "had", "what", "when", "where", "which", "can", "will", "would", "should", "could", "about", "really", "very", "much", "some", "any", "all", "because", "been", "being", "them", "they", "their", "we're", "i'm", "into", "than", "then", "also", "does", "did", "doing", "your", "yours", "mine", "our", "ours",
  "bible", "scripture", "scriptures", "verse", "verses", "says", "say", "said", "tell", "telling", "mean", "means", "meaning", "explain", "explains", "think", "thinks", "know", "knows", "god", "jesus", "christ", "lord"]);

function significantWords(message) {
  return message.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function wordStem(w) {
  if (w.length > 6 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function freeTextSearch(message, excludeRefs, limit) {
  const words = significantWords(message);
  if (!words.length || limit <= 0) return [];
  const stems = words.map(wordStem);
  const results = [];
  for (const book of KJV_DATA) {
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const chapter = book.chapters[ci];
      for (let vi = 0; vi < chapter.length; vi++) {
        const text = chapter[vi];
        const lower = text.toLowerCase();
        let score = 0;
        for (let wi = 0; wi < words.length; wi++) {
          if (lower.includes(words[wi])) score += 1;
          else if (stems[wi] !== words[wi] && lower.includes(stems[wi])) score += 0.5;
        }
        if (score > 0) {
          const ref = `${book.name} ${ci + 1}:${vi + 1}`;
          if (!excludeRefs.has(ref)) results.push({ ref, text, score, len: text.length });
        }
      }
    }
  }
  results.sort((a, b) => b.score - a.score || a.len - b.len);
  return results.slice(0, limit);
}

export function retrieveVerses(message, topK = 3) {
  const results = [];
  const usedRefs = new Set();

  const direct = detectDirectReference(message);
  if (direct) { results.push(direct); usedRefs.add(direct.ref); }

  const tags = extractTags(message);
  if (tags.size > 0 && results.length < topK) {
    const scored = VERSES
      .map(v => ({ v, score: v.tags.filter(t => tags.has(t)).length }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    for (const { v } of scored) {
      if (results.length >= topK) break;
      if (!usedRefs.has(v.ref)) { results.push({ ref: v.ref, text: v.text }); usedRefs.add(v.ref); }
    }
  }

  if (results.length < topK) {
    freeTextSearch(message, usedRefs, topK - results.length).forEach(r => {
      results.push({ ref: r.ref, text: r.text });
      usedRefs.add(r.ref);
    });
  }

  if (results.length === 0) {
    VERSES.filter(v => v.tags.includes("purpose") || v.tags.includes("hope"))
      .slice(0, topK).forEach(v => results.push({ ref: v.ref, text: v.text }));
  }

  return results.slice(0, topK);
}

export function isCrisisMessage(message) {
  const lower = message.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

export function crisisResponse() {
  return {
    text: `I'm really glad you told me this instead of carrying it alone. I'm an AI companion, not equipped to walk through a crisis like this with you — but real, immediate help is available right now:\n\n` +
      `• US: call or text 988 (Suicide & Crisis Lifeline)\n` +
      `• International: findahelpline.com\n\n` +
      `You are not too much, and this pain is not the end of your story. "The Lord is near to the brokenhearted, and saves those who are crushed in spirit." — Psalm 34:18\n\n` +
      `Please reach out to one of those resources, or a trusted person near you, right now — and consider telling your pastor or a counselor too.`,
    citations: ["Psalm 34:18"],
    voice: "pastoral",
    isCrisis: true,
  };
}

// ---- Mood-based scripture journeys, created conversationally in chat ----
const TAG_TO_JOURNEY_MOOD = { anxious: "anxious", fear: "anxious", grieving: "grieving", doubt: "doubting", gratitude: "grateful", joy: "joyful", overwhelmed: "overwhelmed" };

function isJourneyRequest(message) {
  return /\bjourneys?\b/i.test(message);
}

function generateJourneyResponse(message, voice) {
  const tags = extractTags(message);
  let moodKey = null;
  for (const t of tags) { if (TAG_TO_JOURNEY_MOOD[t]) { moodKey = TAG_TO_JOURNEY_MOOD[t]; break; } }

  let verses, moodLabel;
  if (moodKey && JOURNEY_MOODS[moodKey]) {
    const journey = JOURNEY_MOODS[moodKey];
    moodLabel = `feeling ${journey.label.toLowerCase()}`;
    verses = journey.refs
      .map(ref => VERSES.find(x => x.ref === ref))
      .filter(Boolean)
      .map(v => ({ ref: v.ref, text: v.text }));
  } else {
    moodLabel = "where you are right now";
    verses = retrieveVerses(message, 5);
  }

  const dayLines = verses.map((v, i) => `Day ${i + 1} — ${v.ref}\n"${v.text}"`).join("\n\n");
  const text = `Here's a short scripture journey for ${moodLabel}. Read one entry a day and let it sit with you before moving to the next:\n\n${dayLines}\n\n` +
    `Want a different one? Just ask — e.g. "make me a journey for feeling grateful."`;
  return { text, citations: verses.map(v => v.ref), voice, isCrisis: false };
}

function themeByIdOrLabel(idOrLabel) {
  return THEMES.find(t => t.id === idOrLabel || t.label === idOrLabel) || null;
}

function relatedLabelsFor(tags) {
  const labels = new Set();
  for (const tagId of tags) {
    const theme = themeByIdOrLabel(tagId);
    if (!theme) continue;
    for (const relId of theme.relatedThemeIds) {
      const relTheme = themeByIdOrLabel(relId);
      if (relTheme) labels.add(relTheme.label);
    }
  }
  return Array.from(labels).slice(0, 4);
}

/** Offline, local-only fallback discovery result — no AI call, no network.
 *  Used whenever the network is unavailable or the Claude proxy call
 *  fails, so the app never goes silent. Same shape as the online result
 *  (themes/passages/relatedTopics), just built from local keyword/tag
 *  matching instead of semantic search + Claude. */
function generateOfflineFallback(message, voice) {
  const tags = extractTags(message);
  const verses = retrieveVerses(message, 5);
  const themeLabels = Array.from(tags).map(id => themeByIdOrLabel(id)?.label).filter(Boolean);
  return {
    lifeSituation: "",
    answer: "",
    themes: themeLabels.length ? themeLabels : ["Scripture related to your question"],
    passages: verses.map(v => ({ ref: v.ref, why: "Retrieved locally based on the words in your question." })),
    relatedTopics: relatedLabelsFor(tags),
    voice,
    isCrisis: false,
  };
}

/** Pure local lookup — zero cost, no network — used when the user taps a
 *  "related topic" chip. Returns the same discovery shape as
 *  generateAIResponse so the UI can render it identically. */
export function exploreTheme(idOrLabel) {
  const theme = themeByIdOrLabel(idOrLabel);
  if (!theme) return null;
  return {
    lifeSituation: "",
    answer: "",
    themes: [theme.label],
    passages: theme.passages.map(ref => ({ ref, why: theme.description })),
    relatedTopics: theme.relatedThemeIds.map(id => themeByIdOrLabel(id)?.label).filter(Boolean),
    voice: "combined",
    isCrisis: false,
  };
}

/** Given a user message and a voice (the app always passes "combined" —
 *  there's no picker anymore), return a
 *  discovery result: { lifeSituation, themes, passages: [{ref, why}],
 *  relatedTopics, voice, isCrisis }. This is NOT a written answer — the AI
 *  never explains the question, it only identifies themes and points to
 *  Scripture. Retrieves candidate verses locally (free), then asks Claude
 *  (via the proxy) to run semantic retrieval and select/explain the best
 *  passages from real, verified candidates only. Falls back to a
 *  local-only discovery result if the network or API is unavailable. */
export async function generateAIResponse(message, voice) {
  if (isCrisisMessage(message)) return crisisResponse();
  if (isJourneyRequest(message)) return generateJourneyResponse(message, voice);

  const candidates = attachContext(retrieveVerses(message, AI_CANDIDATE_COUNT));
  try {
    return await askClaude(message, voice, candidates);
  } catch (err) {
    return generateOfflineFallback(message, voice);
  }
}

/** Resolve a citation ref to display text — checks the curated set first,
 *  then falls back to the full KJV (mirrors the web app's card rendering). */
export function resolveCitationText(ref) {
  const v = VERSES.find(x => x.ref === ref);
  return (v && v.text) || lookupKJVVerse(ref);
}
