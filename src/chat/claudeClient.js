/* Talks to the Rebuke it: Bible Chat discovery worker (see /worker) — the
   only piece that holds the real Anthropic API key. Returns a discovery
   result, never a written answer: { lifeSituation, themes, passages, relatedTopics, voice }.
   Also owns an on-device response cache: identical question + voice never
   hits the network (or the API) twice from the same device. */
import AsyncStorage from "@react-native-async-storage/async-storage";

// Set this after deploying the worker — see worker/README.md.
const PROXY_URL = "https://foundation-bible-chat-proxy.jluto193.workers.dev";

// Not a real secret — it ships inside the app bundle, so a determined
// attacker can still extract it. Its job is to block casual scanning/scripts
// that only have the URL, not to be unbreakable. Must match the worker's
// APP_SHARED_SECRET (`npx wrangler secret put APP_SHARED_SECRET`).
const APP_SHARED_SECRET = process.env.EXPO_PUBLIC_APP_SHARED_SECRET;

// v3: discovery result gained a real "answer" field (grounded paragraph
// explanation, not just per-passage one-liners) — bumped (as with the v2
// bump before it, when the shape changed from {text,citations} to
// {themes,passages,relatedTopics}) so no old cached entry missing "answer"
// is ever served into the new UI.
const CACHE_PREFIX = "ai_cache_v3:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — scripture doesn't go stale

function cacheKey(message, voice) {
  return CACHE_PREFIX + voice + ":" + message.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getCached(message, voice) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(message, voice));
    if (!raw) return null;
    const { value, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

async function setCached(message, voice, value) {
  try {
    await AsyncStorage.setItem(cacheKey(message, voice), JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // best-effort cache — a write failure shouldn't break the chat response
  }
}

/** Calls the discovery worker with the user's message, voice, and the
 *  candidate verses retrieved locally in chatEngine.js. Checks the
 *  on-device cache first. Throws on any network/API failure so the caller
 *  can fall back to the offline discovery result. */
export async function askClaude(message, voice, candidates) {
  const cached = await getCached(message, voice);
  if (cached) return cached;

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-secret": APP_SHARED_SECRET || "" },
    body: JSON.stringify({ message, voice, candidates }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.passages)) throw new Error("Malformed response from proxy");

  const result = {
    lifeSituation: data.lifeSituation || "",
    answer: data.answer || "",
    themes: Array.isArray(data.themes) ? data.themes : [],
    passages: data.passages,
    relatedTopics: Array.isArray(data.relatedTopics) ? data.relatedTopics : [],
    voice: data.voice || voice,
    isCrisis: false,
  };
  await setCached(message, voice, result);
  return result;
}

/** Calls the /converse route with the capped message history and candidates
 *  for the latest user message. Never cached — see worker/src/index.js for
 *  why. Throws on any network/API failure; the caller shows a retry-able
 *  error bubble instead of a discovery-shaped fallback, since there's no
 *  meaningful offline substitute for a live conversation turn. */
export async function askClaudeConverse(messages, candidates) {
  const res = await fetch(`${PROXY_URL}/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-secret": APP_SHARED_SECRET || "" },
    body: JSON.stringify({ messages, candidates }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}`);
  const data = await res.json();
  if (typeof data.text !== "string") throw new Error("Malformed response from proxy");
  return { text: data.text, citations: Array.isArray(data.citations) ? data.citations : [] };
}
