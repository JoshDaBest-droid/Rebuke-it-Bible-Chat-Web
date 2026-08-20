// Semantic retrieval for the AI chat proxy.
//
// Why this exists: keyword/tag matching (still used client-side, see
// src/chat/chatEngine.js) can't find "Job" or "Genesis 3" for a question
// like "why does God allow suffering?" because those chapters don't
// literally contain the word "suffering" in the KJV. Embeddings compare
// *meaning*, not literal words, so this is what actually understands the
// question before retrieval happens.
//
// Uses Cloudflare Workers AI (the `AI` binding in wrangler.toml) — no
// second AI vendor, no separate API key, and it's covered by Cloudflare's
// free daily allocation at this app's scale. Embeddings for the ~50-verse
// curated corpus are computed ONCE (via the /admin/rebuild-embeddings
// endpoint) and cached in KV; only the user's question is embedded live,
// which is one very cheap call per chat message.
import VERSES from "../../shared/verses.json";

const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
const EMBEDDINGS_KV_KEY = "verse_embeddings_v1";

export function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function embedTexts(env, texts) {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: texts });
  return result.data; // array of vectors, one per input text
}

/** Recomputes embeddings for the entire curated verse corpus in a single
 *  batched call and stores them in KV. Run this once after deploy, and
 *  again any time shared/verses.json changes — not on every request. */
export async function rebuildVerseEmbeddings(env) {
  const vectors = await embedTexts(env, VERSES.map(v => v.text));
  const entries = VERSES.map((v, i) => ({ ref: v.ref, vector: vectors[i] }));
  await env.RESPONSE_CACHE.put(EMBEDDINGS_KV_KEY, JSON.stringify(entries));
  return entries.length;
}

/** Embeds the user's message and returns the top-N curated verses by
 *  semantic similarity. Returns [] (never throws) if embeddings haven't
 *  been built yet or Workers AI isn't bound — callers should treat this as
 *  "no semantic candidates available this request", not a hard failure,
 *  since the client's keyword-based candidates still cover the request. */
export async function semanticRetrieve(env, message, limit) {
  if (!env.AI || !env.RESPONSE_CACHE) return [];

  const stored = await env.RESPONSE_CACHE.get(EMBEDDINGS_KV_KEY);
  if (!stored) return [];
  const verseVectors = JSON.parse(stored);

  const [queryVector] = await embedTexts(env, [message]);
  const verseByRef = new Map(VERSES.map(v => [v.ref, v]));

  return verseVectors
    .map(v => ({ ref: v.ref, score: cosineSimilarity(queryVector, v.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ ref }) => verseByRef.get(ref))
    .filter(Boolean)
    .map(v => ({ ref: v.ref, text: v.text }));
}
