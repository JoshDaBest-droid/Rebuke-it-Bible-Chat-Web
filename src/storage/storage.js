/* AsyncStorage helpers — the RN equivalent of the web app's localStorage
   usage. Every screen reads/writes through here exactly as before; nothing
   about that changed. The only difference: setJSON/setString now also fire
   a background push to Supabase (see sync/sync.js) after the local write
   succeeds. That push is a no-op while signed out, and never awaited here —
   local reads/writes stay instant either way. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncPushJSON, syncPushString } from "../sync/sync";
import { KEYS } from "./keys";

export { KEYS };

export async function getJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function setJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    syncPushJSON(key, value);
  } catch (e) {
    // best-effort; local storage failures shouldn't crash the app
  }
}

export async function getString(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw != null ? raw : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function setString(key, value) {
  try {
    await AsyncStorage.setItem(key, value);
    syncPushString(key, value);
  } catch (e) {
    // best-effort
  }
}

export async function clearAllAppData() {
  try {
    await AsyncStorage.multiRemove([
      KEYS.highlights, KEYS.bookmarks, KEYS.journal, KEYS.prayers, KEYS.planProgress, KEYS.chatHistory, KEYS.discussThreads,
    ]);
  } catch (e) {
    // best-effort
  }
}
