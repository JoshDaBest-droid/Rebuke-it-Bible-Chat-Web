/* Background sync between AsyncStorage and Supabase. Nothing in here ever
   blocks the UI — screens keep reading/writing AsyncStorage exactly as
   before (see storage.js), and this module pushes changes to Supabase
   afterward, fire-and-forget. If the user is signed out, every push is a
   no-op — the app behaves exactly as it did before Supabase existed.

   Reconciliation strategy: rather than tracking individual add/remove
   operations, every push sends the CURRENT full local list for that key and
   reconciles it against Supabase (upsert what's present, delete what's
   gone). storage.js's setJSON already receives the full "after" array on
   every call, so this is simpler than delta-tracking and self-corrects if a
   push is ever missed. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase/client";
// From keys.js (not storage.js) — storage.js imports THIS module for the
// sync push hooks, so importing storage.js back from here would recreate
// the exact circular import that used to crash the app at startup.
import { KEYS } from "../storage/keys";

let currentUserId = null;
export function setSyncUserId(userId) {
  currentUserId = userId;
}

// Plain event emitter (not React context) for anything that needs to react
// to a sign-in pull but can't rely on useAuth() — specifically ThemeContext,
// whose provider sits ABOVE AuthProvider in App.js, so it can't consume
// AuthContext's syncVersion the way the other screens/contexts do.
const pullListeners = new Set();
export function onLocalDataPulled(callback) {
  pullListeners.add(callback);
  return () => pullListeners.delete(callback);
}
function notifyLocalDataPulled() {
  pullListeners.forEach(cb => cb());
}

// Per-key promise queue — keeps pushes for the SAME key in order (so a rapid
// toggle-on/toggle-off can't race and leave a phantom row) without ever
// making the caller wait for the network.
const queues = new Map();
function enqueue(key, task) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(task).catch(() => {}); // a sync failure must never break the chain or surface to the UI
  queues.set(key, next);
  return next;
}

// ---- journal / prayers / highlights / bookmarks: reconcile-whole-array ----
async function reconcileArray(table, userId, items, mapItem, idKey) {
  const rows = items.map(item => ({ user_id: userId, ...mapItem(item) }));
  if (rows.length > 0) {
    await supabase.from(table).upsert(rows, { onConflict: `user_id,${idKey}` });
  }
  const { data: existing } = await supabase.from(table).select(idKey).eq("user_id", userId);
  const keep = new Set(rows.map(r => r[idKey]));
  const toDelete = (existing || []).map(r => r[idKey]).filter(id => !keep.has(id));
  if (toDelete.length > 0) {
    await supabase.from(table).delete().eq("user_id", userId).in(idKey, toDelete);
  }
}

// ---- user_settings: single row, one column per preference ----
const SETTINGS_COLUMNS = {
  [KEYS.theme]: "theme",
  [KEYS.mode]: "mode",
  [KEYS.textScale]: "text_scale",
  [KEYS.contrast]: "contrast",
  [KEYS.reducedMotion]: "reduced_motion",
  [KEYS.fontColor]: "font_color",
};

function parseSettingValue(column, rawValue) {
  if (column === "text_scale") return parseFloat(rawValue);
  if (column === "contrast" || column === "reduced_motion") return rawValue === "true";
  return rawValue || null;
}

async function pushSetting(userId, column, rawValue) {
  await supabase.from("user_settings").upsert(
    { user_id: userId, [column]: parseSettingValue(column, rawValue), updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

const JSON_HANDLERS = {
  [KEYS.journal]: (userId, list) =>
    reconcileArray("journal_entries", userId, list, item => ({ client_id: item.id, text: item.text, linked_ref: item.linkedRef }), "client_id"),
  [KEYS.prayers]: (userId, list) =>
    reconcileArray("prayers", userId, list, item => ({ client_id: item.id, text: item.text, type: item.type }), "client_id"),
  [KEYS.highlights]: (userId, list) =>
    reconcileArray("highlights", userId, list, item => ({ ref: item.ref, text: item.text }), "ref"),
  [KEYS.bookmarks]: (userId, list) =>
    reconcileArray("bookmarks", userId, list, item => ({ ref: item.ref, text: item.text }), "ref"),
  [KEYS.chatHistory]: (userId, list) =>
    reconcileArray("chat_history", userId, list, item => ({ client_id: item.id, question: item.question, response: item.response }), "client_id"),
  [KEYS.discussThreads]: (userId, list) =>
    reconcileArray("discuss_threads", userId, list, item => ({
      client_id: item.id, title: item.title, messages: item.messages, updated_at: item.updatedAt,
    }), "client_id"),
};

/** Called from storage.js's setJSON. No-op while signed out. */
export function syncPushJSON(key, value) {
  if (!currentUserId) return;
  const handler = JSON_HANDLERS[key];
  if (!handler) return;
  enqueue(key, () => handler(currentUserId, value));
}

