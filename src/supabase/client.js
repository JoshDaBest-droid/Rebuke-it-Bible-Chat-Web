/* Supabase client for React Native. Two RN-specific things this needs that a
   plain web setup doesn't:
   1. AsyncStorage as the session storage adapter (there's no browser
      localStorage here) — persistSession + this adapter is what keeps a
      user signed in across app restarts.
   2. Manually starting/stopping auto token refresh based on app foreground
      state. Supabase's background timer doesn't reliably survive RN apps
      being backgrounded — without this, users can get silently signed out. */
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing — EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
    "Auth and sync will fail until .env is set (see .env.example) and the app is restarted."
  );
}

// Supabase's session (including the long-lived refresh token) needs
// encryption at rest on-device — plain AsyncStorage is an unencrypted
// sandbox file, readable by anyone with device-level access (rooted phone,
// unencrypted backup, etc). SecureStore alone can't hold it directly (it's
// too size-limited for a full session object on iOS), so this follows
// Supabase's documented pattern: encrypt the session with a random AES key,
// store the ciphertext in AsyncStorage, and keep only the small AES key
// itself in SecureStore (OS keychain/keystore).
class LargeSecureStore {
  async _encrypt(key, value) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const bytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(bytes);
  }

  async _decrypt(key, value) {
    const hexKey = await SecureStore.getItemAsync(key);
    if (!hexKey) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return encrypted;
    return this._decrypt(key, encrypted);
  }

  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key, value) {
    await AsyncStorage.setItem(key, await this._encrypt(key, value));
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
