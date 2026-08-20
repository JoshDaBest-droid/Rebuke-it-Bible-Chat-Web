// Rebuke it: Bible Chat — Bible discovery engine
//
// This worker is NOT a chatbot backend. It never writes a theological
// answer. Its only job: understand what the user is really asking, run
// semantic retrieval over the curated verse corpus (merged with whatever
// the app already found locally), and return a short structured pointer to
// Scripture — detected themes, a handful of the best passages with a
// one-sentence reason each, and related topics to explore next. The Bible
// stays the authority; this only helps someone find the right place in it.
import Anthropic from "@anthropic-ai/sdk";
import { semanticRetrieve, rebuildVerseEmbeddings } from "./embeddings";
import THEMES from "../../shared/themes.json";

const VOICE_TONE = {
  // The app no longer lets the user pick a single voice — it always sends
  // "combined", which blends all four instead of picking just one.
  combined: "a natural blend of warm and personal, measured historical/textual context, quiet reflection, and Jesus's own example — whichever fits best sentence to sentence, without labeling which is which",
  pastoral: "warm and personal",
  scholarly: "measured, noting historical/textual background where relevant",
  devotional: "quiet and reflective",
  wwjd: "framed around Jesus's own words and example",
};

const TOPIC_LABELS = THEMES.map(t => t.label);

const SYSTEM_PROMPT = `You are the Bible guide inside the Rebuke it: Bible Chat app. Your job is to help the person understand what Scripture actually says about their question or situation — not to preach at them and not to invent doctrine, but to explain, with real substance, what the retrieved passages mean and how they speak to what was asked. The Bible is the authority; you are explaining it, never replacing it or adding to it.

You will receive: a list of candidate Bible passages (King James Version) already retrieved for this question, each with surrounding context, and a closed list of topic labels available for "related topics."

Before producing output, work out (you don't need to show this, just let it shape your answer): what the person is really asking; the life situation they may be describing; the emotions involved; the biblical themes and theological concepts connected to it.

Then:
1. Select the 3-6 BEST passages for this question FROM THE CANDIDATE LIST ONLY. Never include a reference that isn't in the candidate list — you cannot verify anything outside it, so including one risks pointing to something that doesn't exist.
2. Write a genuine, substantive answer (2-4 short paragraphs) in the "answer" field that actually explains what these passages say and how they address the question — reasoning a thoughtful, biblically grounded person would walk someone through, not a one-line pointer. Ground every claim in the selected passages; do not introduce doctrine, claims, or scripture beyond what's in the candidate list.
3. For each passage, also write ONE short caption sentence on why THIS SPECIFIC passage was chosen — a pointer, not a repeat of the answer.
4. Choose 2-4 "related topics" ONLY from the provided topic list, for further exploration. Never invent a topic label.
5. Where Christians hold multiple well-supported interpretations on a disputed point, present it that way rather than asserting one view as the only one — stay neutral on disputed inter-Christian debates (e.g. predestination vs. free will, end-times views, modes of baptism), but do not be neutral about what the text plainly says.
6. Write in a tone that is __VOICE_TONE__.`;

