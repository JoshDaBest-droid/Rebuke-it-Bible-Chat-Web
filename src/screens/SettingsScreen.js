import React, { useMemo } from "react";
import { View, Text, Pressable, Switch, ScrollView, StyleSheet, Alert } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { THEME_SWATCHES, FONT_COLORS } from "../theme/themes";
import { clearAllAppData } from "../storage/storage";

const TEXT_SCALES = [
  { label: "Small", value: 0.9 },
  { label: "Default", value: 1 },
  { label: "Large", value: 1.15 },
  { label: "X-Large", value: 1.35 },
];

export default function SettingsScreen({ navigation }) {
  const { colors, textScale, pack, mode, contrast, reducedMotion, fontColor, setThemePack, setMode, setTextScale, setContrast, setReducedMotion, setFontColor } = useTheme();
  const { user, openAuthModal, signOut, signOutAndClearDevice, deleteAccount } = useAuth();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const confirmSignOut = () => {
    Alert.alert("Sign out", "Your data stays on this device — signing out just ends your account session.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  // For a shared/borrowed device — wipes journal, prayers, highlights,
  // bookmarks, and Guide history from THIS device, not just the account
  // (nothing already synced to your account is deleted).
  const confirmSignOutAndClear = () => {
    Alert.alert(
      "Sign out and clear this device",
      "This signs you out AND permanently deletes your journal, prayers, highlights, bookmarks, and Guide history from this device. Anything already synced to your account is untouched — this only clears what's stored locally, for the next person who uses this device. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out & Clear", style: "destructive", onPress: signOutAndClearDevice },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and everything synced to it — journal, prayers, highlights, bookmarks, and Guide history. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              Alert.alert("Account deleted", "Your account and synced data have been permanently deleted.");
            } catch (e) {
              Alert.alert("Couldn't delete account", e.message || "Something went wrong — please try again.");
            }
          },
        },
      ]
    );
  };

  const confirmClear = () => {
    Alert.alert(
      "Clear local data",
      "This clears all journal entries, highlights, bookmarks, and saved prayers stored on this device. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => { await clearAllAppData(); Alert.alert("Local data cleared"); } },
      ]
    );
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={s.card}>
        <Text style={s.badge}>ACCOUNT</Text>
        {user ? (
          <>
            <Text style={s.bodyText}>Signed in as {user.email}. Your journal, prayers, highlights, bookmarks, and preferences sync to this account.</Text>
            <View style={s.btnRow}>
              <Pressable style={s.dangerBtn} onPress={confirmSignOut}>
                <Text style={s.dangerBtnText}>Sign Out</Text>
              </Pressable>
              <Pressable style={s.dangerBtn} onPress={confirmSignOutAndClear}>
                <Text style={s.dangerBtnText}>Sign Out & Clear This Device</Text>
              </Pressable>
            </View>
            <Text style={s.mutedText}>Using a shared or borrowed device? "Sign Out & Clear This Device" also wipes your journal, prayers, and Guide history from it.</Text>
            <Pressable style={[s.dangerBtn, s.deleteAccountBtn]} onPress={confirmDeleteAccount}>
              <Text style={[s.dangerBtnText, s.deleteAccountBtnText]}>Delete Account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.bodyText}>Sign in to sync your journal, prayers, highlights, and bookmarks across devices. Completely optional — everything already works without an account.</Text>
            <Pressable style={s.primaryBtn} onPress={openAuthModal}>
              <Text style={s.primaryBtnText}>Sign In / Create Account</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.badge}>THEME PACK</Text>
        <View style={s.swatchRow}>
          {THEME_SWATCHES.map(t => (
            <Pressable key={t.id} style={[s.swatch, { backgroundColor: t.color }, pack === t.id && s.swatchSelected]} onPress={() => setThemePack(t.id)}>
              <Text style={s.swatchText}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Dark mode</Text>
          <Switch value={mode === "dark"} onValueChange={(v) => setMode(v ? "dark" : "light")} trackColor={{ true: colors.accent }} />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.badge}>FONT COLOR</Text>
        <Text style={s.bodyText}>Overrides the reading text color on top of your theme pack.</Text>
        <View style={s.swatchRow}>
          {FONT_COLORS.map(f => (
            <Pressable
              key={f.label}
              style={[s.fontSwatch, { backgroundColor: f.swatch }, fontColor === f.id && s.swatchSelected]}
              onPress={() => setFontColor(f.id)}
              accessibilityLabel={f.label}
            >
              {fontColor === f.id && <Text style={s.fontSwatchCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
        <Text style={s.mutedText}>{FONT_COLORS.find(f => f.id === fontColor)?.label ?? "Theme Default"}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.badge}>ACCESSIBILITY</Text>
        <Text style={s.rowLabel}>Text size</Text>
        <View style={s.scaleRow}>
          {TEXT_SCALES.map(o => (
            <Pressable key={o.label} style={[s.scalePill, textScale === o.value && s.scalePillActive]} onPress={() => setTextScale(o.value)}>
              <Text style={[s.scalePillText, textScale === o.value && s.scalePillTextActive]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>High contrast</Text>
          <Switch value={contrast} onValueChange={setContrast} trackColor={{ true: colors.accent }} />
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Reduce motion</Text>
          <Switch value={reducedMotion} onValueChange={setReducedMotion} trackColor={{ true: colors.accent }} />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.badge}>PRIVACY</Text>
        <Text style={s.bodyText}>Your journal entries, highlights, bookmarks, and saved prayers are always stored on this device. If you sign in, they also sync to your account so you can access them elsewhere — otherwise nothing leaves this device. Rebuke it: Bible Chat is free forever, with no ads and no data resale.</Text>
        <Pressable style={s.dangerBtn} onPress={confirmClear}>
          <Text style={s.dangerBtnText}>Clear all local data</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate("Home")} style={s.closeRow}>
        <Text style={s.closeText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    card: { backgroundColor: c.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 16 },
    badge: { color: c.textMuted, fontSize: 11 * textScale, fontWeight: "700", letterSpacing: 0.6, marginBottom: 12 },
    swatchRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    swatch: { width: 64, height: 64, borderRadius: 14, justifyContent: "flex-end", padding: 6, borderWidth: 2, borderColor: "transparent" },
    swatchSelected: { borderColor: c.accent },
    swatchText: { color: "#fff", fontSize: 10 },
    fontSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
    fontSwatchCheck: { color: "#fff", fontSize: 14, fontWeight: "700" },
    mutedText: { color: c.textMuted, fontSize: 12 * textScale },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    rowLabel: { color: c.text, fontSize: 14 * textScale },
    scaleRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
    scalePill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: c.bgSunken },
    scalePillActive: { backgroundColor: c.accent, borderColor: "transparent" },
    scalePillText: { color: c.text, fontSize: 12 * textScale },
    scalePillTextActive: { color: c.accentContrast, fontWeight: "600" },
    bodyText: { color: c.textMuted, fontSize: 13 * textScale, lineHeight: 19 * textScale, marginBottom: 12 },
    btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    dangerBtn: { borderWidth: 1, borderColor: c.danger, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignSelf: "flex-start" },
    deleteAccountBtn: { marginTop: 4, backgroundColor: c.danger, borderColor: c.danger },
    deleteAccountBtnText: { color: "#fff" },
    dangerBtnText: { color: c.danger, fontSize: 13 * textScale },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    closeRow: { alignItems: "center", paddingVertical: 16 },
    closeText: { color: c.accent, fontSize: 15 * textScale, fontWeight: "600" },
  });
}
