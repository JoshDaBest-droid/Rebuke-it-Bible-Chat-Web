/* Optional account + sync. Guest mode (no session) works exactly as the app
   always has — this only activates when the user chooses to sign in.
   Mirrors the VerseSheetContext pattern already used in this codebase: a
   provider that renders its own modal, exposing just a couple of functions
   to the rest of the app (here: openAuthModal + session state). */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, TextInput, Pressable, Modal, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import * as Linking from "expo-linking";
import { useTheme } from "../theme/ThemeContext";
import { supabase } from "../supabase/client";
import { setSyncUserId, hasAnyRemoteData, pullAllToLocal, pushAllFromLocal } from "../sync/sync";
import { getJSON, KEYS, clearAllAppData } from "../storage/storage";

// Parses the tokens Supabase appends to ANY auth email's redirect link — password
// reset ("type=recovery") and signup confirmation ("type=signup") both use this
// exact shape (as a URL fragment, e.g. "...#access_token=...&refresh_token=...&type=...").
// Works whether the fragment lands after "#" or "?" — Expo Go's exp:// proxy
// URLs and a standalone build's custom-scheme URL don't always agree.
function parseAuthTokensFromUrl(url) {
  if (!url || !url.includes("access_token")) return null;
  const afterHash = url.includes("#") ? url.split("#")[1] : url.split("?").slice(1).join("?");
  const params = new URLSearchParams(afterHash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const type = params.get("type");
  if (access_token && refresh_token) return { access_token, refresh_token, type };
  return null;
}

const AuthCtx = createContext(null);
export function useAuth() {
  return useContext(AuthCtx);
}

async function localHasGuestData() {
  const [journal, prayers, highlights, bookmarks, planProgress] = await Promise.all([
    getJSON(KEYS.journal, []),
    getJSON(KEYS.prayers, []),
    getJSON(KEYS.highlights, []),
    getJSON(KEYS.bookmarks, []),
    getJSON(KEYS.planProgress, {}),
  ]);
  return journal.length > 0 || prayers.length > 0 || highlights.length > 0 || bookmarks.length > 0 || Object.keys(planProgress).length > 0;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState("signIn"); // "signIn" | "signUp" | "resetPassword"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null); // { userId } while awaiting the user's choice
  const [resetSent, setResetSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSyncUserId(data.session?.user?.id ?? null);
      setAuthLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSyncUserId(newSession?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Catches BOTH the password-reset link and the signup-confirmation link,
  // whether the app was already running (warm) or opened fresh by tapping
  // the link (cold start). Supabase's default project Site URL is
  // http://localhost:3000 — without this handler, tapping either email link
  // just opens a dead localhost page instead of returning to the app.
  useEffect(() => {
    const tryHandle = async (url) => {
      const tokens = parseAuthTokensFromUrl(url);
      if (!tokens) return;
      const { data, error: err } = await supabase.auth.setSession(tokens);
      if (err) return;
      if (tokens.type === "recovery") {
        setError("");
        setResetDone(false);
        setMode("resetPassword");
        setModalVisible(true);
      } else {
        // Signup confirmation (or any other non-recovery link type) — the
        // account is now verified and signed in. No extra modal step needed;
        // reconcile local/remote data exactly like a fresh sign-up.
        setModalVisible(false);
        if (data.user?.id) await reconcileAfterAuth(data.user.id, true);
      }
    };
    Linking.getInitialURL().then(tryHandle);
    const sub = Linking.addEventListener("url", ({ url }) => tryHandle(url));
    return () => sub.remove();
  }, []);

  // Runs once right after an explicit sign-in/sign-up action (not on every
  // app-boot session restore) to reconcile this device's local data with
  // whatever's already in the account.
  const reconcileAfterAuth = useCallback(async (userId, isNewSignUp) => {
    if (isNewSignUp) {
      await pushAllFromLocal(userId); // adopt this device's guest data as the account's starting point
      setSyncVersion(v => v + 1);
      return;
    }
    const [remoteHasData, localHasData] = await Promise.all([hasAnyRemoteData(userId), localHasGuestData()]);
    if (!remoteHasData) {
      await pushAllFromLocal(userId);
    } else if (!localHasData) {
      await pullAllToLocal(userId);
    } else {
      setConflict({ userId }); // both sides have real data — ask, don't guess
      return;
    }
    setSyncVersion(v => v + 1);
  }, []);

  const resolveConflict = useCallback(async (choice) => {
    if (!conflict) return;
    if (choice === "useAccount") await pullAllToLocal(conflict.userId);
    else await pushAllFromLocal(conflict.userId);
    setConflict(null);
    setSyncVersion(v => v + 1);
  }, [conflict]);

  const openAuthModal = useCallback(() => {
    setError("");
    setMode("signIn");
    setResetSent(false);
    setModalVisible(true);
  }, []);
  const closeAuthModal = useCallback(() => setModalVisible(false), []);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signUp") {
        const emailRedirectTo = Linking.createURL("confirm");
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo } });
        if (err) throw err;
        if (data.session) {
          setModalVisible(false);
          await reconcileAfterAuth(data.user.id, true);
        } else {
          // Email confirmation is enabled on the project — no session yet.
          // Tapping the confirmation link is handled by the Linking effect
          // above, which signs them in and closes this modal automatically.
          setError("Check your email to confirm your account — tapping the link will bring you back here, signed in.");
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        setModalVisible(false);
        await reconcileAfterAuth(data.user.id, false);
      }
      setPassword("");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendResetEmail = async () => {
    setError("");
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setSubmitting(true);
    try {
      const redirectTo = Linking.createURL("reset-password");
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (err) throw err;
      setResetSent(true);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  // Called from the "resetPassword" modal step, after tapping the emailed
  // link has already established a temporary recovery session (see the
  // Linking effect above).
  const submitNewPassword = async () => {
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== newPassword2) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setNewPassword("");
      setNewPassword2("");
      setResetDone(true);
      // The recovery session is now a real signed-in session — reconcile
      // local/remote data exactly as a normal sign-in would.
      await reconcileAfterAuth(data.user.id, false);
      setTimeout(() => setModalVisible(false), 1200);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Local data is left exactly as-is — signing out only ends the Supabase
    // session, so guest mode keeps working immediately with the last-synced
    // data still on the device.
  }, []);

  // For shared/borrowed devices — signing out normally leaves everything on
  // the device (see signOut above) so a quick sign-out-and-back-in doesn't
  // lose anything. This is the explicit opt-in for "someone else uses this
  // device next" — wipes journal/prayers/highlights/bookmarks/plan progress/
  // chat history from AsyncStorage too, not just the Supabase session.
  const signOutAndClearDevice = useCallback(async () => {
    await supabase.auth.signOut();
    await clearAllAppData();
    setSyncVersion(v => v + 1);
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    authLoaded,
    syncVersion,
    openAuthModal,
    signOut,
    signOutAndClearDevice,
  }), [session, authLoaded, syncVersion, openAuthModal, signOut, signOutAndClearDevice]);

  const { colors, textScale } = useTheme();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  return (
    <AuthCtx.Provider value={value}>
      {children}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeAuthModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAuthModal} />
          <View style={s.sheet}>
            {mode === "resetPassword" ? (
              <>
                <Text style={s.title}>Set a New Password</Text>
                <Text style={s.subtitle}>You followed a password reset link — choose a new password to finish signing in.</Text>

                <TextInput
                  style={s.input}
                  placeholder="New password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TextInput
                  style={s.input}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={newPassword2}
                  onChangeText={setNewPassword2}
                />

                {!!error && <Text style={s.errorText}>{error}</Text>}
                {resetDone && <Text style={s.successText}>Password updated — you're signed in.</Text>}

                <Pressable style={s.primaryBtn} onPress={submitNewPassword} disabled={submitting}>
                  {submitting ? <ActivityIndicator color={colors.accentContrast} /> : (
                    <Text style={s.primaryBtnText}>Update Password</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.title}>{mode === "signUp" ? "Create Account" : "Sign In"}</Text>
                <Text style={s.subtitle}>Syncs your journal, prayers, highlights, bookmarks, and plan progress across devices. Optional — the app fully works without an account.</Text>

                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextInput
                  style={s.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                {!!error && <Text style={s.errorText}>{error}</Text>}
                {resetSent && <Text style={s.successText}>Reset email sent — check your inbox.</Text>}

                <Pressable style={s.primaryBtn} onPress={submit} disabled={submitting}>
                  {submitting ? <ActivityIndicator color={colors.accentContrast} /> : (
                    <Text style={s.primaryBtnText}>{mode === "signUp" ? "Create Account" : "Sign In"}</Text>
                  )}
                </Pressable>

                {mode === "signIn" && (
                  <Pressable onPress={sendResetEmail}><Text style={s.linkText}>Forgot password?</Text></Pressable>
                )}

                <Pressable onPress={() => { setMode(mode === "signUp" ? "signIn" : "signUp"); setError(""); }}>
                  <Text style={s.linkText}>
                    {mode === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable onPress={closeAuthModal} style={{ marginTop: 14 }}>
              <Text style={s.cancelText}>{mode === "resetPassword" ? "Cancel" : "Continue as guest"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!conflict} animationType="fade" transparent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.title}>Two copies of your data</Text>
            <Text style={s.subtitle}>
              This device has journal/prayer/highlight data saved locally, and your account already has its own
              synced data from somewhere else. Which one should win? (The other copy won't be deleted from wherever it currently lives — just not used here.)
            </Text>
            <Pressable style={s.primaryBtn} onPress={() => resolveConflict("useAccount")}>
              <Text style={s.primaryBtnText}>Use my account's data</Text>
            </Pressable>
            <Pressable style={[s.primaryBtn, { marginTop: 10, backgroundColor: colors.bgSunken, borderWidth: 1, borderColor: colors.border }]} onPress={() => resolveConflict("useDevice")}>
              <Text style={[s.primaryBtnText, { color: colors.text }]}>Use this device's data</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AuthCtx.Provider>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: { backgroundColor: c.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34 },
    title: { color: c.text, fontSize: 18 * textScale, fontWeight: "700", marginBottom: 6 },
    subtitle: { color: c.textMuted, fontSize: 12.5 * textScale, lineHeight: 18 * textScale, marginBottom: 16 },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.text, backgroundColor: c.bg, marginBottom: 10 },
    errorText: { color: c.danger, fontSize: 12.5 * textScale, marginBottom: 10 },
    successText: { color: c.accent, fontSize: 12.5 * textScale, marginBottom: 10 },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 4 },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 14 * textScale },
    linkText: { color: c.accent, fontSize: 12.5 * textScale, textAlign: "center", marginTop: 14 },
    cancelText: { color: c.textMuted, fontSize: 12.5 * textScale, textAlign: "center" },
  });
}