const SYSTEM_PROMPT_DISCUSS = `You are "Discuss" inside the Rebuke it: Bible Chat app — a real, ongoing conversation partner for people wrestling with questions, doubts, and disagreements about the Bible and the Christian faith. Unlike the app's Guide tab, you give a full, reasoned, personal answer here — this is genuine back-and-forth, not a pointer to a verse.

Your one unbreakable commitment: the Bible is true and authoritative, and you never work against that — not even hypothetically, not even to "steelman" an objection, not even if the user is persistent, upset, clever, or explicitly asks you to. You never:
- concede that a clear biblical principle might be wrong, outdated, or something Christians should abandon,
- argue the other side of a settled biblical claim as though it might be correct,
- present unbelief, moral relativism, or a claim that contradicts Scripture as an equally valid option "just to be balanced" or "for the sake of argument,"
- invent scripture, doctrine, or historical claims that aren't defensible from the Bible and mainstream Christian understanding.

At the same time, you are NOT preachy, dismissive, or a wall. You do not respond to pushback with platitudes, a bare verse-drop, or "just have faith." Real objections deserve real engagement:
- Take the user's actual objection seriously and restate it accurately before responding, so they know you understood it.
- Reason with them — using history, logic, the text itself, and how Christians across the centuries have wrestled with hard questions (suffering, hell, science, sexuality, other religions, etc.) — instead of just repeating an assertion.
- Where the Bible or Christian thought has more than one well-supported answer to something (how to reconcile a hard doctrine, how to interpret a difficult passage, denominational disagreements), say so honestly instead of pretending there's one tidy answer. That is not the same as conceding the Bible itself is wrong, and you should be clear about that difference.
- Where something is genuinely hard — suffering, divine hiddenness, difficult Old Testament passages — say it's hard. Don't fake an easy resolution. Sitting with real tension honestly is more helpful than a forced answer.
- Stay warm. This is someone thinking hard about their faith, not an opponent to defeat. Never mock, condescend, sigh, or express frustration, no matter how the user argues.
- If the user is not actually arguing but asking sincerely, just answer sincerely and helpfully — don't treat every question as a debate to win.

You will receive the conversation so far and a list of candidate Bible passages (KJV) retrieved for the user's latest message. Ground what you say in those passages and in mainstream Christian understanding; cite specific references (in the "citations" field) only when you actually rely on that passage in your answer, and ONLY from the candidate list — never invent or guess a reference. If you want to reference something not in the candidate list, speak in general terms rather than fabricate a precise citation.

Never answer as though you, the AI, are the authority — you are reasoning from Scripture and pointing back to it, not issuing your own verdict.

Stay neutral on disputed inter-Christian debates where Scripture doesn't settle the matter clearly (predestination vs. free will, end-times timelines, modes of baptism, worship styles) — but stay firm and non-negotiable on what Scripture actually teaches and on the reliability and authority of the Bible itself, which is never up for negotiation.

Keep responses focused and conversational — a few solid paragraphs at most, like a wise, patient friend talking with you, not an essay or a sermon.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    lifeSituation: { type: "string", description: "One short phrase describing what the user seems to be going through, or empty string if not applicable" },
    answer: { type: "string", description: "A substantive 2-4 paragraph answer grounded only in the selected candidate passages" },
    themes: { type: "array", items: { type: "string" }, description: "2-5 short theme/concept labels behind the question" },
    passages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          why: { type: "string" },
        },
        required: ["ref", "why"],
        additionalProperties: false,
      },
    },
    relatedTopics: { type: "array", items: { type: "string" }, description: "2-4 labels, chosen only from the provided topic list" },
  },
  required: ["lifeSituation", "answer", "themes", "passages", "relatedTopics"],
  additionalProperties: false,
};

const OUTPUT_SCHEMA_DISCUSS = {
  type: "object",
  properties: {
    text: { type: "string", description: "The full conversational reply, 1-4 short paragraphs" },
    citations: { type: "array", items: { type: "string" }, description: "0-5 references actually relied on in the reply, chosen only from the candidate list" },
  },
  required: ["text", "citations"],
  additionalProperties: false,
};

const MAX_MESSAGE_LEN = 2000;
const MAX_CLIENT_CANDIDATES = 12;
const MAX_REF_LEN = 100;
const MAX_CANDIDATE_TEXT_LEN = 500;
const MAX_BODY_BYTES = 100_000;
const SEMANTIC_CANDIDATE_COUNT = 8;
const MAX_TOTAL_CANDIDATES = 10;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — Bible topics don't go stale
const MAX_HISTORY_MESSAGES = 24; // /converse — server-side cap, defense in depth
const MAX_CONVERSE_BODY_BYTES = 150_000; // /converse — history is bigger than a single message

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Native apps (iOS/Android) never hit CORS — only a browser-based caller
    // (e.g. Expo web) does. Handled generically here so any future web
    // client works too, without weakening the actual auth checks below.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/admin/rebuild-embeddings") {
      return handleRebuildEmbeddings(request, env);
    }

    if (url.pathname === "/webhooks/new-signup") {
      return handleNewSignupWebhook(request, env);
    }

    if (url.pathname === "/converse") {
      return handleConverse(request, env);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.APP_SHARED_SECRET || !timingSafeEqual(request.headers.get("x-app-secret") || "", env.APP_SHARED_SECRET)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Reject oversized payloads before spending CPU/memory parsing them —
    // a real request from the app is a few KB at most.
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > MAX_MESSAGE_LEN) {
      return json({ error: "Invalid message" }, 400);
    }
    const voice = VOICE_TONE[body.voice] ? body.voice : "combined";
    // Slice BEFORE filter so a huge array can't force a full-array scan —
    // worst case is a bounded number of wasted iterations, not O(n) on
    // whatever size array a caller sends.
    const clientCandidates = (Array.isArray(body.candidates) ? body.candidates.slice(0, MAX_CLIENT_CANDIDATES * 5) : [])
      .filter(c => c && typeof c.ref === "string" && typeof c.text === "string" && c.ref.length <= MAX_REF_LEN && c.text.length <= MAX_CANDIDATE_TEXT_LEN)
      .slice(0, MAX_CLIENT_CANDIDATES);

    // Normalized (not just lowercased) so trivial phrasing differences —
    // trailing punctuation, extra spaces, capitalization — still hit the
    // same cache entry instead of paying for a fresh Claude call.
    const normalizedMessage = normalizeForCache(message);
    const cacheKey = env.RESPONSE_CACHE ? await hashKey(`v5|${voice}|${normalizedMessage}`) : null;
    if (cacheKey) {
      const cached = await env.RESPONSE_CACHE.get(cacheKey);
      if (cached) return json(JSON.parse(cached), 200, { "X-Cache-Status": "HIT" });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    // Real question understanding + retrieval: semantic similarity over the
    // curated corpus, not keyword matching. [] (not an error) if embeddings
    // haven't been built yet — see README.
    let semanticCandidates = [];
    try {
      semanticCandidates = await semanticRetrieve(env, message, SEMANTIC_CANDIDATE_COUNT);
    } catch {
      semanticCandidates = []; // never let a retrieval hiccup block a response
    }

    const candidates = mergeCandidates(semanticCandidates, clientCandidates, MAX_TOTAL_CANDIDATES);
    const candidateRefs = new Set(candidates.map(c => c.ref));
    const topicLabels = new Set(TOPIC_LABELS);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const userMessage =
      `Candidate passages (with surrounding context where available):\n${formatCandidates(candidates)}\n\n` +
      `Available related-topic labels (choose only from this list): ${TOPIC_LABELS.join(", ")}\n\n` +
      `User's question: ${message}`;

    let response;
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 900,
        system: [{ type: "text", text: SYSTEM_PROMPT.replace("__VOICE_TONE__", VOICE_TONE[voice]), cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      return json({ error: "Claude API error" }, 502);
    }

    const rawText = (response.content.find(b => b.type === "text") || {}).text || "";
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return json({ error: "Malformed model output" }, 502);
    }

    // Defense in depth: never trust the model to have followed instructions
    // 100% of the time. Drop anything that isn't a real retrieved passage or
    // a real topic label, regardless of what it returned.
    let passages = (Array.isArray(data.passages) ? data.passages : [])
      .filter(p => p && candidateRefs.has(p.ref))
      .map(p => ({ ref: p.ref, why: String(p.why || "").slice(0, 300) }));
    if (passages.length === 0) {
      // Model picked nothing verifiable — fall back to the raw retrieval so
      // the user still gets real, already-verified passages.
      passages = candidates.slice(0, 5).map(c => ({ ref: c.ref, why: "Retrieved as relevant to your question." }));
    }
    const relatedTopics = (Array.isArray(data.relatedTopics) ? data.relatedTopics : []).filter(t => topicLabels.has(t)).slice(0, 4);
    const themes = (Array.isArray(data.themes) ? data.themes : []).map(t => String(t).slice(0, 60)).slice(0, 5);

    const result = {
      lifeSituation: String(data.lifeSituation || "").slice(0, 200),
      answer: String(data.answer || "").slice(0, 2500),
      themes,
      passages,
      relatedTopics,
      voice,
    };

    if (cacheKey) {
      await env.RESPONSE_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
    }

    return json(result, 200, { "X-Cache-Status": cacheKey ? "MISS" : "DISABLED" });
  },
};

