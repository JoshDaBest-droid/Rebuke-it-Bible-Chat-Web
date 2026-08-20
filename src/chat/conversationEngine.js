/* Multi-turn conversation logic for the "Discuss" tab — pure logic, no UI.
   Unlike chatEngine.js's generateAIResponse (one-shot discovery), this
   holds a real back-and-forth: the full thread history is sent each turn
   so the AI can respond to pushback in context, via worker/src/index.js's
   /converse route (see SYSTEM_PROMPT_DISCUSS there for the "never concede
   a biblical principle, but engage warmly and substantively" behavior).

   Crisis detection and local verse retrieval are reused as-is from
   chatEngine.js — Discuss is not a separate safety surface. */
import { retrieveVerses, attachContext, isCrisisMessage, crisisResponse } from "./chatEngine";
import { askClaudeConverse } from "./claudeClient";

// Same local-retrieval count as chatEngine.js's AI_CANDIDATE_COUNT — this
// set exists mainly to guarantee exact-reference/curated-topic hits aren't
// lost; the worker's own semantic search over the full corpus is the real
// candidate pool (see worker/src/index.js's mergeCandidates).
const AI_CANDIDATE_COUNT = 4;

// Messages (not exchanges) sent to the worker per turn — enough for ~10
// back-and-forth exchanges of real argument/pushback, the behavior this
// feature exists for, while keeping token cost/latency bounded. Older
// turns simply drop out of what's sent to the model; the full thread stays
// saved and visible in the UI regardless (see DiscussScreen.js).
const HISTORY_TURNS_SENT = 20;

/** Given a thread's full message list (oldest first, already including the
 *  new user message as the last entry, each {role: "user"|"assistant",
 *  content}), returns the AI's reply as { text, citations, isCrisis }.
 *  Crisis keywords short-circuit before any network call, exactly as in
 *  the Guide tab. */
export async function sendDiscussTurn(fullHistory) {
  const latest = fullHistory[fullHistory.length - 1].content;
  if (isCrisisMessage(latest)) {
    const c = crisisResponse();
    return { text: c.text, citations: c.citations, isCrisis: true };
  }

  const capped = fullHistory.slice(-HISTORY_TURNS_SENT);
  const candidates = attachContext(retrieveVerses(latest, AI_CANDIDATE_COUNT));
  const { text, citations } = await askClaudeConverse(capped, candidates);
  return { text, citations, isCrisis: false };
}

/** Derives a short thread title from the first user message — no manual
 *  rename UI, this is the simplest thing that gives a recognizable list. */
export function deriveThreadTitle(firstUserMessage) {
  const trimmed = firstUserMessage.trim();
  return trimmed.length > 48 ? trimmed.slice(0, 48).trimEnd() + "…" : trimmed;
}