/** Called from storage.js's setString. No-op while signed out. */
export function syncPushString(key, value) {
  if (!currentUserId) return;
  const column = SETTINGS_COLUMNS[key];
  if (!column) return;
  enqueue(key, () => pushSetting(currentUserId, column, value));
}

// ---- Pull (sign-in) and one-time upload (fresh sign-up with guest data) ----

const TABLES_FOR_EXISTENCE_CHECK = ["journal_entries", "prayers", "highlights", "bookmarks", "user_settings", "chat_history", "discuss_threads"];

/** Cheap existence check used by AuthContext to decide pull vs. confirm-overwrite. */
export async function hasAnyRemoteData(userId) {
  for (const table of TABLES_FOR_EXISTENCE_CHECK) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    if (count > 0) return true;
  }
  return false;
}

/** Pulls every table for this user and overwrites local AsyncStorage.
 *  Writes AsyncStorage directly (not via storage.js's setJSON/setString) so
 *  this doesn't immediately re-trigger a redundant push of what we just pulled. */
export async function pullAllToLocal(userId) {
  const [journal, prayers, highlights, bookmarks, settings, chatHistory, discussThreads] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("prayers").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("highlights").select("*").eq("user_id", userId),
    supabase.from("bookmarks").select("*").eq("user_id", userId),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("chat_history").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("discuss_threads").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);

  const setLocalJSON = (key, value) => AsyncStorage.setItem(key, JSON.stringify(value));

  await setLocalJSON(KEYS.journal, (journal.data || []).map(r => ({ id: r.client_id, text: r.text, linkedRef: r.linked_ref, date: r.created_at })));
  await setLocalJSON(KEYS.prayers, (prayers.data || []).map(r => ({ id: r.client_id, text: r.text, type: r.type, date: r.created_at })));
  await setLocalJSON(KEYS.highlights, (highlights.data || []).map(r => ({ ref: r.ref, text: r.text, date: r.created_at })));
  await setLocalJSON(KEYS.bookmarks, (bookmarks.data || []).map(r => ({ ref: r.ref, text: r.text, date: r.created_at })));
  await setLocalJSON(KEYS.chatHistory, (chatHistory.data || []).map(r => ({ id: r.client_id, question: r.question, response: r.response, date: r.created_at })));
  await setLocalJSON(KEYS.discussThreads, (discussThreads.data || []).map(r => ({ id: r.client_id, title: r.title, messages: r.messages, createdAt: r.created_at, updatedAt: r.updated_at })));

  const row = settings.data;
  if (row) {
    if (row.theme != null) await AsyncStorage.setItem(KEYS.theme, row.theme);
    if (row.mode != null) await AsyncStorage.setItem(KEYS.mode, row.mode);
    if (row.text_scale != null) await AsyncStorage.setItem(KEYS.textScale, String(row.text_scale));
    if (row.contrast != null) await AsyncStorage.setItem(KEYS.contrast, String(row.contrast));
    if (row.reduced_motion != null) await AsyncStorage.setItem(KEYS.reducedMotion, String(row.reduced_motion));
    if (row.font_color != null) await AsyncStorage.setItem(KEYS.fontColor, row.font_color);
  }

  notifyLocalDataPulled();
}

/** Uploads current local AsyncStorage data to Supabase — used once, right
 *  after a brand-new sign-up, so existing guest data isn't lost. */
export async function pushAllFromLocal(userId) {
  const getLocalJSON = async (key, fallback) => {
    const raw = await AsyncStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  };
  const getLocalString = (key) => AsyncStorage.getItem(key);

  const [journal, prayers, highlights, bookmarks, chatHistory, discussThreads] = await Promise.all([
    getLocalJSON(KEYS.journal, []),
    getLocalJSON(KEYS.prayers, []),
    getLocalJSON(KEYS.highlights, []),
    getLocalJSON(KEYS.bookmarks, []),
    getLocalJSON(KEYS.chatHistory, []),
    getLocalJSON(KEYS.discussThreads, []),
  ]);

  await Promise.all([
    JSON_HANDLERS[KEYS.journal](userId, journal),
    JSON_HANDLERS[KEYS.prayers](userId, prayers),
    JSON_HANDLERS[KEYS.highlights](userId, highlights),
    JSON_HANDLERS[KEYS.bookmarks](userId, bookmarks),
    JSON_HANDLERS[KEYS.chatHistory](userId, chatHistory),
    JSON_HANDLERS[KEYS.discussThreads](userId, discussThreads),
  ]);

  for (const key of Object.keys(SETTINGS_COLUMNS)) {
    const value = await getLocalString(key);
    if (value != null) await pushSetting(userId, SETTINGS_COLUMNS[key], value);
  }
}