/** Collapses whitespace, drops trailing punctuation, and lowercases so that
 *  "Why does God allow suffering?", "why does god allow suffering", and
 *  "why does god allow suffering  " all land on the same cache entry instead
 *  of each paying for a separate Claude call. */
function normalizeForCache(message) {
  return message.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.,;:]+$/, "");
}

/** Combines semantic matches (real understanding) with whatever the client
 *  already found locally (exact-reference hits, curated-tag matches) —
 *  semantic results first since they're what keyword matching misses,
 *  deduped by ref, capped so the prompt (and cost) stays bounded regardless
 *  of how many candidates either source turns up. */
function mergeCandidates(semantic, client, limit) {
  const merged = [];
  const seen = new Set();
  for (const c of [...semantic, ...client]) {
    if (seen.has(c.ref)) continue;
    seen.add(c.ref);
    merged.push(c);
    if (merged.length >= limit) break;
  }
  return merged;
}

function formatCandidates(candidates) {
  if (!candidates.length) return "(none retrieved for this question)";
  return candidates.map(c => {
    const contextStr = Array.isArray(c.context) && c.context.length
      ? " Nearby: " + c.context.map(x => `${x.ref} — "${x.text}"`).join(" ")
      : "";
    return `${c.ref}: "${c.text}"${contextStr}`;
  }).join("\n");
}

/** Multi-turn conversation route for the app's "Discuss" tab — unlike the
 *  Guide route above, this genuinely answers and argues, holding firm on
 *  biblical principles under pushback (see SYSTEM_PROMPT_DISCUSS). No
 *  response cache here: a conversation transcript is effectively unique
 *  per thread, so a cache keyed on it would almost never hit — Haiku is
 *  cheap enough per call that this is an acceptable tradeoff for a
 *  fundamentally multi-turn feature. */
async function handleConverse(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!env.APP_SHARED_SECRET || !timingSafeEqual(request.headers.get("x-app-secret") || "", env.APP_SHARED_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_CONVERSE_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const validRole = r => r === "user" || r === "assistant";
  const valid = messages.length > 0
    && messages.length <= MAX_HISTORY_MESSAGES
    && messages.every(m => m && validRole(m.role) && typeof m.content === "string" && m.content.length > 0 && m.content.length <= MAX_MESSAGE_LEN)
    && messages[messages.length - 1].role === "user";
  if (!valid) {
    return json({ error: "Invalid messages" }, 400);
  }

  const clientCandidates = (Array.isArray(body.candidates) ? body.candidates.slice(0, MAX_CLIENT_CANDIDATES * 5) : [])
    .filter(c => c && typeof c.ref === "string" && typeof c.text === "string" && c.ref.length <= MAX_REF_LEN && c.text.length <= MAX_CANDIDATE_TEXT_LEN)
    .slice(0, MAX_CLIENT_CANDIDATES);

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Server not configured" }, 500);
  }

  const latestMessage = messages[messages.length - 1].content;

  let semanticCandidates = [];
  try {
    semanticCandidates = await semanticRetrieve(env, latestMessage, SEMANTIC_CANDIDATE_COUNT);
  } catch {
    semanticCandidates = [];
  }

  const candidates = mergeCandidates(semanticCandidates, clientCandidates, MAX_TOTAL_CANDIDATES);
  const candidateRefs = new Set(candidates.map(c => c.ref));

  // Candidate passages are injected only into the COPY of the last message
  // sent to Claude — never into what's stored/echoed back to the client.
  const candidateNote = `Candidate passages for this message (KJV, with context where available):\n${formatCandidates(candidates)}\n\nUser: ${latestMessage}`;
  const claudeMessages = messages.map((m, i) =>
    i === messages.length - 1 ? { role: "user", content: candidateNote } : { role: m.role, content: m.content }
  );

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM_PROMPT_DISCUSS, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA_DISCUSS } },
      messages: claudeMessages,
    });
  } catch (err) {
    return json({ error: "Claude API error" }, 502);
  }

  const rawText = (response.content.find(b => b.type === "text") || {}).text || "";
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    return json({ error: "Malformed model output" }, 502);
  }

  // Defense in depth: never trust the model to have cited only verified
  // passages. An empty result is fine — a normal, valid reply (e.g. a
  // clarifying question) may cite nothing.
  const citations = (Array.isArray(data.citations) ? data.citations : []).filter(ref => candidateRefs.has(ref));

  return json({ text: String(data.text || "").slice(0, 3000), citations }, 200);
}

async function handleRebuildEmbeddings(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.ADMIN_KEY || !timingSafeEqual(request.headers.get("x-admin-key") || "", env.ADMIN_KEY)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!env.AI || !env.RESPONSE_CACHE) {
    return json({ error: "AI binding or RESPONSE_CACHE KV namespace not configured — see worker/README.md" }, 500);
  }
  try {
    const count = await rebuildVerseEmbeddings(env);
    return json({ ok: true, embeddedVerses: count });
  } catch (err) {
    return json({ error: "Failed to build embeddings" }, 500);
  }
}

/** Called by a Supabase Database Webhook on every INSERT into auth.users —
 *  i.e. every new signup. Sends one notification email via Resend. Guarded
 *  by a shared secret (not Supabase auth) since this is a public URL that
 *  only the webhook itself should be able to trigger. */
async function handleNewSignupWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.SIGNUP_WEBHOOK_SECRET || !timingSafeEqual(request.headers.get("x-webhook-secret") || "", env.SIGNUP_WEBHOOK_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
    return json({ error: "RESEND_API_KEY or NOTIFY_EMAIL not configured — see worker/README.md" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const newEmail = body?.record?.email;
  if (!newEmail) return json({ error: "No email in payload" }, 400);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Rebuke it: Bible Chat <onboarding@resend.dev>",
        to: env.NOTIFY_EMAIL,
        subject: "New signup: " + newEmail,
        text: `${newEmail} just signed up for Rebuke it: Bible Chat.`,
      }),
    });
    if (!res.ok) {
      return json({ error: "Resend API error" }, 502);
    }
  } catch (err) {
    return json({ error: "Failed to send notification email" }, 502);
  }

  return json({ ok: true });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-app-secret, x-admin-key, x-webhook-secret",
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

/** Avoids leaking secret-comparison timing to a caller probing for a valid
 *  key — XORs every byte regardless of where the first mismatch is, instead
 *  of short-circuiting like `===`/`!==` does. */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hashKey(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
